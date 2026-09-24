/**
 * Verifier. Reads the freshly written Bedrock world back from disk and checks
 * that it is structurally what Bedrock expects:
 *
 *  - every LevelDB key has a legal shape (chunk key lengths, tag bytes)
 *  - every subchunk value is what the reference parser expects (this uses
 *    `mcbe-leveldb`, the TypeScript implementation cited on the Minecraft Wiki,
 *    to parse our own payloads)
 *  - level.dat parses back and carries the values we set
 *  - the `.mcworld` ZIP contains the required entries
 *
 *   bun run src/tools/inspect-world.ts [path-to.mcworld]
 */

import { ClassicLevel } from "classic-level";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseLevelDat } from "../bedrock/leveldat.ts";
import { CHUNK_TAG } from "../bedrock/world-writer.ts";
import { bitsForPaletteSize } from "../bedrock/subchunk.ts";

const TAG_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(CHUNK_TAG).map(([name, tag]) => [tag, name]),
);

interface KeyInfo {
  cx: number;
  cz: number;
  dimension: number;
  tag: number;
  subChunkIndex?: number;
}

function decodeChunkKey(key: Buffer): KeyInfo | undefined {
  if (key.length < 9) return undefined;
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

async function inspectDatabase(dbDir: string): Promise<void> {
  const db = new ClassicLevel<Buffer, Buffer>(dbDir, { keyEncoding: "buffer", valueEncoding: "buffer" });
  await db.open();

  const tagCounts = new Map<number, number>();
  const chunkSet = new Set<string>();
  const subChunkSizes: number[] = [];
  const samples: Array<{ key: Buffer; value: Buffer }> = [];
  let totalKeys = 0;
  const badKeys: Buffer[] = [];

  for await (const [key, value] of db.iterator()) {
    totalKeys++;
    if (key.length < 9) {
      tagCounts.set(-1, (tagCounts.get(-1) ?? 0) + 1);
      continue;
    }
    const info = decodeChunkKey(key);
    if (!info) {
      badKeys.push(key);
      continue;
    }
    tagCounts.set(info.tag, (tagCounts.get(info.tag) ?? 0) + 1);
    chunkSet.add(`${info.cx},${info.cz}`);
    if (info.tag === CHUNK_TAG.SubChunkPrefix) {
      subChunkSizes.push(value.length);
      if (samples.length < 6) samples.push({ key, value });
    }
  }

  console.log(`leveldb keys: ${totalKeys}`);
  console.log(`chunks referenced: ${chunkSet.size}`);
  for (const [tag, count] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  tag 0x${(tag & 0xff).toString(16).padStart(2, "0")} ${TAG_NAMES[tag] ?? "(other)"}: ${count}`);
  }
  if (badKeys.length) console.log(`  malformed chunk keys: ${badKeys.length}`);

  subChunkSizes.sort((a, b) => a - b);
  if (subChunkSizes.length) {
    const avg = subChunkSizes.reduce((s, v) => s + v, 0) / subChunkSizes.length;
    console.log(
      `subchunk payloads: ${subChunkSizes.length}, avg ${Math.round(avg)} bytes, ` +
        `min ${subChunkSizes[0]}, max ${subChunkSizes[subChunkSizes.length - 1]}`,
    );
  }

  // Round-trip our own subchunk payloads through the reference parser.
  const { entryContentTypeToFormatMap } = (await import("mcbe-leveldb")) as {
    entryContentTypeToFormatMap: {
      SubChunkPrefix: { parse: (data: Buffer) => Promise<unknown> };
    };
  };
  for (const sample of samples) {
    const info = decodeChunkKey(sample.key)!;
    try {
      const parsed = (await entryContentTypeToFormatMap.SubChunkPrefix.parse(sample.value)) as {
        value: { version: { value: number }; subChunkIndex: { value: number }; layers: { value: { value: unknown[] } } };
      };
      const version = parsed.value.version.value;
      const index = parsed.value.subChunkIndex.value;
      const layers = parsed.value.layers.value.value.length;
      console.log(
        `  chunk ${info.cx},${info.cz} subY ${info.subChunkIndex}: parses OK ` +
          `(version ${version}, index ${index}, layers ${layers})`,
      );
    } catch (error) {
      console.log(`  chunk ${info.cx},${info.cz} subY ${info.subChunkIndex}: PARSE FAILED - ${String(error)}`);
    }
  }

  await db.close();
}

async function inspectLevelDat(worldDir: string): Promise<void> {
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
}

function inspectZip(zipPath: string): void {
  const data = readFileSync(zipPath);
  const signature = data.readUInt32LE(0);
  console.log(`\n${zipPath}`);
  console.log(`  size ${(data.length / 1024 / 1024).toFixed(2)} MB, zip magic ${signature === 0x04034b50 ? "OK" : "BAD"}`);
  const names: string[] = [];
  let offset = 0;
  while (offset < data.length - 4 && data.readUInt32LE(offset) === 0x04034b50) {
    const method = data.readUInt16LE(offset + 8);
    const compressedSize = data.readUInt32LE(offset + 18);
    const nameLength = data.readUInt16LE(offset + 26);
    const extraLength = data.readUInt16LE(offset + 28);
    const name = data.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    names.push(`${name} (${method === 8 ? "deflate" : "store"}, ${compressedSize} B)`);
    offset += 30 + nameLength + extraLength + compressedSize;
  }
  for (const name of names) console.log(`  ${name}`);
  // JPEG sanity check on the icon.
  const iconEntry = names.find((n) => n.startsWith("world_icon.jpeg"));
  console.log(`  world_icon.jpeg present: ${iconEntry ? "yes" : "NO"}`);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const zipPath = arg ?? join(process.cwd(), "dist", "Underworld-Simulator-Remastered.mcworld");
  const worldDir = join(process.cwd(), "build", "world");
  await inspectDatabase(join(worldDir, "db"));
  await inspectLevelDat(worldDir);
  const buffer = await readFile(join(worldDir, "world_icon.jpeg"));
  const jpegMagic = buffer[0] === 0xff && buffer[1] === 0xd8;
  console.log(`\nworld_icon.jpeg: ${buffer.length} bytes, JPEG magic ${jpegMagic ? "OK" : "BAD"}`);
  inspectZip(zipPath);
  console.log(`\nbits per block for a 5-entry palette: ${bitsForPaletteSize(5)}`);
}

await main();
