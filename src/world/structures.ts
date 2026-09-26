/**
 * Reusable builders. Every landmark in `areas.ts` is assembled from these, which
 * keeps the reconstruction readable: the Citadel, the Withered Castle and the
 * void castles all use the same tower/wall/gate primitives, just at different
 * scales and with different materials.
 *
 * All builders take *world* coordinates and ask the terrain for the local ground
 * height, so nothing floats.
 */

import { AIR, bs, P, slab, stairs, wall, type BlockState } from "./blocks.ts";
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

export function pad(
  world: World,
  rect: RectRegion,
  level: number,
  top: BlockState,
  fill: BlockState = P.cobbledDeepslate,
  edgeRamp = true,
): void {
  for (let z = rect.z1 - (edgeRamp ? 4 : 0); z <= rect.z2 + (edgeRamp ? 4 : 0); z++) {
    for (let x = rect.x1 - (edgeRamp ? 4 : 0); x <= rect.x2 + (edgeRamp ? 4 : 0); x++) {
      if (!world.inRealm(x, z)) continue;
      const inside = x >= rect.x1 && x <= rect.x2 && z >= rect.z1 && z <= rect.z2;
      let surface = world.surfaceAt(x, z);

      if (!world.isLand(x, z) || surface < 8) {
        surface = Math.max(8, level - 12);
        for (let y = 0; y <= surface; y++) {
          world.set(x, y, z, y <= 2 ? P.deepslate : fill);
        }
        world.setLand(x, z, true);
        world.setSurface(x, z, surface);
      }

      if (!inside) {
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
      for (let y = level - 1; y >= Math.max(0, level - 10); y--) {
        const existing = world.get(x, y, z);
        if (!existing || existing.name === "minecraft:air") world.set(x, y, z, fill);
      }
      world.setSurface(x, z, level);
      world.setLand(x, z, true);
      world.protect(x, z);
    }
  }
}

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
    world.set(cx, top + 4, cz, style.light);
    world.set(cx, top + 3, cz, P.chain);
  }

  if (opts.windows !== false) {
    const r = radius;
    for (let y = baseY + 4; y < top - 6; y += 5) {
      world.set(cx, y, cz - r, P.ironBars);
      world.set(cx, y, cz + r, P.ironBars);
      world.set(cx - r, y, cz, P.ironBars);
      world.set(cx + r, y, cz, P.ironBars);
    }
  }
}

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

  for (let x = x1 + 1; x <= x2 - 1; x++) {
    world.set(x, top - 3, z1 + 1, style.floor);
    world.set(x, top - 3, z2 - 1, style.floor);
  }
  for (let z = z1 + 1; z <= z2 - 1; z++) {
    world.set(x1 + 1, top - 3, z, style.floor);
    world.set(x2 - 1, top - 3, z, style.floor);
  }
}

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
  for (let i = -halfSpread + 2; i <= halfSpread - 2; i++) {
    const px = along === "z" ? x : x + i;
    const pz = along === "z" ? z + i : z;
    for (let y = baseY + 4; y <= baseY + height; y++) world.set(px, y, pz, style.wall);
    world.set(px, baseY + height + 1, pz, style.trim);
  }
  if (!opts.open) {
    for (let i = -halfSpread + 2; i <= halfSpread - 2; i++) {
      const px = along === "z" ? x : x + i;
      const pz = along === "z" ? z + i : z;
      for (let y = baseY; y <= baseY + 3; y++) world.set(px, y, pz, P.ironBars);
    }
  }
  world.set(x, baseY + height - 1, z, style.light);
}

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
  for (let y = baseY + 4; y < baseY + height - 3; y += 4) {
    for (let z = cz - hd + 1; z <= cz + hd - 1; z++) {
      for (let x = cx - hw + 1; x <= cx + hw - 1; x++) world.set(x, y, z, style.floor);
    }
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
}

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
        if (edge) world.set(x, y, z, y === baseY ? style.accent : style.wall);
        else if (y === top) world.set(x, y, z, style.roof);
      }
    }
  }
  world.fill(cx - hw, baseY, cz - hd, cx + hw, baseY, cz + hd, style.floor);
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
  const face = opts.face ?? 2;
  const dx = face === 0 ? 1 : face === 1 ? -1 : 0;
  const dz = face === 2 ? 1 : face === 3 ? -1 : 0;
  for (let y = baseY; y <= baseY + 2; y++) world.set(cx + dx * hw, y, cz + dz * hd, AIR);
  world.set(cx + dx * hw, baseY + 3, cz + dz * hd, style.trim);
}

