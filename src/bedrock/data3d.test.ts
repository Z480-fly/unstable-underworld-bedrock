import { describe, expect, test } from "bun:test";
import { entryContentTypeToFormatMap } from "mcbe-leveldb";
import {
  BIOME_SLICE_COUNT,
  DEFAULT_BIOME_ID,
  parseData3D,
  serializeBiomeSlice,
  serializeData2D,
  serializeData3D,
  serializeData3DSlices,
  uniformBiomeSlices,
  type BiomeSlice,
} from "./data3d.ts";

const heights = (): Int16Array => {
  const out = new Int16Array(256);
  for (let i = 0; i < 256; i++) out[i] = -64 + i;
  return out;
};

/** Size of a uniform single-biome payload: 512-byte heightmap + 24 x 5 bytes. */
const UNIFORM_SIZE = 512 + BIOME_SLICE_COUNT * 5;

describe("Data3D serializer", () => {
  test("writes the Overworld's 24 biome storages, not 25", () => {
    const payload = serializeData3D(heights());
    expect(BIOME_SLICE_COUNT).toBe(24);
    expect(payload.length).toBe(UNIFORM_SIZE);
    expect(payload.length).toBe(632);

    // The heightmap is 256 little-endian int16s in x + z*16 order.
    expect(payload.readInt16LE(0)).toBe(-64);
    expect(payload.readInt16LE(510)).toBe(-64 + 255);
  });

  test("a uniform storage is one header byte plus one biome id (5 bytes)", () => {
    expect([...serializeBiomeSlice({ kind: "uniform", biomeId: DEFAULT_BIOME_ID })]).toEqual([
      0x01,
      DEFAULT_BIOME_ID & 0xff,
      (DEFAULT_BIOME_ID >> 8) & 0xff,
      0,
      0,
    ]);
  });

  test("an empty storage is the single 0xFF marker", () => {
    expect([...serializeBiomeSlice({ kind: "empty" })]).toEqual([0xff]);
  });

  test("a palettized storage uses the block-payload word layout", () => {
    const indices = new Array(4096).fill(0);
    indices[5] = 1; // second palette entry, first word, bit 5
    const palette = [DEFAULT_BIOME_ID, 190];
    const slice: BiomeSlice = { kind: "palettized", palette, indices };
    const bytes = serializeBiomeSlice(slice);

    const bits = 1; // two palette entries
    const words = Math.ceil(4096 / Math.floor(32 / bits));
    expect(bytes.length).toBe(1 + words * 4 + 4 + palette.length * 4);
    expect(bytes[0]).toBe((bits << 1) | 1); // 0x03: runtime palette, one bit
    expect(bytes.readUInt32LE(1)).toBe(1 << 5); // index 5 set, low bits first
    const sizeAt = 1 + words * 4;
    expect(bytes.readInt32LE(sizeAt)).toBe(2);
    expect(bytes.readInt32LE(sizeAt + 4)).toBe(DEFAULT_BIOME_ID);
    expect(bytes.readInt32LE(sizeAt + 8)).toBe(190);
  });

  test("round-trips every storage shape through the decoder", () => {
    const slices: BiomeSlice[] = uniformBiomeSlices();
    slices[0] = { kind: "empty" };
    const indices = new Array(4096).fill(1);
    indices[10] = 0;
    slices[BIOME_SLICE_COUNT - 1] = { kind: "palettized", palette: [178, 190], indices };

    const parsed = parseData3D(serializeData3DSlices(heights(), slices));
    expect(parsed.heights.length).toBe(256);
    expect(parsed.slices.length).toBe(BIOME_SLICE_COUNT);
    expect(parsed.slices[0]).toEqual({ kind: "empty" });
    expect(parsed.slices[1]).toEqual({ kind: "uniform", biomeId: DEFAULT_BIOME_ID });
    const last = parsed.slices[BIOME_SLICE_COUNT - 1]!;
    expect(last.kind).toBe("palettized");
    if (last.kind === "palettized") {
      expect(last.palette).toEqual([178, 190]);
      expect(last.indices.length).toBe(4096);
      expect(last.indices[10]).toBe(0);
      expect(last.indices[11]).toBe(1);
    }
  });

  test("legacy Data2D keeps its old 512 + 256 layout but is not written", () => {
    const payload = serializeData2D(heights());
    expect(payload.length).toBe(512 + 256);
    expect(payload.readInt16LE(0)).toBe(0); // Data2D clamps heights to 0..255
    expect(payload[512]).toBe(DEFAULT_BIOME_ID);
  });

  test("rejects a payload with the wrong number of storages", () => {
    expect(() => serializeData3DSlices(heights(), uniformBiomeSlices().slice(1))).toThrow(
      /24 biome storages/,
    );
  });

  test("the reference parser reads the payload as 24 uniform storages", async () => {
    const payload = serializeData3D(heights());
    const parsed = (await entryContentTypeToFormatMap.Data3D.parse(payload)) as unknown as {
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

    const rows = parsed.value.heightMap.value.value;
    expect(rows.length).toBe(16);
    expect(rows[0]!.value.length).toBe(16);

    const biomes = parsed.value.biomes.value.value;
    expect(biomes.length).toBe(BIOME_SLICE_COUNT);
    for (const storage of biomes) {
      expect(storage.palette.value.value).toEqual([DEFAULT_BIOME_ID]);
      expect(storage.values.value.value.length).toBe(4096);
    }
  });
});
