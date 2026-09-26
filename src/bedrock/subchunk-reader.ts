/**
 * Fast decoder for a Bedrock subchunk payload (LevelDB tag 0x2F).
 *
 * The inverse of `subchunk.ts`'s serializer, and the counterpart to the generic
 * `mcbe-leveldb` parser: same payload, but it walks the bytes directly so a
 * whole foreign world's terrain can be read in seconds.
 *
 * Layout (subchunk version 9, 1.18+):
 *
 *   [0]    version        u8
 *   [1]    layerCount      u8
 *   [2]    subChunkIndex   i8
 *   layer...{
 *     storageVersion  u8   bits = value >> 1, runtime palette when the LSB is 0
 *     if bits > 0:
 *       words         u32[]  index words, packed low-bit-first
 *       paletteSize   u32
 *     palette         NBT[]  one entry (bits == 0) or paletteSize entries
 *   }
 *
 * Indices are stored XZY with Y fastest - the block at (x, y, z) is at
 * `(x << 8) | (z << 4) | y` - and a `bits == 0` layer means the whole subchunk
 * is one block.
 */

import { NbtLeReader } from "./nbt-le-reader.ts";

export const SUBCHUNK_BLOCK_COUNT = 4096;

/** A palette entry's block name plus its flattened state values. */
export interface PaletteEntry {
  name: string;
  states: Record<string, string | number | boolean>;
}

export interface SubChunkLayer {
  palette: PaletteEntry[];
  /** 4096 indices, Bedrock XZY order (`(x << 8) | (z << 4) | y`). */
  ids: Uint16Array;
}

export interface DecodedSubChunk {
  version: number;
  subChunkIndex: number;
  layers: SubChunkLayer[];
}

function normalizeStates(raw: unknown): Record<string, string | number | boolean> {
  const states: Record<string, string | number | boolean> = {};
  if (raw == null || typeof raw !== "object") return states;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "boolean") states[key] = value;
    else if (typeof value === "number") states[key] = value;
    else if (typeof value === "bigint") states[key] = Number(value);
  }
  return states;
}

function readPaletteEntry(reader: NbtLeReader): PaletteEntry {
  const { value } = reader.namedTag();
  const compound = value as { name?: unknown; states?: unknown };
  return {
    name: typeof compound?.name === "string" ? compound.name : "minecraft:air",
    states: normalizeStates(compound?.states),
  };
}

/** Decode one subchunk payload into its layers of palette + indices. */
export function decodeSubChunk(buf: Buffer): DecodedSubChunk {
  const reader = new NbtLeReader(buf);
  const version = reader.u8();
  const layerCount = version === 0x01 ? 1 : reader.u8();
  const subChunkIndex = version >= 0x09 ? reader.i8() : 0;
  const layers: SubChunkLayer[] = [];

  for (let layer = 0; layer < layerCount; layer++) {
    const storageVersion = reader.u8();
    const bits = storageVersion >> 1;
    const ids = new Uint16Array(SUBCHUNK_BLOCK_COUNT);

    if (bits === 127) {
      layers.push({ palette: [{ name: "minecraft:air", states: {} }], ids });
      continue;
    }

    if (bits > 0) {
      const blocksPerWord = Math.floor(32 / bits);
      const wordCount = Math.ceil(SUBCHUNK_BLOCK_COUNT / blocksPerWord);
      const mask = (1 << bits) - 1;
      for (let wordIndex = 0; wordIndex < wordCount; wordIndex++) {
        let word = buf.readUInt32LE(reader.pos);
        reader.pos += 4;
        const base = wordIndex * blocksPerWord;
        for (let k = 0; k < blocksPerWord; k++) {
          const index = base + k;
          if (index >= SUBCHUNK_BLOCK_COUNT) break;
          ids[index] = word & mask;
          word >>>= bits;
        }
      }
      const paletteSize = buf.readUInt32LE(reader.pos);
      reader.pos += 4;
      const palette: PaletteEntry[] = [];
      for (let i = 0; i < paletteSize; i++) palette.push(readPaletteEntry(reader));
      layers.push({ palette, ids });
      continue;
    }

    // bits == 0: uniform subchunk, exactly one palette entry and no size word.
    layers.push({ palette: [readPaletteEntry(reader)], ids });
  }

  return { version, subChunkIndex, layers };
}
