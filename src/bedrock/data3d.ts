/**
 * Data3D (tag 0x2B) and Data2D (tag 0x2D) serializers.
 *
 * Modern Bedrock (1.18+, including 1.26) expects Data3D on loaded chunks:
 *   [512 bytes heightmap: 256 × int16 LE]
 *   [25 biome palette storages, bottom → top]
 *
 * Each biome storage matches the block-storage header layout, but the palette
 * is int32 biome IDs instead of NBT block states. A header of 0xFF means
 * "no biome data for this vertical slice".
 *
 * We also write Data2D (legacy) for clients that still prefer it:
 *   [512 bytes heightmap] + [256 bytes biome IDs]
 *
 * Biome numeric IDs (Bedrock):
 *   1 = plains, 8 = hell/nether_wastes, 178 = soul_sand_valley,
 *   179 = crimson_forest, 190 = deep_dark
 */

/** soul_sand_valley — fits the Underworld atmosphere */
export const DEFAULT_BIOME_ID = 178;

/** Number of vertical biome slices in Data3D (covers Y -64..320). */
const BIOME_SLICE_COUNT = 25;

/**
 * Build a uniform single-biome storage for one vertical slice.
 * Header 0x01 = bitsPerBlock 0, single-value palette (1.18.31+ disk form).
 * Followed by one int32 LE biome id.
 */
function uniformBiomeStorage(biomeId: number): Buffer {
  const buf = Buffer.allocUnsafe(5);
  buf.writeUInt8(0x01, 0); // bits=0, single-value
  buf.writeInt32LE(biomeId | 0, 1);
  return buf;
}

/**
 * Encode Data3D for one chunk.
 * @param heights 256 surface heights in XZY column order (x + z*16), world Y
 * @param biomeId Bedrock numeric biome id for the whole chunk
 */
export function serializeData3D(heights: Int16Array | number[], biomeId = DEFAULT_BIOME_ID): Buffer {
  if (heights.length !== 256) {
    throw new Error(`Data3D heightmap must be 256 values, got ${heights.length}`);
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

  const slice = uniformBiomeStorage(biomeId);
  for (let i = 0; i < BIOME_SLICE_COUNT; i++) {
    parts.push(slice);
  }
  return Buffer.concat(parts);
}

/**
 * Encode legacy Data2D: heightmap + 256×u8 biome ids.
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
 * Order: index = x + z*16 (XZY column order matching Bedrock).
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
