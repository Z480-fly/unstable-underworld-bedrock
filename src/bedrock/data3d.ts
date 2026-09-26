/**
 * Data3D (tag 0x2B) and Data2D (tag 0x2D) serializers.
 *
 * Modern Bedrock (1.18+, including 1.26) keeps a chunk's biomes in Data3D and
 * no longer writes Data2D at all, so neither does this module: `serializeData2D`
 * is kept as the format record (and for its tests) but is not written to a world.
 *
 * Data3D layout, confirmed against three independent sources — the Minecraft
 * Wiki's byte-level "Bedrock Edition level format" page, uNmINeD's 1.18
 * reverse-engineering write-up, and the two open-source implementations
 * `mcbe-leveldb` (the TypeScript parser this repo already uses as its gate) and
 * Prismarine-Anchor's Rust `data_3d.rs`:
 *
 *   [512 bytes heightmap]   256 x int16 little-endian, index = x + z * 16
 *   [24 biome storages]     one per subchunk, bottom (y -64) -> top (y 304)
 *
 * The Overworld is 384 blocks tall, which is exactly 24 subchunks. (An older
 * wiki revision claims "exactly 25 palettes"; both implementations and the
 * size of a real 1.26 export say 24, and a 25th storage has nowhere to live.)
 *
 * Each biome storage starts with a one-byte header holding `(type << 1) | 1`:
 *
 *   0xFF            -> no biome data for this subchunk (type 127)
 *   0x01            -> uniform: the whole subchunk is one biome, written as a
 *                      single int32 right after the header (5 bytes in total)
 *   0x03, 0x05 ...  -> palettized: `ceil(4096 / floor(32 / type))` uint32
 *                      little-endian words, low bits first, one index per
 *                      *block* of the 16x16x16 subchunk (Bedrock assigns a
 *                      biome per block, not per 4x4x4 cube), then an int32
 *                      palette size and that many int32 biome numeric ids
 *
 * Biome numeric ids (Bedrock): 1 = plains, 8 = hell/nether_wastes,
 * 178 = soulsand_valley, 179 = crimson_forest, 190 = deep_dark.
 */

/** soulsand_valley — fits the Underworld atmosphere. */
export const DEFAULT_BIOME_ID = 178;

/** Biome storages in one Data3D payload: the Overworld's 384 blocks / 16. */
export const BIOME_SLICE_COUNT = 24;

/** Biome indices per storage: one per block of a 16x16x16 subchunk. */
export const BIOME_INDEX_COUNT = 4096;

/** A subchunk with no biome data (type 127). */
export const BIOME_EMPTY_HEADER = 0xff;

/** Bits-per-index values Bedrock accepts in a biome storage header. */
const BIOME_BITS_CHOICES = [1, 2, 3, 4, 5, 6, 8, 16] as const;

/**
 * One subchunk of biome data.
 *
 * - `uniform`: every block in the subchunk is `biomeId`
 * - `palettized`: `indices` (4096 entries, XZY with Y fastest — the same block
 *   order subchunk block payloads use) index into `palette`
 * - `empty`: the subchunk carries no biome data (header 0xFF)
 */
export type BiomeSlice =
  | { kind: "empty" }
  | { kind: "uniform"; biomeId: number }
  | { kind: "palettized"; palette: readonly number[]; indices: ArrayLike<number> };

/** A decoded biome storage unit. */
export type ParsedBiomeSlice =
  | { kind: "empty" }
  | { kind: "uniform"; biomeId: number }
  | { kind: "palettized"; palette: number[]; indices: number[] };

/** Bits needed to index a palette of `paletteSize` entries (0 = uniform). */
function bitsForBiomePalette(paletteSize: number): number {
  if (paletteSize <= 1) return 0;
  const needed = Math.ceil(Math.log2(paletteSize));
  for (const bits of BIOME_BITS_CHOICES) {
    if (bits >= needed) return bits;
  }
  return 16;
}

/** `BIOME_SLICE_COUNT` uniform slices — the shape a single-biome chunk takes. */
export function uniformBiomeSlices(biomeId = DEFAULT_BIOME_ID): BiomeSlice[] {
  return Array.from({ length: BIOME_SLICE_COUNT }, (): BiomeSlice => ({ kind: "uniform", biomeId }));
}

