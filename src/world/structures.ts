/**
 * Reusable builders. Every landmark in `areas.ts` is assembled from these, which
 * keeps the reconstruction readable: the Citadel, the Withered Castle and the
 * void castles all use the same tower/wall/gate primitives, just at different
 * scales and with different materials.
 *
 * All builders take *world* coordinates and ask the terrain for the local ground
 * height, so nothing floats.
 */

import { AIR, P, slab, stairs, wall, type BlockState } from "./blocks.ts";
import type { World } from "./world.ts";
import { Rng } from "./noise.ts";
import type { RectRegion } from "./layout.ts";

export interface BuildStyle {
  wall: BlockState;
  accent: BlockState;
  trim: BlockState;
  roof: BlockState;
  floor: BlockState;
  light: BlockState;
  fence?: BlockState;
}

export const DEEPSLATE_STYLE: BuildStyle = {
  wall: P.deepslateBricks,
  accent: P.polishedDeepslate,
  trim: P.chiseledDeepslate,
  roof: P.deepslateTiles,
  floor: P.polishedDeepslate,
  light: P.soulLantern,
  fence: P.darkOakFence,
};

export const BLACKSTONE_STYLE: BuildStyle = {
  wall: P.blackstoneBricks,
  accent: P.chiseledBlackstone,
  trim: P.gildedBlackstone,
  roof: P.crackedBlackstoneBricks,
  floor: P.polishedBlackstone,
  light: P.soulLantern,
  fence: P.spruceFence,
};

export const STONE_STYLE: BuildStyle = {
  wall: P.stoneBrick,
  accent: P.chiseledStoneBrick,
  trim: P.mossyStoneBrick,
  roof: P.crackedStoneBrick,
  floor: P.stoneBrick,
  light: P.lantern,
  fence: P.darkOakFence,
};

export function groundY(world: World, x: number, z: number): number {
  return world.surfaceAt(x, z);
}

/** Average ground height over an area, used as the build level for a structure. */
export function areaGround(world: World, rect: RectRegion): number {
  let sum = 0;
  let count = 0;
  for (let z = rect.z1; z <= rect.z2; z += 3) {
    for (let x = rect.x1; x <= rect.x2; x += 3) {
      sum += world.surfaceAt(x, z);
      count++;
    }
  }
  return Math.round(sum / Math.max(1, count));
}

/**
 * Levels an area to `level`: fills hollows and cuts high ground, then lays a
 * paved top. Buildings are always placed on a levelled pad so they read as
 * deliberate constructions on the wasteland.
 */
export function pad(
  world: World,
  rect: RectRegion,
  level: number,
  top: BlockState,
  fill: BlockState = P.cobbledDeepslate,
  edgeRamp = true,
): void {
  // Always force a solid foundation under landmarks so nothing floats or sinks
  // into the void even if terrain carving was aggressive.
  for (let z = rect.z1 - (edgeRamp ? 4 : 0); z <= rect.z2 + (edgeRamp ? 4 : 0); z++) {
    for (let x = rect.x1 - (edgeRamp ? 4 : 0); x <= rect.x2 + (edgeRamp ? 4 : 0); x++) {
      if (!world.inRealm(x, z)) continue;
      const inside = x >= rect.x1 && x <= rect.x2 && z >= rect.z1 && z <= rect.z2;
      let surface = world.surfaceAt(x, z);

      // If the column was previously void, create a solid pillar up to the pad.
      if (!world.isLand(x, z) || surface < 8) {
        surface = Math.max(8, level - 12);
        for (let y = 0; y <= surface; y++) {
          world.set(x, y, z, y <= 2 ? P.deepslate : fill);
        }
        world.setLand(x, z, true);
        world.setSurface(x, z, surface);
      }

      if (!inside) {
        // Gentle blend so the pad does not look like a floating slab.
        if (surface < level) {
          for (let y = surface + 1; y <= Math.min(level - 1, surface + 4); y++) world.set(x, y, z, fill);
          world.setSurface(x, z, Math.min(level - 1, surface + 4));
        }
        continue;
      }
      if (surface < level) {
        for (let y = surface + 1; y <= level; y++) world.set(x, y, z, y === level ? top : fill);
      } else if (surface > level) {
        for (let y = level + 1; y <= surface; y++) world.set(x, y, z, AIR);
        world.set(x, level, z, top);
      } else {
        world.set(x, level, z, top);
      }
      // Thick solid under the pad so nothing can fall through.
      for (let y = level - 1; y >= Math.max(0, level - 10); y--) {
        if (!world.get(x, y, z) || world.get(x, y, z)!.name === "minecraft:air") {
          world.set(x, y, z, fill);
        }
      }
      world.setSurface(x, z, level);
      world.setLand(x, z, true);
      world.protect(x, z);
    }
  }
}

