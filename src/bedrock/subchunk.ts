/**
 * Bedrock subchunk serializer.
 *
 * Payload layout for subchunk version 9 (1.18+), confirmed against the
 * minecraft.wiki "Bedrock Edition level format" key/value tables and the
 * wiki-referenced `mcbe-leveldb` reference implementation:
 *
 *   [0]      version        u8   (0x09)
 *   [1]      layerCount     u8   (1 - terrain only, no waterlog layer)
 *   [2]      subChunkIndex  i8
 *   [3..]    layer
 *
 * and each layer is:
 *
 *   storageVersion  u8      bitsPerBlock << 1  (LSB 0 = NBT/runtime palette)
 *   words           u32[]   ceil(4096 / blocksPerWord) LE words, block indices
 *                           packed low-bit-first
 *   paletteSize     u32
 *   palette         NBT[]   paletteSize x { name, states, version }
 *
 * A layer with a single palette entry is written as `bitsPerBlock = 0`, which
 * means "uniform" and is followed by exactly one palette entry and no words.
 * Block indices inside a subchunk are ordered XZY: index = x + 16 * z + 256 * y.
 */

import type { BlockState } from "../world/blocks.ts";
import { ByteWriter, writeBlockPaletteEntry } from "./nbt-le.ts";

export const SUBCHUNK_BLOCK_COUNT = 4096;

/** Bits-per-block values Bedrock accepts. */
const BITS_CHOICES = [1, 2, 3, 4, 5, 6, 8, 16] as const;

export interface SubChunkWriteOptions {
  /** Subchunk format version. 9 = 1.18+, 8 = legacy paletted (fallback). */
  version?: 8 | 9;
  /** Signed subchunk index (floor(worldY / 16)); written into the payload for v9. */
  subChunkIndex?: number;
  /** Block-state data version stamped into every palette entry. */
  paletteVersion?: number;
}

export function bitsForPaletteSize(paletteSize: number): number {
  if (paletteSize <= 1) return 0;
  const needed = Math.ceil(Math.log2(paletteSize));
  for (const bits of BITS_CHOICES) {
    if (bits >= needed) return bits;
  }
  return 16;
}

export function serializeSubChunk(
  ids: Uint16Array,
  palette: readonly BlockState[],
  opts: SubChunkWriteOptions = {},
): Buffer {
  const version = opts.version ?? 9;
  const subChunkIndex = opts.subChunkIndex ?? 0;
  const paletteVersion = opts.paletteVersion;

  const w = new ByteWriter(4096 + palette.length * 48);
  w.u8(version);
  w.u8(1); // one storage layer (terrain)
  if (version >= 9) w.i8(subChunkIndex);

  const paletteSize = palette.length;
  const bits = bitsForPaletteSize(paletteSize);
  const isRuntimePalette = true; // LSB 0 -> NBT/runtime palette
  const storageVersion = ((bits << 1) | (isRuntimePalette ? 0 : 1)) & 0xff;
  w.u8(storageVersion);

  if (bits > 0) {
    const blocksPerWord = Math.floor(32 / bits);
    const wordCount = Math.ceil(SUBCHUNK_BLOCK_COUNT / blocksPerWord);
    const mask = (1 << bits) - 1;
    for (let wordIndex = 0; wordIndex < wordCount; wordIndex++) {
      let word = 0;
      const base = wordIndex * blocksPerWord;
      for (let k = 0; k < blocksPerWord; k++) {
        const idx = base + k;
        if (idx >= SUBCHUNK_BLOCK_COUNT) break;
        word = (word | ((ids[idx]! & mask) << (k * bits))) >>> 0;
      }
      w.u32le(word);
    }
    w.u32le(paletteSize);
  }

  for (let i = 0; i < paletteSize; i++) {
    const entry = palette[i]!;
    writeBlockPaletteEntry(w, entry.name, entry.states, paletteVersion);
  }

  return w.toBuffer();
}
