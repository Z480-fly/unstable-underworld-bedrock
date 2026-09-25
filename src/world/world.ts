/**
 * The voxel buffer the whole map is painted into.
 *
 * Storage is per chunk: a `Uint16Array` of palette indices plus that chunk's
 * palette. The buffer is laid out Y-major (`x + 16 * z + 256 * y`) so that a
 * subchunk is 4096 *consecutive* entries, which keeps the painting passes fast.
 *
 * That is NOT the order Bedrock stores a subchunk layer in. Bedrock walks a
 * subchunk XZY (Y fastest): index = `(x << 8) | (z << 4) | y`. Writing the
 * buffer layout straight into the payload silently swaps the X and Y axes, and
 * the imported world comes out as horizontal stripes of terrain instead of the
 * intended island. `subChunkSlice` therefore transposes while it copies.
 */

import { AIR, blockKey, stabilize, type BlockState } from "./blocks.ts";
import { CHUNKS_X, CHUNKS_Z, GRID_SIZE, WORLD_HEIGHT, WORLD_MIN_X, WORLD_MIN_Z } from "./config.ts";

export const SUB = 16;
const SUB_VOLUME = SUB * SUB * SUB;

export class ChunkBuffer {
  readonly ids: Uint16Array;
  readonly palette: BlockState[] = [];
  private readonly paletteIndex = new Map<string, number>();

  constructor(
    readonly cx: number,
    readonly cz: number,
  ) {
    this.ids = new Uint16Array(SUB * SUB * WORLD_HEIGHT);
    // Palette index 0 is always air: an untouched cell of the buffer therefore
    // reads as air rather than as whatever block happened to be added first.
    this.palette.push(AIR);
    this.paletteIndex.set(blockKey(AIR), 0);
  }

  idFor(block: BlockState): number {
    const key = blockKey(block);
    let id = this.paletteIndex.get(key);
    if (id === undefined) {
      id = this.palette.length;
      this.palette.push(block);
      this.paletteIndex.set(key, id);
    }
    return id;
  }

  /**
   * localX/localZ 0..15, localY 0..WORLD_HEIGHT-1.
   *
   * Every write goes through `stabilize`, which is what guarantees the finished
   * world contains no gravity blocks (see blocks.ts): a falling block in an
   * imported Bedrock world drops out of the terrain and shreds the landscape.
   */
  setLocal(localX: number, localY: number, localZ: number, block: BlockState): void {
    this.ids[localX + (localZ << 4) + (localY << 8)] = this.idFor(stabilize(block));
  }

  getLocal(localX: number, localY: number, localZ: number): BlockState | undefined {
    const id = this.ids[localX + (localZ << 4) + (localY << 8)]!;
    return this.palette[id];
  }

  /**
   * True only when every block in this subchunk is air (in which case the
   * subchunk is simply left out of the database - that is the single biggest
   * size win for a mobile world).
   */
  isSubChunkEmpty(subY: number): boolean {
    const start = subY * SUB_VOLUME;
    const end = start + SUB_VOLUME;
    for (let i = start; i < end; i++) {
      const block = this.palette[this.ids[i]!];
      if (block !== undefined && block.name !== "minecraft:air") return false;
    }
    return true;
  }

  /**
   * Palette indices for a 16x16x16 subchunk, remapped to a fresh palette and
   * reordered into Bedrock's XZY layout (`(x << 8) | (z << 4) | y`).
   *
   * The outer loop runs over the destination index so `ids` comes out in the
   * exact order the subchunk serializer must pack, and the source lookup uses
   * this buffer's Y-major layout.
   */
  subChunkSlice(subY: number): { ids: Uint16Array; palette: BlockState[] } {
    const start = subY * SUB_VOLUME;
    const ids = new Uint16Array(SUB_VOLUME);
    const palette: BlockState[] = [];
    const remap = new Map<number, number>();
    const used = new Set<number>();
    for (let y = 0; y < SUB; y++) {
      for (let z = 0; z < SUB; z++) {
        for (let x = 0; x < SUB; x++) {
          const id = this.ids[start + x + (z << 4) + (y << 8)]!;
          let mapped = remap.get(id);
          if (mapped === undefined) {
            mapped = palette.length;
            palette.push(this.palette[id] ?? AIR);
            remap.set(id, mapped);
            used.add(mapped);
          }
          ids[(x << 8) | (z << 4) | y] = mapped;
        }
      }
    }
    // Keep the palette tight: drop entries that are never referenced.
    if (used.size !== palette.length) {
      const compact: BlockState[] = [];
      const compactMap = new Map<number, number>();
      for (const id of used) {
        compactMap.set(id, compact.length);
        compact.push(palette[id]!);
      }
      for (let i = 0; i < SUB_VOLUME; i++) ids[i] = compactMap.get(ids[i]!)!;
      return { ids, palette: compact };
    }
    return { ids, palette };
  }
}