/** Square or round tower with battlements and a lit crown. */
export function tower(
  world: World,
  cx: number,
  cz: number,
  radius: number,
  baseY: number,
  height: number,
  style: BuildStyle,
  opts: { round?: boolean; crown?: boolean; doorFacing?: 0 | 1 | 2 | 3; windows?: boolean } = {},
): void {
  const round = opts.round ?? true;
  const top = baseY + height;
  if (round) {
    world.cylinder(cx, cz, radius, baseY, top - 3, style.wall, true);
    world.cylinder(cx, cz, radius + 1, baseY - 2, baseY, style.accent, false);
    world.disc(cx, cz, radius, top - 3, style.floor);
    // battlements
    for (let z = -radius - 1; z <= radius + 1; z++) {
      for (let x = -radius - 1; x <= radius + 1; x++) {
        const d = Math.hypot(x, z);
        if (d > radius + 0.6 || d < radius - 1.4) continue;
        if (((x + z) & 1) === 0) {
          world.set(cx + x, top - 2, cz + z, style.wall);
          world.set(cx + x, top - 1, cz + z, style.wall);
        }
      }
    }
  } else {
    const r = radius;
    world.hollowBox(cx - r, baseY, cz - r, cx + r, top - 3, cz + r, style.wall, { roof: false, floor: false });
    world.fill(cx - r - 1, baseY - 2, cz - r - 1, cx + r + 1, baseY, cz + r + 1, style.accent);
    world.fill(cx - r, top - 3, cz - r, cx + r, top - 3, cz + r, style.floor);
    world.rectWalls(cx - r, cz - r, cx + r, cz + r, top - 2, top - 1, style.wall);
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x & 1) === 0) {
        world.set(x, top, cz - r, style.trim);
        world.set(x, top, cz + r, style.trim);
      }
    }
    for (let z = cz - r; z <= cz + r; z++) {
      if ((z & 1) === 0) {
        world.set(cx - r, top, z, style.trim);
        world.set(cx + r, top, z, style.trim);
      }
    }
  }

  if (opts.crown) {
    world.column(cx, cz, top - 3, top + 3, style.trim);
    world.set(cx, top + 4, cz, lightBlock(style));
    world.set(cx, top + 3, cz, P.chain);
  }

  if (opts.windows !== false) {
    const r = radius;
    for (let y = baseY + 4; y < top - 6; y += 5) {
      world.set(cx, y, cz - r, P.ironBars);
      world.set(cx, y, cz + r, P.ironBars);
      world.set(cx - r, y, cz, P.ironBars);
      world.set(cx + r, y, cz, P.ironBars);
      world.set(cx, y + 1, cz - r, style.accent);
      world.set(cx, y + 1, cz + r, style.accent);
      world.set(cx - r, y + 1, cz, style.accent);
      world.set(cx + r, y + 1, cz, style.accent);
    }
  }

  if (opts.doorFacing !== undefined) {
    const dir = opts.doorFacing;
    const dx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
    const dz = dir === 2 ? 1 : dir === 3 ? -1 : 0;
    for (let y = baseY; y <= baseY + 2; y++) {
      const px = cx + dx * (radius + 1);
      const pz = cz + dz * (radius + 1);
      if (dx !== 0) {
        world.set(px, y, pz - 1, AIR);
        world.set(px, y, pz, AIR);
        world.set(px, y, pz + 1, AIR);
      } else {
        world.set(px - 1, y, pz, AIR);
        world.set(px, y, pz, AIR);
        world.set(px + 1, y, pz, AIR);
      }
    }
  }
}

function lightBlock(style: BuildStyle): BlockState {
  return style.light;
}

