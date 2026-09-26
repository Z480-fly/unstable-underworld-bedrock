import { AIR, P } from "./blocks.ts";
import { LANDMARKS, type RectRegion } from "./layout.ts";
import { Rng } from "./noise.ts";
import {
  BLACKSTONE_STYLE,
  DEEPSLATE_STYLE,
  STONE_STYLE,
  areaGround,
  house,
  lampPost,
  pad,
  portalFrame,
  brokenEndPortal,
  statue,
  tower,
  glazedPanel,
  roseWindow,
} from "./structures.ts";
import { glassEyeSpire } from "./structures_end.ts";
import type { World } from "./world.ts";

function rect(x1: number, z1: number, x2: number, z2: number): RectRegion {
  return { kind: "rect", x1, z1, x2, z2 };
}

export function buildVillage(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.village.center;
  const style = STONE_STYLE;
  const level = areaGround(world, LANDMARKS.village.footprint);
  pad(world, rect(cx - 28, cz - 18, cx + 28, cz + 18), level, P.coarseDirt, P.dirt);
  for (let i = 0; i < 6; i++) {
    house(world, cx - 18 + (i % 3) * 14, cz - 8 + Math.floor(i / 3) * 14, 9, 7, level, 5, style, {
      face: 2,
      ruined: i % 2 === 0,
    });
  }
  tower(world, cx + 20, cz, 3, level, 12, style, { round: true, crown: true });
}

export function buildFrostPocket(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.frostPocket.center;
  const level = areaGround(world, LANDMARKS.frostPocket.footprint);
  pad(world, rect(cx - 28, cz - 28, cx + 28, cz + 28), level, P.snowBlock, P.packedIce);
  world.disc(cx - 12, cz + 8, 12, level, P.ice);
  world.disc(cx - 12, cz + 8, 9, level, P.packedIce);
  world.disc(cx - 12, cz + 8, 4, level, P.blueIce);
}

export function buildTomb(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.tomb.center;
  const style = DEEPSLATE_STYLE;
  const level = areaGround(world, LANDMARKS.tomb.footprint);
  pad(world, rect(cx - 28, cz - 28, cx + 28, cz + 28), level, P.deepslateTiles, P.deepslate);
  const pitX = cx;
  const pitZ = cz;
  const pitDepth = 12;
  for (let y = level; y >= level - pitDepth; y--) {
    world.disc(pitX, pitZ, 16, y, P.deepslate);
  }
  world.disc(pitX, pitZ, 16, level - pitDepth + 5, P.blackConcrete);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    statue(world, pitX + Math.round(Math.cos(a) * 12), pitZ + Math.round(Math.sin(a) * 12), level - pitDepth + 6, 1, style);
  }
  world.set(pitX, level - pitDepth + 6, pitZ, P.sculkCatalyst);
}

export function buildAshenReaches(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.ashenReaches.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.ashenReaches.footprint);
  pad(world, rect(cx - 40, cz - 40, cx + 40, cz + 40), level, P.blackstone, P.netherrack);
  for (let z = cz - 16; z <= cz + 16; z++) {
    for (let x = cx - 20; x <= cx + 20; x++) {
      if (Math.hypot(x - cx, z - cz) < 18) world.set(x, level - 1, z, P.lava);
    }
  }
  world.disc(cx + 10, cz - 8, 5, level, P.blackstone);
  tower(world, cx + 10, cz - 8, 3, level, 8, style, { round: true, crown: true });
}

export function buildRuinedCastle(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.ruinedCastle.center;
  const style = STONE_STYLE;
  const level = areaGround(world, LANDMARKS.ruinedCastle.footprint);
  pad(world, rect(cx - 22, cz - 22, cx + 22, cz + 22), level, P.cobbledDeepslate, P.deepslate);
  house(world, cx, cz, 20, 16, level, 8, style, { ruined: true, face: 2 });
  for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]] as const) {
    tower(world, cx + dx, cz + dz, 3, level, 10, style, { round: false, crown: true });
  }
  portalFrame(world, cx, level + 1, cz + 8, true, true);
  brokenEndPortal(world, cx - 10, level + 1, cz - 8);
}