/**
 * Encode one biome storage unit.
 *
 * The uniform case is the 5-byte form real worlds use for a single-biome
 * subchunk: `0x01` + one int32 LE, with no size word and no index words.
 */
export function serializeBiomeSlice(slice: BiomeSlice): Buffer {
  if (slice.kind === "empty") return Buffer.from([BIOME_EMPTY_HEADER]);

  if (slice.kind === "uniform") {
    const buf = Buffer.allocUnsafe(5);
    buf.writeUInt8(0x01, 0);
    buf.writeInt32LE(slice.biomeId | 0, 1);
    return buf;
  }

  const { palette, indices } = slice;
  if (palette.length < 2) {
    throw new Error(`a palettized biome slice needs at least 2 palette entries, got ${palette.length}`);
  }
  if (indices.length !== BIOME_INDEX_COUNT) {
    throw new Error(`a biome slice must hold ${BIOME_INDEX_COUNT} indices, got ${indices.length}`);
  }

  const bits = bitsForBiomePalette(palette.length);
  const blocksPerWord = Math.floor(32 / bits);
  const wordCount = Math.ceil(BIOME_INDEX_COUNT / blocksPerWord);
  const mask = (1 << bits) - 1;

  const header = Buffer.from([((bits << 1) | 1) & 0xff]);
  const words = Buffer.allocUnsafe(wordCount * 4);
  for (let wordIndex = 0; wordIndex < wordCount; wordIndex++) {
    let word = 0;
    const base = wordIndex * blocksPerWord;
    for (let k = 0; k < blocksPerWord; k++) {
      const index = base + k;
      if (index >= BIOME_INDEX_COUNT) break;
      word = (word | ((indices[index]! & mask) << (k * bits))) >>> 0;
    }
    words.writeUInt32LE(word, wordIndex * 4);
  }

  const tail = Buffer.allocUnsafe(4 + palette.length * 4);
  tail.writeInt32LE(palette.length, 0);
  for (let i = 0; i < palette.length; i++) tail.writeInt32LE(palette[i]! | 0, 4 + i * 4);

  return Buffer.concat([header, words, tail]);
}

/**
 * Encode a Data3D payload from explicit biome storages (bottom subchunk first).
 * The heightmap is 256 surface heights in column order (`x + z * 16`).
 */
export function serializeData3DSlices(
  heights: Int16Array | number[],
  slices: readonly BiomeSlice[],
): Buffer {
  if (heights.length !== 256) {
    throw new Error(`Data3D heightmap must be 256 values, got ${heights.length}`);
  }
  if (slices.length !== BIOME_SLICE_COUNT) {
    throw new Error(`Data3D must hold ${BIOME_SLICE_COUNT} biome storages, got ${slices.length}`);
  }

  const parts: Buffer[] = [];
  const hm = Buffer.allocUnsafe(512);
  for (let i = 0; i < 256; i++) {
    let h = heights[i]!;
    if (h < -64) h = -64;
    if (h > 320) h = 320;
    hm.writeInt16LE(h | 0, i * 2);
  }
  parts.push(hm);

  for (const slice of slices) parts.push(serializeBiomeSlice(slice));
  return Buffer.concat(parts);
}

/**
 * Encode Data3D for a single-biome chunk: 24 uniform storages, which is the
 * native encoding of a one-biome world (632 bytes in total - a vanilla world's
 * payload is larger only because its subchunks really do hold several biomes).
 *
 * @param heights 256 surface heights in column order (x + z*16), world Y
 * @param biomeId Bedrock numeric biome id for the whole chunk
 */
export function serializeData3D(heights: Int16Array | number[], biomeId = DEFAULT_BIOME_ID): Buffer {
  return serializeData3DSlices(heights, uniformBiomeSlices(biomeId));
}

/**
 * Decode a Data3D payload. Used by the inspector and the tests to prove a
 * written payload reads back as the storages that went in.
 */