export class World {
  private readonly chunks: (ChunkBuffer | undefined)[] = new Array(CHUNKS_X * CHUNKS_Z);
  /** Surface height per column (realm-wide grid). */
  readonly surface = new Int16Array(GRID_SIZE);
  /** 1 = solid land, 0 = void. */
  readonly land = new Uint8Array(GRID_SIZE);
  /** 1 = protected from terrain-decay passes (roads, building footprints). */
  readonly protected_ = new Uint8Array(GRID_SIZE);

  chunk(cx: number, cz: number): ChunkBuffer | undefined {
    if (cx < -(CHUNKS_X >> 1) || cx > CHUNKS_X - 1 - (CHUNKS_X >> 1)) return undefined;
    if (cz < -(CHUNKS_Z >> 1) || cz > CHUNKS_Z - 1 - (CHUNKS_Z >> 1)) return undefined;
    return this.chunks[(cz + (CHUNKS_Z >> 1)) * CHUNKS_X + (cx + (CHUNKS_X >> 1))];
  }

  chunkOrCreate(cx: number, cz: number): ChunkBuffer {
    const existing = this.chunk(cx, cz);
    if (existing) return existing;
    const index = (cz + (CHUNKS_Z >> 1)) * CHUNKS_X + (cx + (CHUNKS_X >> 1));
    if (index < 0 || index >= this.chunks.length) {
      throw new Error(`chunk ${cx},${cz} outside realm`);
    }
    const created = new ChunkBuffer(cx, cz);
    this.chunks[index] = created;
    return created;
  }

  allChunks(): ChunkBuffer[] {
    const out: ChunkBuffer[] = [];
    for (const chunk of this.chunks) if (chunk) out.push(chunk);
    return out;
  }

  // -- grids -----------------------------------------------------------------
  surfaceAt(x: number, z: number): number {
    const i = (z - WORLD_MIN_Z) * (CHUNKS_X * 16) + (x - WORLD_MIN_X);
    return this.surface[i]!;
  }

  setSurface(x: number, z: number, y: number): void {
    const i = (z - WORLD_MIN_Z) * (CHUNKS_X * 16) + (x - WORLD_MIN_X);
    this.surface[i] = y;
  }

  isLand(x: number, z: number): boolean {
    const i = (z - WORLD_MIN_Z) * (CHUNKS_X * 16) + (x - WORLD_MIN_X);
    return this.land[i] === 1;
  }

  setLand(x: number, z: number, value: boolean): void {
    const i = (z - WORLD_MIN_Z) * (CHUNKS_X * 16) + (x - WORLD_MIN_X);
    this.land[i] = value ? 1 : 0;
  }

  protect(x: number, z: number, radius = 0): void {
    const x0 = Math.max(WORLD_MIN_X, x - radius);
    const x1 = Math.min(WORLD_MIN_X + CHUNKS_X * 16 - 1, x + radius);
    const z0 = Math.max(WORLD_MIN_Z, z - radius);
    const z1 = Math.min(WORLD_MIN_Z + CHUNKS_Z * 16 - 1, z + radius);
    for (let zz = z0; zz <= z1; zz++) {
      for (let xx = x0; xx <= x1; xx++) {
        this.protected_[(zz - WORLD_MIN_Z) * (CHUNKS_X * 16) + (xx - WORLD_MIN_X)] = 1;
      }
    }
  }

  isProtected(x: number, z: number): boolean {
    return this.protected_[(z - WORLD_MIN_Z) * (CHUNKS_X * 16) + (x - WORLD_MIN_X)] === 1;
  }

  inRealm(x: number, z: number): boolean {
    return (
      x >= WORLD_MIN_X && x < WORLD_MIN_X + CHUNKS_X * 16 && z >= WORLD_MIN_Z && z < WORLD_MIN_Z + CHUNKS_Z * 16
    );
  }

  // -- block access ----------------------------------------------------------
  set(x: number, y: number, z: number, block: BlockState | null): void {
    if (block === null) return;
    if (y < 0 || y >= WORLD_HEIGHT) return;
    if (!this.inRealm(x, z)) return;
    const chunk = this.chunkOrCreate(x >> 4, z >> 4);
    chunk.setLocal(x & 15, y, z & 15, block);
  }

  get(x: number, y: number, z: number): BlockState | undefined {
    if (y < 0 || y >= WORLD_HEIGHT || !this.inRealm(x, z)) return undefined;
    const chunk = this.chunk(x >> 4, z >> 4);
    if (!chunk) return undefined;
    return chunk.getLocal(x & 15, y, z & 15);
  }

  // -- primitives ------------------------------------------------------------
  fill(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: BlockState): void {
    const ax = Math.min(x1, x2), bx = Math.max(x1, x2);
    const ay = Math.min(y1, y2), by = Math.max(y1, y2);
    const az = Math.min(z1, z2), bz = Math.max(z1, z2);
    for (let y = ay; y <= by; y++) {
      for (let z = az; z <= bz; z++) {
        for (let x = ax; x <= bx; x++) this.set(x, y, z, block);
      }
    }
  }

