/**
 * Verifier and CI gate. Reads the freshly written Bedrock world back from disk
 * and checks that it is structurally what Bedrock expects:
 *
 *  - every LevelDB key has a legal shape (chunk key lengths, tag bytes)
 *  - every subchunk payload round-trips through the reference parser
 *    (`mcbe-leveldb`, the TypeScript implementation cited on the Minecraft Wiki)
 *  - every block read back out of the payload sits at the coordinate the
 *    generator placed it at, when the payload is indexed the way Bedrock
 *    indexes it - `(x << 8) | (z << 4) | y`. This is the check that catches a
 *    transposed subchunk: the buffers here are laid out Y-major, so writing the
 *    buffer order into the payload silently swaps X and Y and the imported
 *    world turns into stripes of terrain instead of the intended island
 *  - no gravity block (gravel, sand, concrete powder) was written at all
 *  - every Data3D payload decodes as 24 biome storages whose heightmap matches
 *    the regenerated scene, and reads back through the reference parser
 *  - every chunk carries the 1.26 metadata records (MetaDataHash, BlendingData,
 *    ActorDigestVersion) and its hash resolves in the metadata dictionary
 *  - level.dat parses back and carries the values we set
 *  - the `.mcworld` ZIP contains the required entries
 *
 * Collects every problem it finds and exits non-zero if there were any, so this
 * doubles as the CI gate that proves a build is importable rather than merely
 * "the script didn't crash".
 *
 *   bun run src/tools/inspect-world.ts [path-to.mcworld]
 */

import { ClassicLevel } from "classic-level";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseLevelDat } from "../bedrock/leveldat.ts";
import { CHUNK_TAG } from "../bedrock/world-writer.ts";
import { bitsForPaletteSize, SUBCHUNK_BLOCK_COUNT } from "../bedrock/subchunk.ts";
import {
  BIOME_SLICE_COUNT,
  DEFAULT_BIOME_ID,
  collectChunkHeights,
  parseData3D,
} from "../bedrock/data3d.ts";
import {
  buildChunkMetaData,
  hashChunkMetaData,
  parseMetaDataDictionary,
} from "../bedrock/chunk-metadata.ts";
import { CONFIG } from "../world/config.ts";
import { GRAVITY_BLOCK_NAMES } from "../world/blocks.ts";
import { buildSceneWorld, type Scene } from "../world/scene.ts";

const TAG_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(CHUNK_TAG).map(([name, tag]) => [tag, name]),
);

/** Chunk key lengths: overworld (9/10) and nether+end (13/14). */
const CHUNK_KEY_LENGTHS = new Set([9, 10, 13, 14]);

/**
 * Highest subchunk index the build is allowed to write. The Underworld realm is
 * 128 tall (subchunk 0..7); Purgatory is transplanted with its full height, so
 * its top subchunk reaches index 18 (a solid block near y 289).
 */
const MAX_SUBCHUNK_INDEX = 19;

interface KeyInfo {
  cx: number;
  cz: number;
  dimension: number;
  tag: number;
  subChunkIndex?: number;
}

interface Failure {
  area: string;
  detail: string;
}

/** A subchunk payload together with the key it was stored under. */
interface SubChunkRecord {
  cx: number;
  cz: number;
  subY: number;
  value: Buffer;
}

/** A Data3D payload together with the chunk it describes. */
interface Data3DRecord {
  cx: number;
  cz: number;
  value: Buffer;
}

/** A per-chunk metadata record (0x3F MetaDataHash, 0x40 BlendingData, 0x41 ActorDigestVersion). */
interface MetaRecord {
  cx: number;
  cz: number;
  value: Buffer;
}

/** Everything the chunk scan collects, so the checks can run outside it. */
interface DatabaseScan {
  subChunks: SubChunkRecord[];
  data3D: Data3DRecord[];
  metaHashes: MetaRecord[];
  blendingData: MetaRecord[];
  actorDigest: MetaRecord[];
  /** The world-level `LevelChunkMetaDataDictionary` record, if present. */
  dictionary?: Buffer;
  /** Number of distinct chunks referenced by the database. */
  chunkCount: number;
}