export function parseData3D(buf: Buffer): { heights: Int16Array; slices: ParsedBiomeSlice[] } {
  if (buf.length < 512) {
    throw new Error(`Data3D payload is ${buf.length} bytes, shorter than the 512-byte heightmap`);
  }

  const heights = new Int16Array(256);
  for (let i = 0; i < 256; i++) heights[i] = buf.readInt16LE(i * 2);

  const slices: ParsedBiomeSlice[] = [];
  let p = 512;
  while (p < buf.length) {
    const header = buf.readUInt8(p++);
    if (header === BIOME_EMPTY_HEADER) {
      slices.push({ kind: "empty" });
      continue;
    }
    if ((header & 1) !== 1) {
      throw new Error(`biome storage header 0x${header.toString(16)} at offset ${p - 1} is not a runtime palette`);
    }
    const bits = header >> 1;

    if (bits === 0) {
      if (p + 4 > buf.length) throw new Error("uniform biome storage is truncated");
      slices.push({ kind: "uniform", biomeId: buf.readInt32LE(p) });
      p += 4;
      continue;
    }

    const blocksPerWord = Math.floor(32 / bits);
    const wordCount = Math.ceil(BIOME_INDEX_COUNT / blocksPerWord);
    if (p + wordCount * 4 > buf.length) throw new Error("biome index words are truncated");
    const mask = (1 << bits) - 1;
    const indices: number[] = new Array(BIOME_INDEX_COUNT);
    for (let wordIndex = 0; wordIndex < wordCount; wordIndex++) {
      let word = buf.readUInt32LE(p);
      p += 4;
      const base = wordIndex * blocksPerWord;
      for (let k = 0; k < blocksPerWord; k++) {
        const index = base + k;
        if (index >= BIOME_INDEX_COUNT) break;
        indices[index] = word & mask;
        word >>>= bits;
      }
    }

    if (p + 4 > buf.length) throw new Error("biome palette size is truncated");
    const paletteSize = buf.readInt32LE(p);
    p += 4;
    if (paletteSize < 1 || p + paletteSize * 4 > buf.length) {
      throw new Error(`biome palette of ${paletteSize} entries is truncated or empty`);
    }
    const palette: number[] = new Array(paletteSize);
    for (let i = 0; i < paletteSize; i++) {
      palette[i] = buf.readInt32LE(p);
      p += 4;
    }
    slices.push({ kind: "palettized", palette, indices });
  }

  return { heights, slices };
}

/**
 * Encode legacy Data2D: heightmap + 256×u8 biome ids.
 *
 * Kept for the format record only: Bedrock stopped writing Data2D in 1.18.0 and
 * a real 1.26.51 export has none, so `build.ts` no longer writes it either.
 */
export function serializeData2D(heights: Int16Array | number[], biomeId = DEFAULT_BIOME_ID): Buffer {
  if (heights.length !== 256) {
    throw new Error(`Data2D heightmap must be 256 values, got ${heights.length}`);
  }
  const buf = Buffer.allocUnsafe(512 + 256);
  for (let i = 0; i < 256; i++) {
    let h = heights[i]!;
    if (h < 0) h = 0;
    if (h > 255) h = 255;
    buf.writeInt16LE(h | 0, i * 2);
  }
  const biomeByte = Math.max(0, Math.min(255, biomeId));
  for (let i = 0; i < 256; i++) {
    buf.writeUInt8(biomeByte, 512 + i);
  }
  return buf;
}

/**
 * Collect 16×16 surface heights for a chunk from the world height grid.
 * Order: index = x + z*16 (the order Data3D's heightmap uses).
 */
export function collectChunkHeights(
  surfaceAt: (x: number, z: number) => number,
  isLand: (x: number, z: number) => boolean,
  chunkX: number,
  chunkZ: number,
): Int16Array {
  const out = new Int16Array(256);
  const baseX = chunkX * 16;
  const baseZ = chunkZ * 16;
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      const wx = baseX + x;
      const wz = baseZ + z;
      out[x + z * 16] = isLand(wx, wz) ? surfaceAt(wx, wz) : 0;
    }
  }
  return out;
}
