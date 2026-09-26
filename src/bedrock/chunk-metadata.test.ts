import { describe, expect, test } from "bun:test";
import { entryContentTypeToFormatMap } from "mcbe-leveldb";
import {
  ACTOR_DIGEST_VERSION,
  BLENDING_VERSION,
  buildChunkMetaData,
  hashChunkMetaData,
  parseMetaDataDictionary,
  serializeBlendingData,
  serializeMetaData,
  serializeMetaDataDictionary,
  serializeMetaDataForHash,
  type MetaTag,
} from "./chunk-metadata.ts";

const INPUT = {
  baseGameVersion: "1.26.51",
  generationSeed: 20260924n,
  generatorType: 1,
  dimensionName: "Overworld",
  dimensionRange: { min: -64, max: 320 },
};

describe("chunk metadata", () => {
  test("the xxHash64 primitive matches the published test vector", () => {
    // XXH64("", seed 0) = 0xEF46DB3751D8E999, the canonical reference vector.
    expect(Bun.hash.xxHash64(Buffer.from(""))).toBe(0xef46db3751d8e999n);
  });

  test("disk serialization is Bedrock little-endian NBT with an empty root name", () => {
    const meta: Record<string, MetaTag> = { A: { kind: "int", value: 1 } };
    expect([...serializeMetaData(meta)]).toEqual([
      0x0a, // TAG_Compound
      0x00, 0x00, // root name: u16 LE length 0
      0x03, // TAG_Int
      0x01, 0x00, 0x41, // key "A"
      0x01, 0x00, 0x00, 0x00, // int LE
      0x00, // TAG_End
    ]);
  });

  test("the hash input uses varint string lengths and zig-zag varint ints", () => {
    const meta: Record<string, MetaTag> = { A: { kind: "int", value: 1 } };
    expect([...serializeMetaDataForHash(meta)]).toEqual([
      0x0a, // TAG_Compound
      0x00, // root name: varint length 0
      0x03, // TAG_Int
      0x01, 0x41, // key "A"
      0x02, // zig-zag varint of 1
      0x00, // TAG_End
    ]);

    // Zig-zag: -1 becomes 1, 2 becomes 4, and both stay one byte.
    const negative: Record<string, MetaTag> = { A: { kind: "int", value: -1 } };
    expect(serializeMetaDataForHash(negative).at(-2)).toBe(0x01);
    const two: Record<string, MetaTag> = { A: { kind: "int", value: 2 } };
    expect(serializeMetaDataForHash(two).at(-2)).toBe(0x04);
  });

  test("the hash depends on the values, not on the key order", () => {
    const meta = buildChunkMetaData(INPUT);
    const shuffled: Record<string, MetaTag> = {};
    for (const key of Object.keys(meta).reverse()) shuffled[key] = meta[key]!;

    expect(hashChunkMetaData(shuffled)).toBe(hashChunkMetaData(meta));

    const changed = buildChunkMetaData({ ...INPUT, generationSeed: 1n });
    expect(hashChunkMetaData(changed)).not.toBe(hashChunkMetaData(meta));
  });

  test("the dictionary round-trips its hash and NBT entry", () => {
    const meta = buildChunkMetaData(INPUT);
    const hash = hashChunkMetaData(meta);
    const record = serializeMetaDataDictionary([{ hash, meta }]);

    expect(record.readUInt32LE(0)).toBe(1);
    expect(record.readBigUInt64LE(4)).toBe(hash);

    const entries = parseMetaDataDictionary(record);
    expect(entries.length).toBe(1);
    expect(entries[0]!.hash).toBe(hash);
    // The stored compound starts with TAG_Compound and ends with TAG_End.
    expect(entries[0]!.nbt[0]).toBe(0x0a);
    expect(entries[0]!.nbt.at(-1)).toBe(0x00);
  });

  test("the reference implementation reads the dictionary back", async () => {
    const meta = buildChunkMetaData(INPUT);
    const hash = hashChunkMetaData(meta);
    const parsed = (await entryContentTypeToFormatMap.LevelChunkMetaDataDictionary.parse(
      serializeMetaDataDictionary([{ hash, meta }]),
    )) as unknown as {
      value: Record<string, { value: Record<string, { value: unknown }> }>;
    };

    const hashes = Object.keys(parsed.value);
    expect(hashes.length).toBe(1);
    // mcbe-leveldb keys entries by the stored hash bytes (uint64 LE as stored).
    const storedHash = Buffer.from(hashes[0]!, "hex").readBigUInt64LE(0);
    expect(storedHash).toBe(hash);

    const entry = parsed.value[hashes[0]!]!.value;
    expect(entry.DimensionName!.value).toBe("Overworld");
    expect(entry.GeneratorType!.value).toBe(1);
    expect(entry.LastSavedBaseGameVersion!.value).toBe("1.26.51");
    expect(entry.Overworld1_18HeightExtended!.value).toBe(1);
    expect(entry.WorldGenBelowZeroFixed!.value).toBe(1);
    expect(entry.LastSavedDimensionHeightRange!.value).toMatchObject({
      min: { value: -64 },
      max: { value: 320 },
    });
  });

  test("the per-chunk metadata records have the sizes the format expects", () => {
    expect(serializeBlendingData()).toEqual(Buffer.from([0, BLENDING_VERSION]));
    expect(ACTOR_DIGEST_VERSION).toBe(0);
  });
});
