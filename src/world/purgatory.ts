/**
 * Purgatory: the region transplanted from the user's `Purgatory Simulator`
 * world, so the world becomes OVERWORLD -> UNDERWORLD -> PURGATORY as one
 * continuous physical place rather than a separate dimension.
 *
 * Nothing here reconstructs terrain - it reads the source world's own subchunk
 * payloads (vendored under `assets/purgatory`, see its README) and re-emits
 * them into this project's LevelDB at an offset, so Purgatory keeps the exact
 * blocks the user built. The Underworld generator itself is untouched.
 *
 * Coordinates
 * -----------
 * The source build covers chunks `cx 0..33`, `cz -3..34` and world `y 26..273`.
 * It is placed west of the Underworld realm (whose west edge is `x = -352`):
 *
 *   worldX = localX - 896     -> local blocks -896..-353, immediately west of
 *                                 the realm edge
 *   worldZ = localZ - 256     -> centred on the Underworld (world z -304..303)
 *   worldY = localY + 16      -> its floor (~y 26) lands at y ~42, a step down
 *                                 from the Underworld's west coast (~y 44),
 *                                 which the connecting plateau in
 *                                 `purgatory_approach.ts` bridges
 *
 * All three offsets are multiples of 16, so every source subchunk maps onto
 * exactly one destination subchunk and the blocks never need re-packing - only
 * the palette is filtered through `stabilize` so no gravity block can fall out
 * of the imported terrain.
 *
 * Lighting
 * --------
 * The source build is a tower: a probe of its columns shows the same storey
 * repeating every 35 blocks - a deepslate-tile floor, an 11-block air gap, a
 * tuff course, another floor - seven storeys up to y=270, with no light
 * anywhere in it. Transplanted verbatim that is a 230-block black shaft, and
 * "inside the prison" is a place you cannot see in.
 *
 * So the transplant is no longer quite verbatim. `planLighting` finds enclosed
 * air volumes with no light source in them and hangs a lamp from the ceiling of
 * each, on a fixed grid. It is deliberately narrow:
 *
 * - only *enclosed* air is touched, so nothing outdoors changes and no
 *   landscape silhouette moves;
 * - a room that already has a light in it is left completely alone, so any
 *   lighting in the source build is the author's and stays the author's;
 * - it runs on the source's own coordinates before the offset, and it writes
 *   nothing outside the region the transplant already owns. Nothing else in
 *   the Underworld is in scope.
 */

import { join } from "node:path";
import { readLevelDbDirectory } from "../bedrock/leveldb-reader.ts";
import { decodeSubChunk } from "../bedrock/subchunk-reader.ts";
import { serializeSubChunk } from "../bedrock/subchunk.ts";
import { P, stabilize, type BlockState } from "./blocks.ts";
import { hash2 } from "./noise.ts";

export const PURGATORY = {
  /** Vendored source tables, relative to the project root. */
  sourceDir: join("assets", "purgatory", "db"),
  /** Block-space translation applied to every source block. */
  offsetX: -896,
  offsetZ: -256,
  offsetY: 16,
} as const;

const CHUNK = 16;
/** Subchunk content tag in a chunk key. */
const SUBCHUNK_TAG = 0x2f;

/**
 * How the Purgatory's own storeys are lit.
 *
 * `spacing` is in blocks between lamps, so a storey gets one lamp per
 * `spacing * spacing` of floor. Glowstone reaches 15, so 8 leaves no dark
 * patch in the middle of a room and does not turn the tower into a chandelier.
 */
export const PURGATORY_LIGHTING = {
  /** One lamp per this many blocks along X and Z. */
  spacing: 8,
  /** A room shorter than this is a doorway or a crawlspace, not a room. */
  minRoomHeight: 4,
  /** Chance a given lamp is a sea lantern rather than glowstone. */
  lanternChance: 0.25,
} as const;