/** Curtain wall with a walkway and crenellations. `gates` are openings. */
export function curtainWall(
  world: World,
  rect: RectRegion,
  baseY: number,
  height: number,
  style: BuildStyle,
  gates: Array<{ x: number; z: number; halfWidth: number; facing: 0 | 1 | 2 | 3 }> = [],
): void {
  const { x1, z1, x2, z2 } = rect;
  const top = baseY + height;
  const inGate = (x: number, z: number): boolean =>
    gates.some((g) =>
      g.facing === 0 || g.facing === 1
        ? Math.abs(z - g.z) <= g.halfWidth && Math.abs(x - g.x) <= height
        : Math.abs(x - g.x) <= g.halfWidth && Math.abs(z - g.z) <= height,
    );

  for (let y = baseY; y <= top; y++) {
    for (let x = x1; x <= x2; x++) {
      for (const z of [z1, z2]) {
        if (y <= baseY + 3 && inGate(x, z)) continue;
        world.set(x, y, z, y === top ? style.trim : y === baseY ? style.accent : style.wall);
      }
    }
    for (let z = z1; z <= z2; z++) {
      for (const x of [x1, x2]) {
        if (y <= baseY + 3 && inGate(x, z)) continue;
        world.set(x, y, z, y === top ? style.trim : y === baseY ? style.accent : style.wall);
      }
    }
  }

  // inner walkway
  for (let x = x1 + 1; x <= x2 - 1; x++) {
    world.set(x, top - 3, z1 + 1, style.floor);
    world.set(x, top - 3, z2 - 1, style.floor);
  }
  for (let z = z1 + 1; z <= z2 - 1; z++) {
    world.set(x1 + 1, top - 3, z, style.floor);
    world.set(x2 - 1, top - 3, z, style.floor);
  }

  // crenellations
  for (let x = x1; x <= x2; x++) {
    if ((x & 1) === 0) {
      world.set(x, top + 1, z1, style.wall);
      world.set(x, top + 1, z2, style.wall);
    }
  }
  for (let z = z1; z <= z2; z++) {
    if ((z & 1) === 0) {
      world.set(x1, top + 1, z, style.wall);
      world.set(x2, top + 1, z, style.wall);
    }
  }

  // wall-top lanterns every 12 blocks
  for (let x = x1 + 6; x <= x2 - 6; x += 12) {
    for (const z of [z1, z2]) {
      world.set(x, top + 1, z, style.trim);
      world.set(x, top + 2, z, style.light);
    }
  }
  for (let z = z1 + 6; z <= z2 - 6; z += 12) {
    for (const x of [x1, x2]) {
      world.set(x, top + 1, z, style.trim);
      world.set(x, top + 2, z, style.light);
    }
  }
}

/** Gatehouse: a pair of flanking towers and an arch over the road. */
export function gatehouse(
  world: World,
  x: number,
  z: number,
  baseY: number,
  style: BuildStyle,
  facing: 0 | 1 | 2 | 3,
  opts: { open?: boolean; height?: number } = {},
): void {
  const height = opts.height ?? 11;
  const along = facing === 0 || facing === 1 ? "z" : "x";
  const halfSpread = 6;
  for (const s of [-halfSpread, halfSpread]) {
    const tx = along === "z" ? x : x + s;
    const tz = along === "z" ? z + s : z;
    tower(world, tx, tz, 3, baseY, height + 3, style, { round: false, crown: true });
  }
  // arch
  for (let i = -halfSpread + 2; i <= halfSpread - 2; i++) {
    const px = along === "z" ? x : x + i;
    const pz = along === "z" ? z + i : z;
    for (let y = baseY + 4; y <= baseY + height; y++) {
      world.set(px, y, pz, style.wall);
    }
    world.set(px, baseY + height + 1, pz, style.trim);
  }
  if (!opts.open) {
    for (let i = -halfSpread + 2; i <= halfSpread - 2; i++) {
      const px = along === "z" ? x : x + i;
      const pz = along === "z" ? z + i : z;
      for (let y = baseY; y <= baseY + 3; y++) world.set(px, y, pz, P.ironBars);
    }
  }
  world.set(x, baseY + height - 1, z, lightBlock(style));
}