export function buildGlassworks(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.glassworks.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.glassworks.footprint);
  pad(world, rect(cx - 36, cz - 42, cx + 36, cz + 42), level, P.polishedBlackstone, P.deepslate);

  const glazing = [P.greenGlass, P.limeGlass, P.cyanGlass, P.lightBlueGlass, P.whiteGlass, P.grayGlass, P.purpleGlass, P.magentaGlass, P.tintedGlass, P.pinkGlass];
  const frame = P.polishedBlackstone;
  const halfW = 15;
  const halfD = 30;
  const height = 18;
  const top = level + height;

  for (let z = cz - halfD; z <= cz + halfD; z++) {
    for (let y = level + 1; y <= top; y++) {
      world.set(cx - halfW, y, z, style.wall);
      world.set(cx + halfW, y, z, style.wall);
    }
  }
  for (let x = cx - halfW; x <= cx + halfW; x++) {
    for (let y = level + 1; y <= top; y++) {
      world.set(x, y, cz - halfD, style.wall);
      world.set(x, y, cz + halfD, style.wall);
    }
  }
  world.fill(cx - halfW, level, cz - halfD, cx + halfW, level, cz + halfD, style.floor);

  for (const z1 of [cz - halfD + 8, cz - 8, cz + 8]) {
    glazedPanel(world, rect(cx - halfW, z1, cx - halfW, z1 + 8), level + 3, top - 4, glazing, frame);
    glazedPanel(world, rect(cx + halfW, z1, cx + halfW, z1 + 8), level + 3, top - 4, glazing, frame);
  }
  roseWindow(world, cx, cz - halfD, level + 13, 8, true, glazing, frame);
  roseWindow(world, cx, cz + halfD, level + 13, 8, true, glazing, frame);

  for (let y = level + 3; y <= level + 16; y++) {
    const r = y % 3 === 0 ? 2 : 1;
    world.disc(cx, cz, r, y, y % 4 === 0 ? P.limeGlass : P.greenGlass);
  }
  world.set(cx, level + 17, cz, P.glowstone);

  glassEyeSpire(world, cx - 32, cz + 8, level + 1, 20);
  glassEyeSpire(world, cx + 32, cz - 6, level + 1, 17);

  for (let i = 0; i < 5; i++) {
    lampPost(world, cx - 20 + i * 10, cz - halfD - 6, level, style.light, 4);
  }
}

export function buildPortalField(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.portalField.center;
  const level = areaGround(world, LANDMARKS.portalField.footprint);
  pad(world, rect(cx - 36, cz - 40, cx + 36, cz + 40), level, P.obsidian, P.blackstone);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 6; row++) {
      const px = cx - 24 + col * 24;
      const pz = cz - 28 + row * 10;
      const mode = (col + row) % 3;
      if (mode === 0) portalFrame(world, px, level + 1, pz, row % 2 === 0, false);
      else if (mode === 1) portalFrame(world, px, level + 1, pz, row % 2 === 0, true);
      else {
        world.column(px - 2, pz, level + 1, level + 3, P.obsidian);
        world.column(px + 2, pz, level + 1, level + 3, P.cryingObsidian);
      }
    }
  }
}

export function buildPortalLobby(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.portalLobby.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.portalLobby.footprint);
  pad(world, rect(cx - 22, cz - 20, cx + 22, cz + 20), level, P.polishedBlackstone, P.blackstone);
  let placed = 0;
  for (let i = 0; i < 10 && placed < 20; i++) {
    portalFrame(world, cx - 14 + (i % 5) * 7, level + 1, cz - 12 + Math.floor(i / 5) * 10, true, i % 3 === 0);
    placed++;
  }
  for (let i = 0; i < 6; i++) {
    lampPost(world, cx - 16 + i * 6, cz, level + 1, style.light, 3);
  }
  tower(world, cx, cz + 14, 4, level, 12, style, { round: true, crown: true });
  greenGlazingLocal(world, cx, cz + 14, 4, level + 6);
}

function greenGlazingLocal(world: World, cx: number, cz: number, radius: number, y: number): void {
  const panes = [P.greenGlass, P.limeGlass, P.cyanGlass, P.purpleGlass];
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(ang) * radius);
    const pz = cz + Math.round(Math.sin(ang) * radius);
    world.set(px, y, pz, panes[a % panes.length]!);
  }
}