/** Block names that count as "this room is already lit". */
const SOURCE_LIGHTS = [
  "glowstone",
  "sea_lantern",
  "shroomlight",
  "beacon",
  "lantern",
  "torch",
  "soul_torch",
  "soul_lantern",
  "redstone_torch",
  "fire",
  "campfire",
  "magma",
  "end_rod",
  "chorus_flower",
  "chorus_plant",
  "jack_o_lantern",
  "sea_pickle",
  "glow_lichen",
];

const isSourceLight = (name: string): boolean => SOURCE_LIGHTS.some((l) => name.includes(l));

/** One column's occupancy, as a bit per Y (0..255). */
export interface ColumnMask {
  solid: Uint32Array;
  lit: Uint32Array;
}

const MASK_WORDS = 8;
const maskWord = (y: number): number => (y >>> 5) as number;
const maskBit = (y: number): number => 1 << (y % 32);
const isSolidAt = (mask: Uint32Array, y: number): boolean => (mask[maskWord(y)]! & maskBit(y)) !== 0;
const isLitAt = (mask: Uint32Array, y: number): boolean => (mask[maskWord(y)]! & maskBit(y)) !== 0;

/**
 * A lamp position in *source* coordinates, packed so the transplant can look
 * it up per subchunk without allocating a string per block.
 */
export type LightingPlan = Map<number, BlockState>;

/** Column key. Z is the low 12 bits (biased), X above it. */
const columnKey = (x: number, z: number): number => (x + 1024) * 4096 + (z + 1024);

/**
 * Block key. Y is the low 8 bits, Z the next 12, X above that.
 *
 * The bias matters: the source's own coordinates are negative in the low
 * chunks, and an unbiased Z term overflows into X and silently aliases one
 * column's room onto another's.
 */
const blockKey = (x: number, y: number, z: number): number =>
  (x + 1024) * 1048576 + (z + 1024) * 256 + y;

/**
 * Work out where a single column needs a lamp.
 *
 * Split out from the scan so it can be tested against synthetic columns: the
 * real pass is a 300,000-column walk of somebody else's world, and the logic
 * that decides "this is a room, it is dark, it needs a lamp" is three
 * conditions that are much cheaper to pin down directly.
 *
 * A room is an air run with solid below it and solid above it. Anything else -
 * a doorway, a ledge, an overhang, the sky - is not a room and is left alone.
 * A room with a light in it is left alone too, so authored lighting survives.
 */
export function planColumn(
  x: number,
  z: number,
  mask: ColumnMask,
  into: LightingPlan,
  opts: { spacing?: number; minRoomHeight?: number; lanternChance?: number; seed?: number } = {},
): void {
  const spacing = opts.spacing ?? PURGATORY_LIGHTING.spacing;
  const minHeight = opts.minRoomHeight ?? PURGATORY_LIGHTING.minRoomHeight;
  const lanternChance = opts.lanternChance ?? PURGATORY_LIGHTING.lanternChance;
  const seed = opts.seed ?? 0x9a71;

  // one lamp per spacing x spacing patch, snapped to a global grid so the
  // lamps in neighbouring columns line up instead of forming a diagonal weave
  if (((x % spacing) + spacing) % spacing !== 0) return;
  if (((z % spacing) + spacing) % spacing !== 0) return;

  let airStart = -1;
  for (let y = 1; y <= 255; y++) {
    if (isSolidAt(mask.solid, y)) {
      if (airStart >= 0) {
        const ceiling = y - 1; // last air block in the run
        const height = ceiling - airStart + 1;
        const enclosed = isSolidAt(mask.solid, airStart - 1);
        if (enclosed && height >= minHeight) {
          let alreadyLit = false;
          for (let i = airStart; i <= ceiling; i++) {
            if (isLitAt(mask.lit, i)) {
              alreadyLit = true;
              break;
            }
          }
          if (!alreadyLit) {
            const lampY = ceiling; // hung flat against the ceiling
            into.set(
              blockKey(x, lampY, z),
              hash2(x, z, seed) < lanternChance ? P.seaLantern : P.glowstone,
            );
          }
        }
      }
      airStart = -1;
    } else if (airStart < 0) {
      airStart = y;
    }
  }
}

