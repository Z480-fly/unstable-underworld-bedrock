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
 */

import { join } from "node:path";
import { readLevelDbDirectory } from "../bedrock/leveldb-reader.ts";
import { decodeSubChunk } from "../bedrock/subchunk-reader.ts";
import { serializeSubChunk } from "../bedrock/subchunk.ts";
import { stabilize, type BlockState } from "./blocks.ts";

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
}

/** Translate one block's palette entry, dropping any gravity block. */
function transplantBlock(entry: { name: string; states: Record<string, string | number | boolean> }): BlockState {
  const block: BlockState = { name: entry.name, states: entry.states };
  return stabilize(block);
}

/**
 * Read the whole Purgatory region from disk. Every returned subchunk is ready
 * to hand straight to `BedrockWorldDb.putSubChunk` for its `cx, cz, subY`.
 */
export function loadPurgatoryRegion(projectRoot = process.cwd()): PurgatoryRegion {
  const db = readLevelDbDirectory(join(projectRoot, PURGATORY.sourceDir));

  const byChunk = new Map<string, PurgatoryChunk>();
  let subChunkCount = 0;
  let minCx = Infinity, maxCx = -Infinity, minCz = Infinity, maxCz = -Infinity;

  const dxChunks = PURGATORY.offsetX / CHUNK; // -56
  const dzChunks = PURGATORY.offsetZ / CHUNK; // -16
  const dyChunks = PURGATORY.offsetY / CHUNK; // +1

  for (const [hex, value] of db) {
    const key = Buffer.from(hex, "hex");
    // Overworld subchunk key: x i32, z i32, 0x2f tag, subchunk index. The
    // dimension-tagged (13/14 byte) nether/end subchunks are ignored on
    // purpose - only the source Overworld is transplanted.
    if (key.length !== 10 || key[8] !== SUBCHUNK_TAG) continue;
    const localCx = key.readInt32LE(0);
    const localCz = key.readInt32LE(4);
    const localSubY = key.readInt8(9);
    // Reject the handful of 10-byte named keys whose 9th byte happens to be
    // 0x2f ('/'); a real build never leaves this box.
    if (Math.abs(localCx) > 4096 || Math.abs(localCz) > 4096 || localSubY < -8 || localSubY > 24) continue;

    const cx = localCx + dxChunks;
    const cz = localCz + dzChunks;
    const subY = localSubY + dyChunks;

    const decoded = decodeSubChunk(value);
    const layer = decoded.layers[0];
    if (!layer || layer.palette.length === 0) continue;

    const palette: BlockState[] = layer.palette.map(transplantBlock);
    const payload = serializeSubChunk(layer.ids, palette, { version: 9, subChunkIndex: subY });

    minCx = Math.min(minCx, cx); maxCx = Math.max(maxCx, cx);
    minCz = Math.min(minCz, cz); maxCz = Math.max(maxCz, cz);
    let chunk = byChunk.get(`${cx},${cz}`);
    if (!chunk) {
      chunk = { cx, cz, subChunks: [], heights: new Int16Array(256) };
      byChunk.set(`${cx},${cz}`, chunk);
    }
    chunk.subChunks.push({ subY, value: payload });
    subChunkCount++;

    // Surface heightmap: highest solid block per column, in world Y.
    const baseY = subY * CHUNK;
    for (let i = 0; i < 4096; i++) {
      if (layer.palette[layer.ids[i]!]!.name === "minecraft:air") continue;
      const column = ((i >> 8) & 15) + (((i >> 4) & 15) << 4);
      const worldY = baseY + (i & 15);
      if (worldY > chunk.heights[column]!) chunk.heights[column] = worldY;
    }
  }

  const chunks = [...byChunk.values()].sort((a, b) => a.cz - b.cz || a.cx - b.cx);
  return { chunks, minCx, maxCx, minCz, maxCz, subChunkCount };
}
