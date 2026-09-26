import { AIR, P, stairs } from "./blocks.ts";
import { LANDMARKS, VOID_CASTLE_ISLANDS, type RectRegion } from "./layout.ts";
import { Rng } from "./noise.ts";
import {
  BLACKSTONE_STYLE,
  DEEPSLATE_STYLE,
  STONE_STYLE,
  areaGround,
  bridge,
  cage,
  curtainWall,
  glassBridge,
  gatehouse,
  grave,
  house,
  keep,
  lampPost,
  labyrinth,
  pad,
  portalFrame,
  brokenEndPortal,
  ruinedArch,
  statue,
  tower,
  wheatTerraces,
  type BuildStyle,
} from "./structures.ts";
import type { World } from "./world.ts";

function rect(x1: number, z1: number, x2: number, z2: number): RectRegion {
  return { kind: "rect", x1, z1, x2, z2 };
}

function greenGlazing(world: World, cx: number, cz: number, radius: number, y: number): void {
  const panes = [P.greenGlass, P.greenGlass, P.greenGlass, P.grayGlass, P.blackGlass, P.purpleGlass, P.tintedGlass];
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(ang) * radius);
    const pz = cz + Math.round(Math.sin(ang) * radius);
    world.set(px, y, pz, panes[a % panes.length]!);
    world.set(px, y + 1, pz, panes[(a + 1) % panes.length]!);
  }
}

export function buildBreach(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.breach.center;
  const level = areaGround(world, LANDMARKS.breach.footprint);
  pad(world, rect(cx - 30, cz - 30, cx + 30, cz + 30), level, P.cobbledDeepslate, P.deepslate);
  world.disc(cx, cz, 14, level, P.obsidian);
  world.disc(cx, cz, 11, level, P.crackedBlackstoneBricks);
  tower(world, cx, cz, 5, level, 18, BLACKSTONE_STYLE, { round: true, crown: true });
  greenGlazing(world, cx, cz, 5, level + 8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    lampPost(world, cx + Math.round(Math.cos(a) * 18), cz + Math.round(Math.sin(a) * 18), level, P.soulLantern, 3);
  }
}

export function buildCenter(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.center.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.center.footprint);
  pad(world, rect(cx - 48, cz - 48, cx + 48, cz + 48), level, P.polishedBlackstone, P.blackstone);
  keep(world, cx, cz, 36, 36, level, 22, style, { goldCrown: true });
  world.set(cx, level + 1, cz, P.goldBlock);
  for (const [dx, dz] of [[-20, -20], [20, -20], [-20, 20], [20, 20]] as const) {
    cage(world, cx + dx, cz + dz, level + 1, 3, 5);
  }
}

export function buildFields(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.fields.center;
  const style = STONE_STYLE;
  const level = areaGround(world, LANDMARKS.fields.footprint);
  pad(world, rect(cx - 40, cz - 40, cx + 40, cz + 40), level, P.coarseDirt, P.dirt);
  wheatTerraces(world, rect(cx - 30, cz - 20, cx + 30, cz + 20), level, 5);
  tower(world, cx, cz, 4, level, 16, style, { round: true, crown: true });
  greenGlazing(world, cx, cz, 4, level + 6);
}

export function buildCitadel(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.citadel.center;
  const style = DEEPSLATE_STYLE;
  const level = areaGround(world, LANDMARKS.citadel.footprint);
  pad(world, rect(cx - 28, cz - 28, cx + 28, cz + 28), level, P.polishedDeepslate, P.deepslate);
  keep(world, cx, cz, 40, 40, level, 28, style, {});
  for (let y = level + 4; y < level + 24; y += 4) {
    for (let i = 0; i < 8; i++) {
      world.set(cx - 12 + i * 3, y + 1, cz - 10, P.bookshelf);
      world.set(cx - 12 + i * 3, y + 1, cz + 10, P.bookshelf);
    }
  }
  greenGlazing(world, cx, cz, 8, level + 12);
}

export function buildVoidCastles(world: World): void {
  const style = BLACKSTONE_STYLE;
  for (const island of VOID_CASTLE_ISLANDS) {
    const level = world.surfaceAt(island.x, island.z);
    const radius = island.radius;
    for (let y = level - 4; y <= level; y++) {
      world.disc(island.x, island.z, Math.round(radius), y, y === level ? P.polishedBlackstone : P.deepslate);
    }
    tower(world, island.x, island.z, 3, level, 12, style, { round: true, crown: true });
    greenGlazing(world, island.x, island.z, 3, level + 5);
  }
  if (VOID_CASTLE_ISLANDS.length >= 2) {
    for (let i = 0; i < VOID_CASTLE_ISLANDS.length - 1; i++) {
      const a = VOID_CASTLE_ISLANDS[i]!;
      const b = VOID_CASTLE_ISLANDS[i + 1]!;
      const ya = world.surfaceAt(a.x, a.z) + 2;
      const yb = world.surfaceAt(b.x, b.z) + 2;
      glassBridge(world, a.x, a.z, b.x, b.z, ya, { width: 1, sag: 1, deckY2: yb });
    }
  }
}

export function buildGraveyard(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.graveyard.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.graveyard.footprint);
  pad(world, rect(cx - 30, cz - 30, cx + 30, cz + 30), level, P.coarseDirt, P.deepslate);
  for (let i = 0; i < 40; i++) {
    const x = cx - 24 + (i % 8) * 6;
    const z = cz - 24 + Math.floor(i / 8) * 8;
    grave(world, x, z, level + 1, style);
  }
  tower(world, cx, cz, 3, level, 10, style, { round: false, crown: true });
}

export function buildRuins(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.ruins.center;
  const style = STONE_STYLE;
  const level = areaGround(world, LANDMARKS.ruins.footprint);
  pad(world, rect(cx - 24, cz - 24, cx + 24, cz + 24), level, P.cobbledDeepslate, P.deepslate);
  for (let i = 0; i < 8; i++) {
    ruinedArch(world, cx - 16 + i * 4, cz - 8 + (i % 3) * 6, level, 6 + (i % 4), style, i % 2 === 0);
  }
  bridge(world, cx - 20, cz, cx + 20, cz, level + 2, style, { broken: true, width: 2 });
}

export function buildMazeValley(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.mazeValley.center;
  const style = DEEPSLATE_STYLE;
  const level = areaGround(world, LANDMARKS.mazeValley.footprint);
  pad(world, rect(cx - 30, cz - 30, cx + 30, cz + 30), level, P.cobbledDeepslate, P.deepslate);
  labyrinth(world, rect(cx - 24, cz - 24, cx + 24, cz + 24), level + 1, 4, style);
}