export interface PurgatorySubChunk {
  subY: number;
  value: Buffer;
}

export interface PurgatoryChunk {
  cx: number;
  cz: number;
  subChunks: PurgatorySubChunk[];
  /** 256 surface heights (index `x + z*16`), world Y; 0 where the chunk is empty. */
  heights: Int16Array;
}

export interface PurgatoryRegion {
  chunks: PurgatoryChunk[];
  minCx: number;
  maxCx: number;
  minCz: number;
  maxCz: number;
  /** Total solid subchunks emitted, for the build log. */
  subChunkCount: number;
  /** Lamps hung in unlit enclosed rooms, for the build log. */
  lampsPlaced: number;
}

/** Translate one block's palette entry, dropping any gravity block. */
function transplantBlock(entry: { name: string; states: Record<string, string | number | boolean> }): BlockState {
  const block: BlockState = { name: entry.name, states: entry.states };
  return stabilize(block);
}

/** True for a 10-byte Overworld subchunk key inside the source's own box. */
function readSubChunkKey(key: Buffer): { cx: number; cz: number; subY: number } | null {
  if (key.length !== 10 || key[8] !== SUBCHUNK_TAG) return null;
  const cx = key.readInt32LE(0);
  const cz = key.readInt32LE(4);
  const subY = key.readInt8(9);
  // Reject the handful of 10-byte named keys whose 9th byte happens to be
  // 0x2f ('/'); a real build never leaves this box.
  if (Math.abs(cx) > 4096 || Math.abs(cz) > 4096 || subY < -8 || subY > 24) return null;
  return { cx, cz, subY };
}

/**
 * Walk the source once, building a bit per Y per column, and plan the lamps.
 *
 * This is a separate pass over the raw tables rather than something folded
 * into the transplant loop, because the transplant loop cannot know whether a
 * column's air run is enclosed until it has seen the whole column - and it
 * would have to keep every decoded subchunk alive to find out, which for a
 * 300,000-column world is hundreds of megabytes of index arrays. Two passes
 * over buffers that are already in memory costs seconds and nothing else.
 */
export function planPurgatoryLighting(db: Map<string, Buffer>): LightingPlan {
  const plan: LightingPlan = new Map();
  const masks = new Map<number, ColumnMask>();

  for (const [hex, value] of db) {
    const where = readSubChunkKey(Buffer.from(hex, "hex"));
    if (!where) continue;
    const layer = decodeSubChunk(value).layers[0];
    if (!layer || layer.palette.length === 0) continue;
    const baseY = where.subY * CHUNK;
    for (let i = 0; i < 4096; i++) {
      const name = layer.palette[layer.ids[i]!]!.name;
      if (name === "minecraft:air") continue;
      const x = where.cx * CHUNK + ((i >> 8) & 15);
      const z = where.cz * CHUNK + ((i >> 4) & 15);
      const y = baseY + (i & 15);
      if (y < 0 || y > 255) continue;
      const key = columnKey(x, z);
      let mask = masks.get(key);
      if (!mask) {
        mask = { solid: new Uint32Array(MASK_WORDS), lit: new Uint32Array(MASK_WORDS) };
        masks.set(key, mask);
      }
      mask.solid[maskWord(y)]! |= maskBit(y);
      if (isSourceLight(name)) mask.lit[maskWord(y)]! |= maskBit(y);
    }
  }

  for (const [key, mask] of masks) {
    const x = Math.floor(key / 4096) - 1024;
    const z = (key % 4096) - 1024;
    planColumn(x, z, mask, plan);
  }

  return plan;
}