/** Rectangular keep with corner turrets, gilded trim and banners. */
export function keep(
  world: World,
  cx: number,
  cz: number,
  width: number,
  depth: number,
  baseY: number,
  height: number,
  style: BuildStyle,
  opts: { bannerColor?: BlockState; goldCrown?: boolean } = {},
): void {
  const hw = width >> 1;
  const hd = depth >> 1;
  const rect: RectRegion = { kind: "rect", x1: cx - hw, z1: cz - hd, x2: cx + hw, z2: cz + hd };
  curtainWall(world, rect, baseY, height, style, [{ x: cx, z: cz + hd, halfWidth: 2, facing: 2 }]);
  // interior floors
  for (let y = baseY + 4; y < baseY + height - 3; y += 4) {
    for (let z = cz - hd + 1; z <= cz + hd - 1; z++) {
      for (let x = cx - hw + 1; x <= cx + hw - 1; x++) {
        world.set(x, y, z, style.floor);
      }
    }
    // interior lighting
    world.set(cx - hw + 3, y + 2, cz, style.light);
    world.set(cx + hw - 3, y + 2, cz, style.light);
  }
  for (const sx of [-hw, hw]) {
    for (const sz of [-hd, hd]) {
      tower(world, cx + sx, cz + sz, 3, baseY, height + 7, style, { round: true, crown: true });
    }
  }
  if (opts.goldCrown) {
    world.fill(cx - 2, baseY + height - 2, cz - 2, cx + 2, baseY + height - 2, cz + 2, P.goldBlock);
    world.set(cx, baseY + height - 1, cz, P.gildedBlackstone);
  }
  if (opts.bannerColor) {
    for (const sx of [-hw + 1, hw - 1]) {
      for (let y = baseY + height - 4; y <= baseY + height - 2; y++) {
        world.set(cx + sx, y, cz + hd, y === baseY + height - 3 ? P.goldBlock : opts.bannerColor);
      }
    }
  }
}

/** Small house / cottage with a pitched roof - used for the fields and village. */
export function house(
  world: World,
  cx: number,
  cz: number,
  width: number,
  depth: number,
  baseY: number,
  height: number,
  style: BuildStyle,
  opts: { ruined?: boolean; face?: 0 | 1 | 2 | 3 } = {},
): void {
  const rng = new Rng((cx * 7919 + cz * 104729) ^ 0x5f3a);
  const hw = width >> 1;
  const hd = depth >> 1;
  const top = baseY + height;

  for (let y = baseY; y <= top; y++) {
    for (let z = cz - hd; z <= cz + hd; z++) {
      for (let x = cx - hw; x <= cx + hw; x++) {
        const edge = x === cx - hw || x === cx + hw || z === cz - hd || z === cz + hd;
        if (opts.ruined && rng.chance(0.12)) continue;
        if (edge) {
          world.set(x, y, z, y === baseY ? style.accent : style.wall);
        } else if (y === top) {
          world.set(x, y, z, style.roof);
        }
      }
    }
  }
  world.fill(cx - hw, baseY, cz - hd, cx + hw, baseY, cz + hd, style.floor);

  // pitched roof
  for (let i = 1; i <= Math.min(hw, 4); i++) {
    const y = top + i;
    const xa = cx - hw + i;
    const xb = cx + hw - i;
    if (xa > xb) break;
    for (let z = cz - hd - 1; z <= cz + hd + 1; z++) {
      world.set(xa, y, z, style.roof);
      world.set(xb, y, z, style.roof);
    }
  }

  // windows and door
  const face = opts.face ?? 2;
  for (let z = cz - hd + 2; z <= cz + hd - 2; z += 3) {
    for (const x of [cx - hw, cx + hw]) {
      world.set(x, baseY + 2, z, P.glass);
      world.set(x, baseY + 3, z, style.trim);
    }
  }
  for (let x = cx - hw + 2; x <= cx + hw - 2; x += 3) {
    for (const z of [cz - hd, cz + hd]) {
      world.set(x, baseY + 2, z, P.glass);
      world.set(x, baseY + 3, z, style.trim);
    }
  }
  const dx = face === 0 ? 1 : face === 1 ? -1 : 0;
  const dz = face === 2 ? 1 : face === 3 ? -1 : 0;
  for (let y = baseY; y <= baseY + 2; y++) {
    world.set(cx + dx * hw, y, cz + dz * hd, AIR);
  }
  world.set(cx + dx * hw, baseY + 3, cz + dz * hd, style.trim);
  world.set(cx + dx * (hw - 1), top, cz + dz * (hd - 1), style.light);
}

