/**
 * Deterministic noise + RNG helpers. No dependencies: the same seed always
 * produces the same map, which is what makes the reconstruction reproducible
 * (`MAP_SEED` in `src/world/layout.ts`).
 */

const HASH_C1 = 0x27d4eb2d;
const HASH_C2 = 0x85ebca6b;

function mix32(a: number): number {
  a = (a ^ (a >>> 16)) >>> 0;
  a = Math.imul(a, HASH_C1) >>> 0;
  a = (a ^ (a >>> 15)) >>> 0;
  a = Math.imul(a, HASH_C2) >>> 0;
  return (a ^ (a >>> 16)) >>> 0;
}

/** 2D integer hash -> [0,1) */
export function hash2(x: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 0x1f1f1f1f) ^ Math.imul(z | 0, 0x3b9aca07) ^ Math.imul(seed | 0, 0x9e3779b9)) >>> 0;
  return mix32(h) / 4294967296;
}

/** 3D integer hash -> [0,1) */
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 0x1f1f1f1f) ^ Math.imul(y | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x3b9aca07) ^ Math.imul(seed | 0, 0x9e3779b9)) >>> 0;
  return mix32(h) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Classic 2D value noise in [0,1). */
export function valueNoise2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const tz = smooth(z - z0);
  const c00 = hash2(x0, z0, seed);
  const c10 = hash2(x0 + 1, z0, seed);
  const c01 = hash2(x0, z0 + 1, seed);
  const c11 = hash2(x0 + 1, z0 + 1, seed);
  const a = c00 + (c10 - c00) * tx;
  const b = c01 + (c11 - c01) * tx;
  return a + (b - a) * tz;
}

export interface FbmOptions {
  octaves?: number;
  frequency?: number;
  gain?: number;
  lacunarity?: number;
  ridged?: boolean;
}

/** Fractal Brownian motion in [0,1), optionally ridged (for mountain spines). */
export function fbm(x: number, z: number, seed: number, opts: FbmOptions = {}): number {
  const octaves = opts.octaves ?? 4;
  const gain = opts.gain ?? 0.5;
  const lacunarity = opts.lacunarity ?? 2;
  let freq = opts.frequency ?? 1 / 64;
  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = valueNoise2(x * freq, z * freq, seed + o * 7919);
    if (opts.ridged) n = 1 - Math.abs(n * 2 - 1);
    sum += n * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Small deterministic RNG (mulberry32). */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))]!;
  }
}