  /** Solid box shell (walls + roof + floor), optionally open at the top. */
  hollowBox(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    block: BlockState,
    opts: { roof?: boolean; floor?: boolean } = {},
  ): void {
    const roof = opts.roof ?? true;
    const floor = opts.floor ?? true;
    for (let y = y1; y <= y2; y++) {
      for (let z = z1; z <= z2; z++) {
        for (let x = x1; x <= x2; x++) {
          const edge = x === x1 || x === x2 || z === z1 || z === z2;
          const cap = (roof && y === y2) || (floor && y === y1);
          if (edge || cap) this.set(x, y, z, block);
        }
      }
    }
  }

  /** Cylinder (vertical). */
  cylinder(cx: number, cz: number, radius: number, y1: number, y2: number, block: BlockState, hollow = false): void {
    const r2 = radius * radius;
    const inner = (radius - 1) * (radius - 1);
    for (let y = y1; y <= y2; y++) {
      for (let z = -radius; z <= radius; z++) {
        for (let x = -radius; x <= radius; x++) {
          const d = x * x + z * z;
          if (d > r2) continue;
          if (hollow && d < inner) continue;
          this.set(cx + x, y, cz + z, block);
        }
      }
    }
  }

  /** Filled disc in the XZ plane at a single Y. */
  disc(cx: number, cz: number, radius: number, y: number, block: BlockState): void {
    const r2 = radius * radius;
    for (let z = -radius; z <= radius; z++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + z * z <= r2) this.set(cx + x, y, cz + z, block);
      }
    }
  }

  /** Circle outline in the XZ plane at a single Y. */
  ring(cx: number, cz: number, radius: number, y: number, block: BlockState): void {
    const steps = Math.max(12, Math.round(radius * 6));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      this.set(cx + Math.round(Math.cos(a) * radius), y, cz + Math.round(Math.sin(a) * radius), block);
    }
  }

  /** Rectangular outline of walls between two heights. */
  rectWalls(x1: number, z1: number, x2: number, z2: number, y1: number, y2: number, block: BlockState): void {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        this.set(x, y, z1, block);
        this.set(x, y, z2, block);
      }
      for (let z = z1; z <= z2; z++) {
        this.set(x1, y, z, block);
        this.set(x2, y, z, block);
      }
    }
  }

  /** Bresenham line in the XZ plane, painted from y1 to y2 (perpendicular width). */
  line(x1: number, z1: number, x2: number, z2: number, y: number, block: BlockState, width = 0): void {
    let dx = Math.abs(x2 - x1);
    let dz = Math.abs(z2 - z1);
    const sx = x1 < x2 ? 1 : -1;
    const sz = z1 < z2 ? 1 : -1;
    let err = dx - dz;
    let x = x1;
    let z = z1;
    for (;;) {
      if (width <= 0) {
        this.set(x, y, z, block);
      } else {
        this.fill(x - width, y, z - width, x + width, y, z + width, block);
      }
      if (x === x2 && z === z2) break;
      const e2 = 2 * err;
      if (e2 > -dz) {
        err -= dz;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        z += sz;
      }
    }
  }

  /** Vertical column. */
  column(x: number, z: number, y1: number, y2: number, block: BlockState): void {
    for (let y = y1; y <= y2; y++) this.set(x, y, z, block);
  }

  /** Replace only air - used when decorating so builds are never overwritten. */
  setIfAir(x: number, y: number, z: number, block: BlockState): void {
    const existing = this.get(x, y, z);
    if (existing === undefined || existing.name === "minecraft:air") this.set(x, y, z, block);
  }

  /** Carve a sphere of air (craters, pits, voids) and re-survey the columns. */
  carveSphere(cx: number, cy: number, cz: number, radius: number): void {
    const r2 = radius * radius;
    for (let y = -radius; y <= radius; y++) {
      for (let z = -radius; z <= radius; z++) {
        for (let x = -radius; x <= radius; x++) {
          if (x * x + y * y + z * z <= r2) this.set(cx + x, cy + y, cz + z, AIR);
        }
      }
    }
    for (let z = cz - radius; z <= cz + radius; z++) {
      for (let x = cx - radius; x <= cx + radius; x++) this.rescanSurface(x, z);
    }
  }

  /**
   * Re-reads the real top block of a column into the surface grid. Called after
   * carving so later passes (roads, decoration, the spawn point) see the terrain
   * the player will actually stand on.
   */
  rescanSurface(x: number, z: number): void {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const block = this.get(x, y, z);
      if (block !== undefined && block.name !== "minecraft:air") {
        this.setSurface(x, z, y);
        return;
      }
    }
  }
}