/** Arched stone bridge between two points; piers reach down to the ground. */
export function bridge(
  world: World,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  deckY: number,
  style: BuildStyle,
  opts: { broken?: boolean; railings?: boolean; width?: number } = {},
): void {
  const width = opts.width ?? 3;
  const length = Math.hypot(x2 - x1, z2 - z1);
  const steps = Math.max(2, Math.ceil(length));
  const rng = new Rng((x1 * 31 + z1 * 17 + x2 * 7 + z2 * 13) ^ 0x1234);
  const vertical = Math.abs(x2 - x1) < Math.abs(z2 - z1);

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = Math.round(x1 + (x2 - x1) * t);
    const cz = Math.round(z1 + (z2 - z1) * t);
    const isBroken = opts.broken === true && t > 0.4 && t < 0.58;
    for (let w = -width; w <= width; w++) {
      const px = vertical ? cx + w : cx;
      const pz = vertical ? cz : cz + w;
      if (isBroken && rng.chance(0.75)) continue;
      world.set(px, deckY, pz, style.floor);
      if (opts.railings !== false) {
        const railEdge = Math.abs(w) === width;
        if (railEdge && !isBroken) {
          world.set(px, deckY + 1, pz, ((px + pz) & 1) === 0 ? style.trim : AIR);
        }
      }
    }
    // pier every ~6 blocks
    if (s % 6 === 0 && !isBroken) {
      const ground = world.surfaceAt(cx, cz);
      if (ground < deckY) {
        world.fill(cx, ground, cz, cx, deckY - 1, cz, style.wall);
        world.set(cx, deckY - 1, cz, style.accent);
      }
    }
  }
}

/** Glass bridge: the link between the void castles. */
export function glassBridge(
  world: World,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  deckY: number,
  opts: { width?: number; sag?: number; deckY2?: number } = {},
): void {
  const width = opts.width ?? 2;
  const sag = opts.sag ?? 2;
  const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, z2 - z1)));
  const vertical = Math.abs(x2 - x1) < Math.abs(z2 - z1);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = Math.round(x1 + (x2 - x1) * t);
    const cz = Math.round(z1 + (z2 - z1) * t);
    const dip = Math.round(Math.sin(t * Math.PI) * sag);
    for (let w = -width; w <= width; w++) {
      const px = vertical ? cx + w : cx;
      const pz = vertical ? cz : cz + w;
      const fall = opts.deckY2 === undefined ? 0 : (opts.deckY2 - deckY) * t;
      const deck = Math.round(deckY + fall) - dip;
      world.set(px, deck, pz, Math.abs(w) === width ? P.grayGlass : P.glass);
      if (Math.abs(w) === width) world.set(px, deck + 1, pz, P.grayGlass);
    }
    if (s % 8 === 0) {
      const supportX = vertical ? cx : cx - width - 1;
      world.column(supportX, cz, deckY - 6, deckY - 1, P.darkOakFence);
    }
  }
}

/** Broken arch / viaduct leg. */
export function ruinedArch(world: World, cx: number, cz: number, baseY: number, height: number, style: BuildStyle, alongX = true): void {
  const rng = new Rng((cx * 131 + cz * 977) ^ 0xabc);
  const half = 4;
  for (let i = 0; i <= height; i++) {
    const y = baseY + i;
    if (i > height * 0.55 && rng.chance(0.35)) continue;
    for (const s of [-half, half]) {
      const px = alongX ? cx + s : cx;
      const pz = alongX ? cz : cz + s;
      world.set(px, y, pz, style.wall);
      if (i < 2) {
        world.set(px + (alongX ? 1 : 0), y, pz + (alongX ? 0 : 1), style.accent);
        world.set(px - (alongX ? 1 : 0), y, pz - (alongX ? 0 : 1), style.accent);
      }
    }
  }
  // arch span
  for (let x = -half; x <= half; x++) {
    const archY = baseY + height - Math.round(Math.sqrt(Math.max(0, half * half - x * x)) * 0.9);
    const px = alongX ? cx + x : cx;
    const pz = alongX ? cz : cz + x;
    world.set(px, archY, pz, style.wall);
    if (rng.chance(0.25)) world.set(px, archY + 1, pz, style.trim);
  }
}