export function bridge(
  world: World,
  x1: number, z1: number, x2: number, z2: number,
  deckY: number, style: BuildStyle,
  opts: { broken?: boolean; railings?: boolean; width?: number } = {},
): void {
  const width = opts.width ?? 3;
  const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, z2 - z1)));
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
      if (opts.railings !== false && Math.abs(w) === width && !isBroken) {
        world.set(px, deckY + 1, pz, ((px + pz) & 1) === 0 ? style.trim : AIR);
      }
    }
  }
}

export function glassBridge(
  world: World,
  x1: number, z1: number, x2: number, z2: number,
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
  }
}

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
    }
  }
  for (let x = -half; x <= half; x++) {
    const archY = baseY + height - Math.round(Math.sqrt(Math.max(0, half * half - x * x)) * 0.9);
    const px = alongX ? cx + x : cx;
    const pz = alongX ? cz : cz + x;
    world.set(px, archY, pz, style.wall);
  }
}

export function grave(world: World, x: number, z: number, y: number, style: BuildStyle): void {
  world.set(x, y, z, style.accent);
  world.set(x, y, z - 1, slab("minecraft:polished_blackstone_brick_slab"));
  world.set(x, y + 1, z, style.wall);
  if ((x + z) % 7 === 0) world.set(x, y + 2, z, P.soulTorch);
}

export function statue(world: World, x: number, z: number, y: number, scale: number, style: BuildStyle): void {
  const s = Math.max(1, Math.round(scale));
  world.fill(x - s, y - 2, z - s, x + s, y + s, z + s, style.accent);
  world.fill(x - s + 1, y + s + 1, z - s + 1, x + s - 1, y + s * 3, z + s - 1, style.wall);
  world.fill(x - 1, y + s * 3 + 1, z - 1, x + 1, y + s * 4, z + 1, style.trim);
}

export function portalFrame(
  world: World, x: number, y: number, z: number, alongX = true, broken = false,
): void {
  const w = 2;
  const h = 4;
  const rng = new Rng((x * 131 + z * 977 + y) ^ 0xb07a1);
  for (let i = -w; i <= w; i++) {
    const px = alongX ? x + i : x;
    const pz = alongX ? z : z + i;
    for (let j = -1; j <= h; j++) {
      const corner = (i === -w || i === w) && (j === -1 || j === h);
      const edge = i === -w || i === w || j === -1 || j === h;
      if (!edge) {
        world.set(px, y + j, pz, P.portal);
        continue;
      }
      if (broken && !corner && rng.chance(0.35)) {
        if (rng.chance(0.45)) world.set(px, y + j, pz, P.cryingObsidian);
        continue;
      }
      if (broken && corner && rng.chance(0.25)) {
        world.set(px, y + j, pz, P.cryingObsidian);
        continue;
      }
      world.set(px, y + j, pz, P.obsidian);
    }
  }
}

export function brokenEndPortal(world: World, cx: number, y: number, cz: number): void {
  const rng = new Rng((cx * 53 + cz * 97 + y) ^ 0xe9d);
  for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) === 2) continue;
    if (rng.chance(0.22)) continue;
    const eye = rng.chance(0.55);
    world.set(cx + dx, y, cz - 2, bs("minecraft:end_portal_frame", { direction: 2, end_portal_eye_bit: eye }));
  }
  for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) === 2) continue;
    if (rng.chance(0.22)) continue;
    const eye = rng.chance(0.55);
    world.set(cx + dx, y, cz + 2, bs("minecraft:end_portal_frame", { direction: 0, end_portal_eye_bit: eye }));
  }
  for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dz) === 2) continue;
    if (rng.chance(0.22)) continue;
    const eye = rng.chance(0.55);
    world.set(cx - 2, y, cz + dz, bs("minecraft:end_portal_frame", { direction: 1, end_portal_eye_bit: eye }));
  }
  for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dz) === 2) continue;
    if (rng.chance(0.22)) continue;
    const eye = rng.chance(0.55);
    world.set(cx + 2, y, cz + dz, bs("minecraft:end_portal_frame", { direction: 3, end_portal_eye_bit: eye }));
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      world.set(cx + dx, y, cz + dz, P.endPortal);
    }
  }
}

