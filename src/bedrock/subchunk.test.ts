import { describe, expect, test } from "bun:test";
import { entryContentTypeToFormatMap } from "mcbe-leveldb";
import { P, type BlockState } from "../world/blocks.ts";
import { bitsForPaletteSize, serializeSubChunk, SUBCHUNK_BLOCK_COUNT } from "./subchunk.ts";

interface ParsedLayer {
  palette: { value: Record<string, { value: { name: { value: string } } }> };
  block_indices: { value: { value: number[] } };
}

async function parseReference(payload: Buffer) {
  const parsed = (await entryContentTypeToFormatMap.SubChunkPrefix.parse(payload)) as unknown as {
    value: {
      version: { value: number };
      layerCount: { value: number };
      subChunkIndex: { value: number };
      layers: { value: { value: ParsedLayer[] } };
    };
  };
  return parsed.value;
}

describe("subchunk serializer", () => {
  test("chooses the smallest legal bits-per-block", () => {
    expect(bitsForPaletteSize(1)).toBe(0); // uniform storage
    expect(bitsForPaletteSize(2)).toBe(1);
    expect(bitsForPaletteSize(3)).toBe(2);
    expect(bitsForPaletteSize(5)).toBe(3);
    expect(bitsForPaletteSize(17)).toBe(5);
    expect(bitsForPaletteSize(33)).toBe(6);
    expect(bitsForPaletteSize(65)).toBe(8);
    expect(bitsForPaletteSize(257)).toBe(16);
  });

  test("writes a uniform subchunk without a palette count or word array", () => {
    const ids = new Uint16Array(SUBCHUNK_BLOCK_COUNT); // all index 0
    const payload = serializeSubChunk(ids, [P.deepslate], { version: 9, subChunkIndex: 3 });
    expect(payload[0]).toBe(9); // payload version
    expect(payload[1]).toBe(1); // one storage layer
    expect(payload[2]).toBe(3); // subchunk index echoed in the payload (v9)
    expect(payload[3]).toBe(0); // bitsPerBlock 0 => uniform
    // version + layerCount + index + storageVersion + one NBT entry
    expect(payload.length).toBeGreaterThan(4);
  });

  test("round-trips a varied subchunk through the reference parser", async () => {
    const palette: BlockState[] = [P.air, P.deepslate, P.blackstone, P.goldBlock, P.soulSand];
    const ids = new Uint16Array(SUBCHUNK_BLOCK_COUNT);
    for (let i = 0; i < ids.length; i++) ids[i] = i % palette.length;

    const payload = serializeSubChunk(ids, palette, { version: 9, subChunkIndex: 2 });
    const parsed = await parseReference(payload);

    expect(parsed.version.value).toBe(9);
    expect(parsed.layerCount.value).toBe(1);
    expect(parsed.subChunkIndex.value).toBe(2);

    const layer = parsed.layers.value.value[0]!;
    const paletteEntries = layer.palette.value;
    expect(Object.keys(paletteEntries).length).toBe(palette.length);
    const names = Object.keys(paletteEntries)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => paletteEntries[key]!.value.name.value);
    expect(names).toEqual(palette.map((entry) => entry.name));

    // indices must come back exactly as written, in XZY order
    expect(layer.block_indices.value.value).toEqual([...ids]);
  });

  test("packing is low-bit-first within each 32 bit word", async () => {
    // 5 entry palette => 3 bits per block => 10 blocks per word
    const palette: BlockState[] = [P.air, P.deepslate, P.tuff, P.gravel, P.obsidian];
    const ids = new Uint16Array(SUBCHUNK_BLOCK_COUNT);
    ids[0] = 4; // first block sits in the low bits of word 0
    ids[9] = 1; // tenth block sits at bit 27
    const payload = serializeSubChunk(ids, palette, { version: 9, subChunkIndex: 0 });
    const parsed = await parseReference(payload);
    const indices = parsed.layers.value.value[0]!.block_indices.value.value;
    expect(indices[0]).toBe(4);
    expect(indices[9]).toBe(1);
  });

  test("subchunk version 8 omits the in-payload index byte", () => {
    const ids = new Uint16Array(SUBCHUNK_BLOCK_COUNT);
    const withIndex = serializeSubChunk(ids, [P.blackstone], { version: 9, subChunkIndex: 5 });
    const legacy = serializeSubChunk(ids, [P.blackstone], { version: 8, subChunkIndex: 5 });
    expect(withIndex.length).toBe(legacy.length + 1);
    expect(withIndex[2]).toBe(5);
    expect(legacy[2]).not.toBe(5);
  });
});
