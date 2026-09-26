/**
 * Central build configuration: world size, versions and seeds.
 *
 * Sizing note (iPhone / mobile performance): the realm is 44x44 chunks
 * (704x704 blocks) with a compact 0..127 vertical range and only the subchunks
 * that actually contain blocks are written, so the resulting world stays small
 * and loads quickly on a phone. The original Java simulators are ~6 GB; this
 * reconstruction targets single-digit megabytes.
 *
 * The realm was expanded from 512x512 (radius 220) to 704x704 (radius 300) so
 * the outer ring - the far east highlands, the southern range, the dark far
 * north-west - carries land of its own instead of void, which is where the
 * Gate Field, the Glassworks and the End Ruin were placed.
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

  /** Bedrock version stamps, matched to an iPhone 1.26.51 world export. */
  minimumClientVersion: [1, 26, 50, 0, 0] as [number, number, number, number, number],
  inventoryVersion: "1.26.51",
  /** Protocol/network version reported by Bedrock 1.26.51. */
  networkVersion: 2193,
  /**
   * Chunk "Version" byte (LevelDB key 0x2C).
   * 42 = the chunk format iPhone Bedrock 1.26.51 writes on export (41 was used
   * through ~1.21.x). An older value risks the client regenerating the chunk.
   */
  chunkVersion: 42,
  /**
   * Subchunk payload version. 9 = 1.18+ (modern). 8 is kept as a supported
   * fallback that older tooling/clients upgrade automatically; flip it with
   * `--subchunk-version=8` if a device ever refuses the modern payload.
   */
  subChunkVersion: 9 as 8 | 9,

  /** Vertical range that is actually generated. */
  minY: 0,
  maxY: 127,

  /**
   * Realm footprint in chunks (704 x 704 blocks). Big enough that every
   * landmark sits well inside the plate with a rim of void around it - the
   * island itself covers roughly 317k of the 495k columns.
   */
  realm: {
    minChunkX: -22,
    maxChunkX: 21,
    minChunkZ: -22,
    maxChunkZ: 21,
  } satisfies RealmBounds,

  /** Terrain shaping. */
  terrain: {
    /** Base surface height of the wasteland plain. */
    baseHeight: 46,
    /** How thick the floating plate is before it tapers into void. */
    plateDepth: 26,
    /** Amplitude of rolling wasteland relief (raised slightly for more character). */
    reliefAmplitude: 9,
    /** Landmass radius (blocks) of the main realm. */
    realmRadius: 300,
    /** The void gulf west of the Center, crossed only by glass bridges. */
    voidGulf: { minX: -108, maxX: -72 },
    /**
     * The western reach begins to darken here - just west of the Center, so the
     * gradient is already visible by the time the player reaches the gulf.
     */
    darkEdgeStartX: -58,
    /**
     * ...and is at its darkest by this edge (canon: "the sky and void grow
     * increasingly darker as the proximity to the end shortens"). This sits
     * beyond the Citadel, Tomb and Portal Lobby, so every built place in the
     * west is a step further into the dark rather than a light island.
     */
    darkEdgeX: -218,
  },

  levelName: "Underworld",
} as const;

export const REALM = CONFIG.realm;
export const CHUNKS_X = REALM.maxChunkX - REALM.minChunkX + 1;
export const CHUNKS_Z = REALM.maxChunkZ - REALM.minChunkZ + 1;
export const WORLD_MIN_X = REALM.minChunkX * 16;
export const WORLD_MAX_X = (REALM.maxChunkX + 1) * 16 - 1;
export const WORLD_MIN_Z = REALM.minChunkZ * 16;
export const WORLD_MAX_Z = (REALM.maxChunkZ + 1) * 16 - 1;
export const WORLD_HEIGHT = CONFIG.maxY - CONFIG.minY + 1;

/** Index helpers for the flat realm-wide grids (height map, land mask, ...). */
export const GRID_SIZE = CHUNKS_X * 16 * CHUNKS_Z * 16;
export function gridIndex(x: number, z: number): number {
  return (z - WORLD_MIN_Z) * (CHUNKS_X * 16) + (x - WORLD_MIN_X);
}