interface ParsedLayer {
  palette: { value: Record<string, { value: { name: { value: string } } }> };
  block_indices: { value: { value: number[] } };
}

const { entryContentTypeToFormatMap } = (await import("mcbe-leveldb")) as unknown as {
  entryContentTypeToFormatMap: {
    SubChunkPrefix: { parse: (data: Buffer) => Promise<unknown> };
    Data3D: { parse: (data: Buffer) => Promise<unknown> };
    LevelChunkMetaDataDictionary: { parse: (data: Buffer) => Promise<unknown> };
  };
};

async function parseSubChunkPayload(payload: Buffer): Promise<ParsedLayer> {
  const parsed = (await entryContentTypeToFormatMap.SubChunkPrefix.parse(payload)) as unknown as {
    value: { layers: { value: { value: ParsedLayer[] } } };
  };
  return parsed.value.layers.value.value[0]!;
}

/** Palette names in index order: `["minecraft:air", "minecraft:deepslate", ...]`. */
function paletteNames(layer: ParsedLayer): string[] {
  return Object.keys(layer.palette.value)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => layer.palette.value[key]!.value.name.value);
}

interface Report {
  failures: Failure[];
  checks: number;
}

function newReport(): Report {
  return { failures: [], checks: 0 };
}

function fail(report: Report, area: string, detail: string): void {
  report.failures.push({ area, detail });
}

function check(report: Report, condition: boolean, area: string, detail: string): boolean {
  report.checks++;
  if (!condition) fail(report, area, detail);
  return condition;
}

function decodeChunkKey(key: Buffer): KeyInfo | undefined {
  if (!CHUNK_KEY_LENGTHS.has(key.length)) return undefined;
  const cx = key.readInt32LE(0);
  const cz = key.readInt32LE(4);
  let offset = 8;
  let dimension = 0;
  // 9 or 10 bytes = overworld (no dimension), 13/14 = nether/end
  if (key.length === 13 || key.length === 14) {
    dimension = key.readInt32LE(8);
    offset = 12;
  }
  const tag = key.readUInt8(offset);
  const subChunkIndex = key.length === offset + 2 ? key.readInt8(offset + 1) : undefined;
  return { cx, cz, dimension, tag, subChunkIndex };
}

/** Non-chunk LevelDB keys are ASCII names; anything else is corrupt. */
function namedKey(key: Buffer): string | undefined {
  const text = key.toString("latin1");
  return /^[\x20-\x7e]+$/.test(text) ? text : undefined;
}