export function grave(world: World, x: number, z: number, y: number, style: BuildStyle): void {
  world.set(x, y, z, style.accent);
  world.set(x, y, z - 1, slab("minecraft:polished_blackstone_brick_slab"));
  world.set(x, y + 1, z, style.wall);
  if ((x + z) % 7 === 0) world.set(x, y + 2, z, P.soulTorch);
}

/** Block-built statue (a build, not an NPC). */
export function statue(world: World, x: number, z: number, y: number, scale: number, style: BuildStyle): void {
  const s = Math.max(1, Math.round(scale));
  world.fill(x - s, y - 2, z - s, x + s, y + s, z + s, style.accent);
  world.fill(x - s + 1, y + s + 1, z - s + 1, x + s - 1, y + s * 3, z + s - 1, style.wall);
  world.fill(x - 1, y + s * 3 + 1, z - 1, x + 1, y + s * 4, z + 1, style.trim);
  world.set(x - s, y + s, z, style.wall);
  world.set(x + s, y + s, z, style.wall);
}

/** Nether portal frame (obsidian, 4x5) - never lit: the map has no portal logic. */
export function portalFrame(world: World, x: number, y: number, z: number, alongX = true): void {
  const w = 2;
  const h = 4;
  for (let i = -w; i <= w; i++) {
    const px = alongX ? x + i : x;
    const pz = alongX ? z : z + i;
    for (let j = -1; j <= h; j++) {
      const corner = (i === -w || i === w) && (j === -1 || j === h);
      const edge = i === -w || i === w || j === -1 || j === h;
      if (corner) world.set(px, y + j, pz, P.obsidian);
      else if (edge) world.set(px, y + j, pz, P.obsidian);
      else world.set(px, y + j, pz, P.portal);
    }
  }
}

export function lampPost(world: World, x: number, z: number, y: number, light: BlockState, height = 4): void {
  world.column(x, z, y, y + height - 1, P.darkOakFence);
  world.set(x, y + height, z, light);
}

export function cage(world: World, x: number, z: number, y: number, size = 2): void {
  for (let dz = -size; dz <= size; dz++) {
    for (let dx = -size; dx <= size; dx++) {
      const edge = Math.abs(dx) === size || Math.abs(dz) === size;
      if (edge) {
        world.set(x + dx, y, z + dz, P.ironBars);
        world.set(x + dx, y + 1, z + dz, P.ironBars);
        world.set(x + dx, y + 2, z + dz, P.ironBars);
      }
    }
  }
  world.set(x, y + 3, z, P.ironBars);
}

export function wheatTerraces(world: World, rect: RectRegion, baseY: number, steps = 5): void {
  const midZ = Math.round((rect.z1 + rect.z2) / 2);
  for (let s = 0; s < steps; s++) {
    const y = baseY + s;
    const z1 = midZ - (steps - s) * 3;
    const z2 = midZ + (steps - s) * 3;
    for (let z = Math.max(rect.z1, z1); z <= Math.min(rect.z2, z2); z++) {
      for (let x = rect.x1; x <= rect.x2; x++) {
        world.set(x, y, z, P.farmland);
        if ((x + z + s) % 3 !== 0) world.set(x, y + 1, z, P.wheat);
      }
    }
  }
}

export function labyrinth(world: World, cx: number, cz: number, size: number, baseY: number, style: BuildStyle): void {
  const half = size >> 1;
  world.rectWalls(cx - half, cz - half, cx + half, cz + half, baseY, baseY + 3, style.wall);
  for (let z = cz - half + 2; z <= cz + half - 2; z += 4) {
    for (let x = cx - half + 2; x <= cx + half - 2; x++) {
      if ((x + z) % 6 < 3) world.set(x, baseY + 1, z, style.wall);
    }
  }
  world.set(cx, baseY + 1, cz + half, AIR);
  world.set(cx, baseY + 2, cz + half, AIR);
}
