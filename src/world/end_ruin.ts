/** Enhanced End Ruin landmark. */
import { P } from "./blocks.ts";
import type { World } from "./world.ts";
import { Rng } from "./noise.ts";
import { LANDMARKS } from "./layout.ts";
import {
  BLACKSTONE_STYLE,
  areaGround,
  brokenEndPortal,
  gatehouse,
  pad,
  statue,
} from "./structures.ts";
import { endGatewayMarker, endPortalPlatform, glassEyeSpire } from "./structures_end.ts";

function rect(x1: number, z1: number, x2: number, z2: number) {
  return { kind: "rect" as const, x1, z1, x2, z2 };
}

export function buildEndRuin(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.endRuin.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.endRuin.footprint);
  pad(world, rect(cx - 42, cz - 42, cx + 42, cz + 42), level, P.endStone, P.obsidian);
  const rng = new Rng(0x3ed0);

  for (let i = 0; i < 140; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = 28 + rng.next() * 14;
    const px = cx + Math.round(Math.cos(a) * r);
    const pz = cz + Math.round(Math.sin(a) * r);
    world.set(px, level, pz, rng.chance(0.5) ? P.obsidian : P.blackstone);
  }

  world.disc(cx, cz, 26, level + 1, P.endStoneBricks);
  world.disc(cx, cz, 20, level + 2, P.endStone);
  for (let i = 0; i < 36; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = 6 + rng.next() * 20;
    const px = cx + Math.round(Math.cos(a) * r);
    const pz = cz + Math.round(Math.sin(a) * r);
    world.set(px, level + 2, pz, rng.chance(0.4) ? P.purpurBlock : P.purpurPillar);
  }
  world.ring(cx, cz, 26, level + 1, P.obsidian);

  const plazaGlass = [
    P.purpleGlass, P.magentaGlass, P.cyanGlass, P.lightBlueGlass,
    P.blackGlass, P.tintedGlass, P.limeGlass, P.greenGlass,
  ];
  for (let a = 0; a < 48; a++) {
    const ang = (a / 48) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(ang) * 14);
    const pz = cz + Math.round(Math.sin(ang) * 14);
    world.set(px, level + 3, pz, plazaGlass[a % plazaGlass.length]!);
  }

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(a) * 29);
    const pz = cz + Math.round(Math.sin(a) * 29);
    const h = 10 + (i % 3) * 4;
    world.column(px, pz, level + 1, level + h, P.obsidian);
    world.set(px, level + h + 1, pz, P.purpurPillar);
    world.set(px, level + h + 2, pz, P.endRod);
    if (i % 2 === 0) world.set(px, level + 1, pz + 1, P.cryingObsidian);
  }

  world.disc(cx, cz, 6, level + 2, P.purpurBlock);
  world.disc(cx, cz, 6, level + 3, P.purpurBlock);
  endPortalPlatform(world, cx, level + 4, cz, false);

  brokenEndPortal(world, cx - 22, level + 2, cz + 20);
  brokenEndPortal(world, cx + 24, level + 2, cz - 18);
  brokenEndPortal(world, cx + 14, level + 2, cz + 24);
  brokenEndPortal(world, cx - 18, level + 2, cz - 22);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const px = cx + Math.round(Math.cos(a) * 18);
    const pz = cz + Math.round(Math.sin(a) * 18);
    endGatewayMarker(world, px, level + 3, pz, 5 + (i % 3));
  }

  glassEyeSpire(world, cx - 16, cz - 14, level + 1, 22);
  glassEyeSpire(world, cx + 18, cz + 12, level + 1, 18);
  glassEyeSpire(world, cx + 10, cz - 20, level + 1, 16);

  for (let i = 0; i < 28; i++) {
    const x = cx - 30 + rng.int(0, 60);
    const z = cz - 30 + rng.int(0, 60);
    if (Math.hypot(x - cx, z - cz) < 10) continue;
    const h = rng.int(1, 4);
    for (let y = level + 1; y <= level + h; y++) world.set(x, y, z, P.chorusPlant);
    world.set(x, level + h + 1, z, P.chorusFlower);
  }

  for (let i = 0; i < 18; i++) {
    const x = cx - 32 + rng.int(0, 64);
    const z = cz - 32 + rng.int(0, 64);
    const pick = rng.int(0, 5);
    if (pick === 0) world.set(x, level + 1, z, P.dragonEgg);
    else if (pick === 1) world.set(x, level + 1, z, P.respawnAnchor);
    else if (pick === 2) world.set(x, level + 1, z, P.lodestone);
    else if (pick === 3) world.set(x, level + 1, z, P.reinforcedDeepslate);
    else world.set(x, level + 1, z, P.amethyst);
  }

  for (let i = 0; i < 36; i++) {
    const x = cx - 36 + rng.int(0, 72);
    const z = cz - 36 + rng.int(0, 72);
    if (Math.hypot(x - cx, z - cz) < 20) continue;
    const h = rng.int(1, 7);
    world.column(x, z, level + 1, level + h, rng.chance(0.5) ? P.endStoneBricks : P.purpurBlock);
    if (rng.chance(0.3)) world.set(x, level + h + 1, z, P.cryingObsidian);
  }

  world.disc(cx, cz, 12, level + 26, P.obsidian);
  world.disc(cx, cz, 8, level + 25, P.endStoneBricks);
  for (let dx = -6; dx <= 6; dx++) {
    for (let dz = -6; dz <= 6; dz++) {
      if (Math.hypot(dx, dz) > 6 || Math.hypot(dx, dz) < 3) continue;
      world.set(cx + dx, level + 24, cz + dz, plazaGlass[(dx + dz * 3 + 20) % plazaGlass.length]!);
    }
  }
  world.column(cx, cz, level + 27, level + 31, P.purpurPillar);
  world.set(cx, level + 32, cz, P.endRod);
  for (const sx of [-8, 8]) {
    for (const sz of [-8, 8]) {
      world.set(cx + sx, level + 25, cz + sz, P.cryingObsidian);
    }
  }

  gatehouse(world, cx, cz + 32, level, style, 2, { height: 9 });
  for (let i = 0; i < 4; i++) {
    statue(world, cx - 12 + i * 8, cz + 36, level, 1, style);
  }
}