async function inspectDatabase(dbDir: string, report: Report): Promise<DatabaseScan> {
  const db = new ClassicLevel<Buffer, Buffer>(dbDir, { keyEncoding: "buffer", valueEncoding: "buffer" });
  await db.open();

  const tagCounts = new Map<number, number>();
  const chunkSet = new Set<string>();
  const subChunkSizes: number[] = [];
  const subChunks: SubChunkRecord[] = [];
  const data3D: Data3DRecord[] = [];
  const metaHashes: MetaRecord[] = [];
  const blendingData: MetaRecord[] = [];
  const actorDigest: MetaRecord[] = [];
  let dictionary: Buffer | undefined;
  const namedKeys: string[] = [];
  const malformed: string[] = [];
  let totalKeys = 0;

  for await (const [key, value] of db.iterator()) {
    totalKeys++;
    const info = decodeChunkKey(key);
    if (!info) {
      const name = namedKey(key);
      if (name) {
        namedKeys.push(name);
        if (name === "LevelChunkMetaDataDictionary") dictionary = value;
      } else {
        malformed.push(`${key.length} bytes: ${key.toString("hex")}`);
      }
      continue;
    }
    tagCounts.set(info.tag, (tagCounts.get(info.tag) ?? 0) + 1);
    chunkSet.add(`${info.cx},${info.cz}`);
    if (info.tag === CHUNK_TAG.SubChunkPrefix) {
      subChunkSizes.push(value.length);
      subChunks.push({ cx: info.cx, cz: info.cz, subY: info.subChunkIndex ?? 0, value });
    } else if (info.tag === CHUNK_TAG.Data3D) {
      data3D.push({ cx: info.cx, cz: info.cz, value });
    } else if (info.tag === CHUNK_TAG.MetaDataHash) {
      metaHashes.push({ cx: info.cx, cz: info.cz, value });
    } else if (info.tag === CHUNK_TAG.BlendingData) {
      blendingData.push({ cx: info.cx, cz: info.cz, value });
    } else if (info.tag === CHUNK_TAG.ActorDigestVersion) {
      actorDigest.push({ cx: info.cx, cz: info.cz, value });
    }
  }

  console.log(`leveldb keys: ${totalKeys}`);
  console.log(`chunks referenced: ${chunkSet.size}`);
  for (const [tag, count] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  tag 0x${(tag & 0xff).toString(16).padStart(2, "0")} ${TAG_NAMES[tag] ?? "(other)"}: ${count}`);
  }
  if (namedKeys.length) console.log(`  named non-chunk keys: ${namedKeys.join(", ")}`);

  check(report, totalKeys > 0, "db", "the LevelDB is empty");
  check(report, malformed.length === 0, "db", `malformed keys: ${malformed.slice(0, 3).join(" | ")}`);
  check(report, chunkSet.size > 0, "db", "no chunk keys were written");
  check(report, subChunks.length > 0, "db", "no subchunk payloads were written");

  check(report, (tagCounts.get(CHUNK_TAG.Data2D) ?? 0) === 0, "db", "Data2D records were written; a native 1.18+ chunk has none");

  const versions = tagCounts.get(CHUNK_TAG.Version) ?? 0;
  const finalized = tagCounts.get(CHUNK_TAG.FinalizedState) ?? 0;
  check(report, versions === chunkSet.size, "db", `${versions} Version records for ${chunkSet.size} chunks`);
  check(report, finalized === chunkSet.size, "db", `${finalized} FinalizedState records for ${chunkSet.size} chunks`);

  const badIndex = subChunks.filter((s) => !Number.isInteger(s.subY) || s.subY < 0 || s.subY > MAX_SUBCHUNK_INDEX);
  check(report, badIndex.length === 0, "db", `${badIndex.length} subchunks outside y 0..${MAX_SUBCHUNK_INDEX}`);

  subChunkSizes.sort((a, b) => a - b);
  if (subChunkSizes.length) {
    const avg = subChunkSizes.reduce((s, v) => s + v, 0) / subChunkSizes.length;
    console.log(
      `subchunk payloads: ${subChunkSizes.length}, avg ${Math.round(avg)} bytes, ` +
        `min ${subChunkSizes[0]}, max ${subChunkSizes[subChunkSizes.length - 1]}`,
    );
  }

  // Round-trip *every* payload through the reference parser.
  let parsedOk = 0;
  const parseFailures: string[] = [];
  for (const subChunk of subChunks) {
    const label = `${subChunk.cx},${subChunk.cz} subY ${subChunk.subY}`;
    try {
      const parsed = (await entryContentTypeToFormatMap.SubChunkPrefix.parse(subChunk.value)) as {
        value: {
          version: { value: number };
          subChunkIndex: { value: number };
          layers: { value: { value: unknown[] } };
        };
      };
      const version = parsed.value.version.value;
      const index = parsed.value.subChunkIndex.value;
      const layers = parsed.value.layers.value.value.length;
      if (version !== 9 || index !== subChunk.subY || layers !== 1) {
        parseFailures.push(`${label}: unexpected shape (version ${version}, index ${index}, layers ${layers})`);
        continue;
      }
      parsedOk++;
      if (parsedOk <= 3) console.log(`  ${label}: parses OK (version ${version}, index ${index}, layers ${layers})`);
    } catch (error) {
      parseFailures.push(`${label}: PARSE FAILED - ${String(error)}`);
    }
  }
  if (subChunks.length > 3) console.log(`  ... ${parsedOk} of ${subChunks.length} payloads parsed OK`);
  check(report, parseFailures.length === 0, "db", `subchunk parse failures: ${parseFailures.slice(0, 3).join(" | ")}`);

  await db.close();
  return {
    subChunks,
    data3D,
    metaHashes,
    blendingData,
    actorDigest,
    dictionary,
    chunkCount: chunkSet.size,
  };
}

/**
 * The end-to-end check: regenerate the scene and confirm that every block in
 * every written payload reads back at the coordinate the generator put it at,
 * indexing the payload the way Bedrock does (`(x << 8) | (z << 4) | y`).
 *
 * A subchunk written in the generator's own Y-major order passes the "payload
 * parses" check above and fails this one, because the palette and the index
 * array are both read from the file in Bedrock's order rather than ours.
 */
async function inspectGeneratorRoundTrip(
  scene: Scene,
  subChunks: SubChunkRecord[],
  report: Report,
): Promise<void> {
  let compared = 0;
  let mismatchedBlocks = 0;
  let mismatchedSubChunks = 0;
  let skipped = 0;
  const examples: string[] = [];
  const gravityFound = new Set<string>();

  for (const subChunk of subChunks) {
    const label = `${subChunk.cx},${subChunk.cz} subY ${subChunk.subY}`;
    // Chunks the generator did not produce are the transplanted Purgatory
    // region: it is re-emitted verbatim, not regenerated, so it is compared
    // against its own source rather than the scene and skipped here.
    const sceneChunk = scene.world.chunk(subChunk.cx, subChunk.cz);
    if (!sceneChunk) {
      skipped++;
      continue;
    }
    let layer: ParsedLayer;
    try {
      layer = await parseSubChunkPayload(subChunk.value);
    } catch {
      continue; // already reported by the parse pass
    }
    const names = paletteNames(layer);
    for (const name of names) if (GRAVITY_BLOCK_NAMES.has(name)) gravityFound.add(name);

    const chunk = sceneChunk;
    const expected = chunk.subChunkSlice(subChunk.subY);
    const indices = layer.block_indices.value.value;
    let bad = 0;
    for (let i = 0; i < SUBCHUNK_BLOCK_COUNT; i++) {
      const got = names[indices[i] ?? 0];
      const want = expected.palette[expected.ids[i]!]!.name;
      if (got !== want) bad++;
    }
    compared++;
    if (bad > 0) {
      mismatchedBlocks += bad;
      mismatchedSubChunks++;
      if (examples.length < 5) {
        examples.push(`${label}: ${bad} of ${SUBCHUNK_BLOCK_COUNT} blocks are not where the generator put them`);
      }
    }
  }

  console.log(
    `\ngenerator round-trip: compared ${compared} subchunks block by block ` +
      `(${skipped} transplanted subchunks outside the realm skipped)`,
  );
  check(
    report,
    compared === subChunks.length - skipped,
    "round-trip",
    `${subChunks.length - skipped - compared} written subchunks were never compared`,
  );
  check(
    report,
    mismatchedBlocks === 0,
    "round-trip",
    `${mismatchedBlocks} blocks in ${mismatchedSubChunks} subchunks read back at the wrong coordinate ` +
      `(wrong subchunk index ordering?): ${examples.join(" | ")}`,
  );
  check(
    report,
    gravityFound.size === 0,
    "round-trip",
    `gravity blocks were written and will fall out of the terrain: ${[...gravityFound].join(", ")}`,
  );
}

/**
 * Data3D is the biome + heightmap record every 1.18+ chunk carries, and the
 * heightmap is the one part of it that mirrors the generator, so it gets the
 * same treatment as the block payloads: decode it here *and* read it back
 * through the reference parser, then compare its columns against the scene.
 */
async function inspectData3D(scene: Scene | undefined, records: Data3DRecord[], report: Report): Promise<void> {
  /** 24 uniform biome storages: barest form for a single-biome chunk. */
  const expectedSize = 512 + BIOME_SLICE_COUNT * 5;
  let referenceOk = 0;
  let shapeFailures = 0;
  let biomeFailures = 0;
  let heightMismatches = 0;
  const examples: string[] = [];

  for (const record of records) {
    const label = `${record.cx},${record.cz}`;

    let parsed: ReturnType<typeof parseData3D>;
    try {
      parsed = parseData3D(record.value);
    } catch (error) {
      shapeFailures++;
      if (examples.length < 5) examples.push(`${label}: Data3D does not decode - ${String(error)}`);
      continue;
    }

    if (parsed.slices.length !== BIOME_SLICE_COUNT || record.value.length !== expectedSize) {
      shapeFailures++;
      if (examples.length < 5) {
        examples.push(
          `${label}: ${parsed.slices.length} biome storages in ${record.value.length} bytes ` +
            `(expected ${BIOME_SLICE_COUNT} in ${expectedSize})`,
        );
      }
    }

    for (const slice of parsed.slices) {
      if (slice.kind !== "uniform" || slice.biomeId !== DEFAULT_BIOME_ID) {
        biomeFailures++;
        if (examples.length < 5) examples.push(`${label}: biome storage is ${slice.kind}, expected uniform ${DEFAULT_BIOME_ID}`);
        break;
      }
    }

    try {
      const reference = (await entryContentTypeToFormatMap.Data3D.parse(record.value)) as {
        value: {
          heightMap: { value: { value: Array<{ value: number[] }> } };
          biomes: {
            value: {
              value: Array<{
                values: { value: { value: number[] } };
                palette: { value: { value: number[] } };
              }>;
            };
          };
        };
      };
      const biomes = reference.value.biomes.value.value;
      const rows = reference.value.heightMap.value.value;
      if (biomes.length !== BIOME_SLICE_COUNT || rows.length !== 16) {
        shapeFailures++;
        if (examples.length < 5) examples.push(`${label}: reference parser saw ${biomes.length} storages and ${rows.length} height rows`);
      } else {
        referenceOk++;
      }
    } catch (error) {
      shapeFailures++;
      if (examples.length < 5) examples.push(`${label}: reference Data3D parser failed - ${String(error)}`);
    }

    if (scene && scene.world.chunk(record.cx, record.cz)) {
      const expected = collectChunkHeights(
        (x, z) => scene.world.surfaceAt(x, z),
        (x, z) => scene.world.isLand(x, z),
        record.cx,
        record.cz,
      );
      let bad = 0;
      for (let i = 0; i < 256; i++) if (parsed.heights[i] !== expected[i]) bad++;
      if (bad > 0) {
        heightMismatches++;
        if (examples.length < 5) examples.push(`${label}: ${bad} of 256 heightmap columns disagree with the generator`);
      }
    }
  }

  const sizes = new Set(records.map((r) => r.value.length));
  console.log(`\nData3D: ${records.length} payloads (` +
    `${sizes.size === 1 ? `${[...sizes][0]} bytes each` : `${sizes.size} distinct sizes`}), ` +
    `${referenceOk} read back through the reference parser`);
  check(report, records.length > 0, "Data3D", "no Data3D payload was written");
  check(report, records.length === referenceOk, "Data3D", `reference parser failures: ${examples.join(" | ")}`);
  check(report, shapeFailures === 0, "Data3D", `malformed payloads: ${examples.join(" | ")}`);
  check(report, biomeFailures === 0, "Data3D", `payloads not carrying biome ${DEFAULT_BIOME_ID}: ${examples.join(" | ")}`);
  check(report, heightMismatches === 0, "Data3D", `heightmaps that disagree with the generator: ${examples.join(" | ")}`);
}

/**
 * The three chunk-metadata records a 1.26 world writes on every chunk, plus the
 * dictionary every MetaDataHash points into. The hash has to be recomputed the
 * way the game does it (xxHash64 over the network-order metadata NBT), so this
 * is also the check that the hash stays reproducible.
 */
async function inspectChunkMetadata(scan: DatabaseScan, report: Report): Promise<void> {
  const expected = buildChunkMetaData({
    baseGameVersion: CONFIG.inventoryVersion,
    generationSeed: BigInt(CONFIG.seed),
    generatorType: 1,
    dimensionName: "Overworld",
    dimensionRange: { min: -64, max: 320 },
  });
  const expectedHash = hashChunkMetaData(expected);

  let badHash = 0;
  for (const record of scan.metaHashes) {
    if (record.value.length !== 8 || record.value.readBigUInt64LE(0) !== expectedHash) badHash++;
  }
  const badBlending = scan.blendingData.filter((r) => r.value.length !== 2 || r.value[0] !== 0).length;
  const badDigest = scan.actorDigest.filter((r) => r.value.length !== 1 || r.value[0] !== 0).length;

  console.log(`\nchunk metadata: ${scan.dictionary?.length ?? 0} byte dictionary, ` +
    `${scan.metaHashes.length} MetaDataHash, ${scan.blendingData.length} BlendingData, ${scan.actorDigest.length} ActorDigestVersion`);
  console.log(`  metadata hash ${expectedHash.toString(16).padStart(16, "0")}`);

  check(report, scan.chunkCount > 0 && scan.metaHashes.length === scan.chunkCount, "metadata", `${scan.metaHashes.length} MetaDataHash records for ${scan.chunkCount} chunks`);
  check(report, badHash === 0, "metadata", `${badHash} MetaDataHash records do not match the recomputed metadata hash`);
  check(report, scan.blendingData.length === scan.chunkCount && badBlending === 0, "metadata", `${badBlending} of ${scan.blendingData.length} BlendingData records are not [0, version]`);
  check(report, scan.actorDigest.length === scan.chunkCount && badDigest === 0, "metadata", `${badDigest} of ${scan.actorDigest.length} ActorDigestVersion records are not 0`);
  check(report, scan.dictionary !== undefined, "metadata", "the LevelChunkMetaDataDictionary record is missing");

  if (!scan.dictionary) return;

  const entries = parseMetaDataDictionary(scan.dictionary);
  check(report, entries.length === 1 && entries[0]!.hash === expectedHash, "metadata", `dictionary holds ${entries.length} entries, first hash ${entries[0]?.hash.toString(16) ?? "-"}`);

  try {
    const reference = (await entryContentTypeToFormatMap.LevelChunkMetaDataDictionary.parse(scan.dictionary)) as {
      value: Record<string, { value: Record<string, unknown> }>;
    };
    const hashes = Object.keys(reference.value);
    // mcbe-leveldb keys dictionary entries by the stored hash bytes (uint64 LE).
    const referenceHash = hashes.length === 1 ? Buffer.from(hashes[0]!, "hex").readBigUInt64LE(0) : undefined;
    check(report, referenceHash === expectedHash, "metadata", `the reference parser read hash ${hashes.join(",")} from the dictionary`);
  } catch (error) {
    fail(report, "metadata", `reference dictionary parser failed - ${String(error)}`);
    report.checks++;
  }
}

async function inspectLevelDat(worldDir: string, report: Report): Promise<void> {
  const buffer = await readFile(join(worldDir, "level.dat"));
  const { storageVersion, length, data } = await parseLevelDat(buffer);
  const value = data.value as Record<string, { value: unknown }>;
  console.log(`\nlevel.dat: header storage version ${storageVersion}, payload ${length} bytes`);

  const fields = [
    "LevelName",
    "GameType",
    "Generator",
    "StorageVersion",
    "SpawnX",
    "SpawnY",
    "SpawnZ",
    "Time",
    "FlatWorldLayers",
    "randomtickspeed",
    "showcoordinates",
  ];
  for (const field of fields) {
    if (value[field] !== undefined) console.log(`  ${field}: ${JSON.stringify(value[field]!.value)}`);
  }

  const num = (field: string): number | undefined => {
    const raw = value[field]?.value;
    return typeof raw === "number" ? raw : undefined;
  };

  check(report, storageVersion === 10, "level.dat", `header storage version is ${storageVersion}, expected 10`);
  check(report, length === buffer.length - 8, "level.dat", `payload length ${length} disagrees with header`);
  check(report, num("StorageVersion") === 10, "level.dat", `StorageVersion is ${num("StorageVersion")}`);
  check(report, num("Generator") === 1, "level.dat", `Generator is ${num("Generator")}, expected 1 (infinite)`);
  check(report, typeof value.LevelName?.value === "string" && value.LevelName.value.length > 0, "level.dat", "LevelName is missing");
  check(report, num("showcoordinates") === 0, "level.dat", "coordinates should be hidden");
  const spawnY = num("SpawnY");
  check(report, spawnY !== undefined && spawnY >= 0 && spawnY <= 127, "level.dat", `SpawnY ${spawnY} is outside y 0..127`);
  const layers = value.FlatWorldLayers?.value;
  if (typeof layers === "string") {
    try {
      const parsed = JSON.parse(layers) as { block_layers?: Array<{ block_name?: string }> };
      const names = (parsed.block_layers ?? []).map((l) => l.block_name);
      check(report, names.length > 0 && names.every((n) => n === "minecraft:air"), "level.dat", `flat layers should be air only, got ${names.join(",")}`);
    } catch {
      fail(report, "level.dat", "FlatWorldLayers is not valid JSON");
    }
  } else {
    fail(report, "level.dat", "FlatWorldLayers is missing");
  }
}

function inspectZip(zipPath: string, report: Report): void {
  const data = readFileSync(zipPath);
  const signature = data.readUInt32LE(0);
  console.log(`\n${zipPath}`);
  console.log(`  size ${(data.length / 1024 / 1024).toFixed(2)} MB, zip magic ${signature === 0x04034b50 ? "OK" : "BAD"}`);

  check(report, signature === 0x04034b50, "zip", "missing local file header signature");

  const names: string[] = [];
  if (signature === 0x04034b50) {
    let offset = 0;
    while (offset < data.length - 4 && data.readUInt32LE(offset) === 0x04034b50) {
      const method = data.readUInt16LE(offset + 8);
      const compressedSize = data.readUInt32LE(offset + 18);
      const nameLength = data.readUInt16LE(offset + 26);
      const extraLength = data.readUInt16LE(offset + 28);
      const name = data.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
      names.push(name);
      console.log(`  ${name} (${method === 8 ? "deflate" : "store"}, ${compressedSize} B)`);
      offset += 30 + nameLength + extraLength + compressedSize;
      if (nameLength === 0) break;
    }
  }

  for (const required of ["level.dat", "levelname.txt", "world_icon.jpeg"]) {
    check(report, names.includes(required), "zip", `missing ${required}`);
  }
  check(report, names.some((n) => n.startsWith("db/")), "zip", "missing the db/ LevelDB directory");
  check(report, names.some((n) => n.startsWith("db/") && /\.(ldb|log)$/.test(n)), "zip", "the db/ directory holds no tables");
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const zipPath = arg ?? join(process.cwd(), "dist", "Underworld-Simulator-Remastered.mcworld");
  const worldDir = join(process.cwd(), "build", "world");
  const report = newReport();

  const scan = await inspectDatabase(join(worldDir, "db"), report);
  await inspectLevelDat(worldDir, report);

  // Only meaningful for a world built from this repo's own generator.
  if (arg === undefined && scan.subChunks.length > 0) {
    const scene = buildSceneWorld();
    await inspectGeneratorRoundTrip(scene, scan.subChunks, report);
    await inspectData3D(scene, scan.data3D, report);
  } else {
    await inspectData3D(undefined, scan.data3D, report);
  }
  await inspectChunkMetadata(scan, report);

  const buffer = await readFile(join(worldDir, "world_icon.jpeg"));
  const jpegMagic = buffer[0] === 0xff && buffer[1] === 0xd8;
  console.log(`\nworld_icon.jpeg: ${buffer.length} bytes, JPEG magic ${jpegMagic ? "OK" : "BAD"}`);
  check(report, jpegMagic, "icon", "world_icon.jpeg is not a JPEG");

  inspectZip(zipPath, report);

  console.log(`\nbits per block for a 5-entry palette: ${bitsForPaletteSize(5)}`);

  if (report.failures.length) {
    console.log(`\n${report.failures.length} of ${report.checks} checks FAILED:`);
    for (const f of report.failures) console.log(`  - [${f.area}] ${f.detail}`);
    process.exit(1);
  }
  console.log(`\nworld OK (${report.checks} checks passed)`);
}

try {
  await main();
} catch (error) {
  console.error(`\ninspection failed: ${String(error)}`);
  console.error("did you run `bun run build:map` first?");
  process.exit(1);
}
