/**
 * Central build configuration: world size, versions and seeds.
 *
 * Sizing note (iPhone / mobile performance): the realm is 24x24 chunks
 * (384x384 blocks) with a compact 0..127 vertical range and only the subchunks
 * that actually contain blocks are written, so the resulting world stays small
 * and loads quickly on a phone. The original Java simulators are ~6 GB; this
 * reconstruction targets single-digit megabytes.
 */

export interface RealmBounds {
  minChunkX: number;
  maxChunkX: number;
  minChunkZ: number;
  maxChunkZ: number;
}

export const CONFIG = {
  /** Deterministic map seed - same seed, same map. */
  seed: 20260924,

  /** Bedrock version stamps. */
  minimumClientVersion: [1, 26, 50, 0, 0] as [number, number, number, number],
  inventoryVersion: "1.26.51",
  /** Protocol/network version seen on iOS 1.26.51. */
  networkVersion: 2193,
  /**
   * Chunk "Version" byte (LevelDB key 0x2C).
   * iPhone Bedrock 1.26.51 writes 42 (confirmed from native export 2026-09-25).
   * 41 was used through ~1.21.x; 1.26 clients may ignore or empty 41 chunks.
   */
  chunkVersion: 42,
  /**
   * Subchunk payload version. 9 = 1.18+ (modern). 8 is kept as a supported
   * fallback that older tooling/clients upgrade automatically; flip it with
   * `--subchunk-version=8` if a device ever rejects version 9.
   */
  subChunkVersion: 9 as 8 | 9,

  /** Vertical range of the map (inclusive). */
  minY: 0,
  maxY: 127,

  /**
   * Soft edge falloff so the plate fades into the void instead of a hard cut.
   * Measured in blocks from the realm edge.
   */
  edgeFalloff: 24,

  /**
   * Void gulf: a north-south strip of pure void that cuts the realm in half
   * (the classic Unstable Underworld "chasm" feel). Columns with |x| inside
   * [voidGulfMin, voidGulfMax] are forced to void (except protected pads).
   */
  voidGulfMin: -108,
  voidGulfMax: -72,

  /** Approximate radius of the circular plate. */
  realmRadius: 220,
} as const;

/** Inclusive chunk bounds of the generated realm (covers the circular plate). */
export const REALM: RealmBounds = {
  minChunkX: -16,
  maxChunkX: 15,
  minChunkZ: -16,
  maxChunkZ: 15,
};

export const CHUNKS_X = REALM.maxChunkX - REALM.minChunkX + 1;
export const CHUNKS_Z = REALM.maxChunkZ - REALM.minChunkZ + 1;