/**
 * Read the whole Purgatory region from disk. Every returned subchunk is ready
 * to hand straight to `BedrockWorldDb.putSubChunk` for its `cx, cz, subY`.
 */
export function loadPurgatoryRegion(projectRoot = process.cwd()): PurgatoryRegion {
  const db = readLevelDbDirectory(join(projectRoot, PURGATORY.sourceDir));

  const lighting = planPurgatoryLighting(db);

  const byChunk = new Map<string, PurgatoryChunk>();
  let subChunkCount = 0;
  let lampsPlaced = 0;
  let minCx = Infinity, maxCx = -Infinity, minCz = Infinity, maxCz = -Infinity;

  const dxChunks = PURGATORY.offsetX / CHUNK; // -56
  const dzChunks = PURGATORY.offsetZ / CHUNK; // -16
  const dyChunks = PURGATORY.offsetY / CHUNK; // +1

  for (const [hex, value] of db) {
    // Overworld subchunk key: x i32, z i32, 0x2f tag, subchunk index. The
    // dimension-tagged (13/14 byte) nether/end subchunks are ignored on
    // purpose - only the source Overworld is transplanted.
    const where = readSubChunkKey(Buffer.from(hex, "hex"));
    if (!where) continue;
    const localCx = where.cx;
    const localCz = where.cz;
    const localSubY = where.subY;

    const cx = localCx + dxChunks;
    const cz = localCz + dzChunks;
    const subY = localSubY + dyChunks;

    const decoded = decodeSubChunk(value);
    const layer = decoded.layers[0];
    if (!layer || layer.palette.length === 0) continue;

    const palette: BlockState[] = layer.palette.map(transplantBlock);
    const ids = layer.ids;

    // Hang the planned lamps. They are placed in source coordinates and this
    // subchunk is the one that owns them, so no cross-subchunk bookkeeping is
    // needed: a lamp is always inside the same subchunk as the room it lights.
    const baseY = localSubY * CHUNK;
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = localCx * CHUNK + lx;
        const z = localCz * CHUNK + lz;
        for (let y = 0; y < CHUNK; y++) {
          const lamp = lighting.get(blockKey(x, baseY + y, z));
          if (!lamp) continue;
          const index = (lx << 8) | (lz << 4) | y;
          if (palette[ids[index]!]!.name !== "minecraft:air") continue;
          let paletteIndex = palette.findIndex((b) => b.name === lamp.name);
          if (paletteIndex < 0) {
            palette.push(lamp);
            paletteIndex = palette.length - 1;
          }
          ids[index] = paletteIndex;
          lampsPlaced++;
        }
      }
    }

    const payload = serializeSubChunk(ids, palette, { version: 9, subChunkIndex: subY });

    minCx = Math.min(minCx, cx); maxCx = Math.max(maxCx, cx);
    minCz = Math.min(minCz, cz); maxCz = Math.max(maxCz, cz);
    let chunk = byChunk.get(`${cx},${cz}`);
    if (!chunk) {
      chunk = { cx, cz, subChunks: [], heights: new Int16Array(256) };
      byChunk.set(`${cx},${cz}`, chunk);
    }
    chunk.subChunks.push({ subY, value: payload });
    subChunkCount++;

    // Surface heightmap: highest solid block per column, in world Y. The
    // lamps are read here too, so a storey that is otherwise open air still
    // reports the right height to the client.
    const worldBaseY = subY * CHUNK;
    for (let i = 0; i < 4096; i++) {
      if (palette[ids[i]!]!.name === "minecraft:air") continue;
      const column = ((i >> 8) & 15) + (((i >> 4) & 15) << 4);
      const worldY = worldBaseY + (i & 15);
      if (worldY > chunk.heights[column]!) chunk.heights[column] = worldY;
    }
  }

  const chunks = [...byChunk.values()].sort((a, b) => a.cz - b.cz || a.cx - b.cx);
  return { chunks, minCx, maxCx, minCz, maxCz, subChunkCount, lampsPlaced };
}
