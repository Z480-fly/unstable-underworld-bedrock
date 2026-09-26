/**
 * Bedrock LevelDB writer.
 *
 * Chunk keys are the concatenation of:
 *   x (i32 LE), z (i32 LE), [dimension (i32 LE) - omitted for the Overworld],
 *   content-type tag (u8), [subchunk index (i8) for SubChunkPrefix records]
 * so a chunk key is 9, 10, 13 or 14 bytes long.
 *
 * The database itself is written with `classic-level` (real LevelDB, default
 * bytewise comparator - which is what Bedrock uses). Block compression is
 * disabled so every data block uses the "no compression" type, removing any
 * dependency on the snappy build of Bedrock's modified LevelDB; the `.mcworld`
 * ZIP deflates everything anyway.
 */

import { ClassicLevel } from "classic-level";

/** LevelDB content-type tags (chunk key suffix byte). */
export const CHUNK_TAG = {
  Data3D: 0x2b,
  Version: 0x2c,
  Data2D: 0x2d,
  Data2DLegacy: 0x2e,
  SubChunkPrefix: 0x2f,
  LegacyTerrain: 0x30,
  BlockEntity: 0x31,
  Entity: 0x32,
  PendingTicks: 0x33,
  LegacyBlockExtraData: 0x34,
  BiomeState: 0x35,
  FinalizedState: 0x36,
  ConversionData: 0x37,
  BorderBlocks: 0x38,
  HardcodedSpawners: 0x39,
  RandomTicks: 0x3a,
  Checksums: 0x3b,
  GenerationSeed: 0x3c,
  GeneratedPreCavesAndCliffsBlending: 0x3d,
  BlendingBiomeHeight: 0x3e,
  /** uint64 LE: xxHash64 of this chunk's metadata, a key into the dictionary. */
  MetaDataHash: 0x3f,
  BlendingData: 0x40,
  ActorDigestVersion: 0x41,
  LegacyVersion: 0x76,
} as const;

/** Base chunk key: x, z and (only when not the Overworld) the dimension id. */
export function chunkKeyBase(chunkX: number, chunkZ: number, dimension = 0): Buffer {
  const buf = Buffer.allocUnsafe(dimension === 0 ? 8 : 12);
  buf.writeInt32LE(chunkX | 0, 0);
  buf.writeInt32LE(chunkZ | 0, 4);
  if (dimension !== 0) buf.writeInt32LE(dimension | 0, 8);
  return buf;
}

export function chunkKey(
  chunkX: number,
  chunkZ: number,
  dimension: number,
  tag: number,
  subChunkIndex?: number,
): Buffer {
  const base = chunkKeyBase(chunkX, chunkZ, dimension);
  if (subChunkIndex === undefined) {
    return Buffer.concat([base, Buffer.from([tag & 0xff])]);
  }
  const tail = Buffer.allocUnsafe(2);
  tail.writeUInt8(tag & 0xff, 0);
  tail.writeInt8(Math.max(-128, Math.min(127, subChunkIndex)), 1);
  return Buffer.concat([base, tail]);
}

export class BedrockWorldDb {
  private constructor(private readonly db: ClassicLevel<Buffer, Buffer>) {}

  static async open(directory: string): Promise<BedrockWorldDb> {
    const db = new ClassicLevel<Buffer, Buffer>(directory, {
      keyEncoding: "buffer",
      valueEncoding: "buffer",
      compression: false,
      createIfMissing: true,
    });
    await db.open();
    return new BedrockWorldDb(db);
  }

  async put(key: Buffer, value: Buffer): Promise<void> {
    await this.db.put(key, value);
  }

  async putChunkVersion(chunkX: number, chunkZ: number, version: number, dimension = 0): Promise<void> {
    await this.put(chunkKey(chunkX, chunkZ, dimension, CHUNK_TAG.Version), Buffer.from([version & 0xff]));
  }

  async putFinalizedState(chunkX: number, chunkZ: number, state = 2, dimension = 0): Promise<void> {
    const value = Buffer.allocUnsafe(4);
    value.writeUInt32LE(state, 0);
    await this.put(chunkKey(chunkX, chunkZ, dimension, CHUNK_TAG.FinalizedState), value);
  }

  async putSubChunk(chunkX: number, chunkZ: number, subChunkIndex: number, value: Buffer, dimension = 0): Promise<void> {
    await this.put(chunkKey(chunkX, chunkZ, dimension, CHUNK_TAG.SubChunkPrefix, subChunkIndex), value);
  }

  /** Heightmap + 3D biome palettes (required by Bedrock 1.18+ / 1.26). */
  async putData3D(chunkX: number, chunkZ: number, value: Buffer, dimension = 0): Promise<void> {
    await this.put(chunkKey(chunkX, chunkZ, dimension, CHUNK_TAG.Data3D), value);
  }

  /**
   * Legacy heightmap + 2D biomes. Bedrock stopped writing Data2D in 1.18.0 and
   * does not need it, so this is only here for the format record.
   */
  async putData2D(chunkX: number, chunkZ: number, value: Buffer, dimension = 0): Promise<void> {
    await this.put(chunkKey(chunkX, chunkZ, dimension, CHUNK_TAG.Data2D), value);
  }

  /** uint64 LE metadata hash, the key into the metadata dictionary. */
  async putMetaDataHash(chunkX: number, chunkZ: number, hash: bigint, dimension = 0): Promise<void> {
    const value = Buffer.allocUnsafe(8);
    value.writeBigUInt64LE(hash & 0xffffffffffffffffn, 0);
    await this.put(chunkKey(chunkX, chunkZ, dimension, CHUNK_TAG.MetaDataHash), value);
  }

  /** Seamless-blending data; `[0, version]` for a chunk that is not a source. */
  async putBlendingData(chunkX: number, chunkZ: number, value: Buffer, dimension = 0): Promise<void> {
    await this.put(chunkKey(chunkX, chunkZ, dimension, CHUNK_TAG.BlendingData), value);
  }

  /** Entity-digest format version for this chunk (0 = the 1.18.30 format). */
  async putActorDigestVersion(chunkX: number, chunkZ: number, version: number, dimension = 0): Promise<void> {
    await this.put(chunkKey(chunkX, chunkZ, dimension, CHUNK_TAG.ActorDigestVersion), Buffer.from([version & 0xff]));
  }

  /**
   * World-level `LevelChunkMetaDataDictionary`: every chunk's `MetaDataHash`
   * points at an entry in here, so it is written once for the whole world
   * (all realm chunks share one metadata compound).
   */
  async putMetaDataDictionary(value: Buffer): Promise<void> {
    await this.put(Buffer.from("LevelChunkMetaDataDictionary", "utf8"), value);
  }

  /**
   * Flush the write-ahead log into sorted table (`*.ldb`) files. Without this a
   * freshly built database can leave everything in `db/00000x.log`, which is
   * legal LevelDB but unlike anything the game itself writes.
   */
  async compactAll(): Promise<void> {
    await this.db.compactRange(Buffer.alloc(0), Buffer.alloc(64, 0xff));
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