export function lampPost(world: World, x: number, z: number, y: number, light: BlockState, height = 3): void {
  for (let i = 0; i < height; i++) world.set(x, y + i, z, P.darkOakFence);
  world.set(x, y + height, z, light);
}

export function cage(world: World, x: number, z: number, y: number, size = 2, height = 4): void {
  for (let yy = y; yy <= y + height; yy++) {
    for (let zz = z - size; zz <= z + size; zz++) {
      for (let xx = x - size; xx <= x + size; xx++) {
        const edge = xx === x - size || xx === x + size || zz === z - size || zz === z + size || yy === y || yy === y + height;
        if (edge) world.set(xx, yy, zz, P.ironBars);
      }
    }
  }
}

export function labyrinth(world: World, rect: RectRegion, baseY: number, height: number, style: BuildStyle): void {
  const rng = new Rng((rect.x1 * 17 + rect.z1 * 31) ^ 0x5eed);
  for (let z = rect.z1; z <= rect.z2; z++) {
    for (let x = rect.x1; x <= rect.x2; x++) {
      const edge = x === rect.x1 || x === rect.x2 || z === rect.z1 || z === rect.z2;
      if (edge || rng.chance(0.22)) {
        for (let y = baseY; y <= baseY + height; y++) {
          world.set(x, y, z, y === baseY + height ? style.trim : style.wall);
        }
      }
    }
  }
  let cx = rect.x1 + 2;
  let cz = rect.z1 + 2;
  while (cx < rect.x2 - 2 && cz < rect.z2 - 2) {
    for (let y = baseY; y <= baseY + 2; y++) world.set(cx, y, cz, AIR);
    if (rng.chance(0.5)) cx += 1;
    else cz += 1;
  }
}

export function wheatTerraces(world: World, rect: RectRegion, level: number, rows = 4): void {
  for (let r = 0; r < rows; r++) {
    const z1 = rect.z1 + r * 4;
    const z2 = Math.min(rect.z2, z1 + 2);
    for (let z = z1; z <= z2; z++) {
      for (let x = rect.x1; x <= rect.x2; x++) {
        world.set(x, level - r, z, P.farmland);
        world.set(x, level - r + 1, z, r % 2 === 0 ? P.wheat : P.youngWheat);
      }
    }
  }
}

export function glazedPanel(
  world: World, rect: RectRegion, y1: number, y2: number, glasses: BlockState[], frame: BlockState,
): void {
  const alongX = rect.z1 === rect.z2;
  const length = alongX ? rect.x2 - rect.x1 : rect.z2 - rect.z1;
  for (let i = 0; i <= length; i++) {
    const x = alongX ? rect.x1 + i : rect.x1;
    const z = alongX ? rect.z1 : rect.z1 + i;
    for (let y = y1; y <= y2; y++) {
      const border = i === 0 || i === length || y === y1 || y === y2;
      world.set(x, y, z, border ? frame : glasses[(((i * 3 + y * 5) % glasses.length) + glasses.length) % glasses.length]!);
    }
  }
}

export function roseWindow(
  world: World, cx: number, cz: number, y: number, radius: number, alongX: boolean, glasses: BlockState[], frame: BlockState,
): void {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const x = alongX ? cx + dx : cx;
      const z = alongX ? cz : cz + dx;
      const py = y + dy;
      if (d > radius - 1 || d < 1.2) world.set(x, py, z, frame);
      else world.set(x, py, z, glasses[(((dx * 31 + dy * 17) % glasses.length) + glasses.length) % glasses.length]!);
    }
  }
}

export { endGatewayMarker, endPortalPlatform, glassEyeSpire } from "./structures_end.ts";
