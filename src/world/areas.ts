/**
 * The landmarks. Each function reconstructs one named place from the source
 * material and places it at the coordinates fixed in `layout.ts`, so the
 * spatial relationships survive: the Fields lie east of the Center, the void
 * castles and their glass bridges sit in the gulf to the west of it, and the
 * Citadel anchors the far west.
 */

import { AIR, P, stairs } from "./blocks.ts";
import { LANDMARKS, VOID_CASTLE_ISLANDS, type RectRegion } from "./layout.ts";
import { Rng } from "./noise.ts";
import {
  BLACKSTONE_STYLE,
  DEEPSLATE_STYLE,
  STONE_STYLE,
  areaGround,
  bridge,
  brokenEndPortal,
  cage,
  curtainWall,
  glassBridge,
  gatehouse,
  glazedPanel,
  roseWindow,
  grave,
  house,
  keep,
  lampPost,
  labyrinth,
  pad,
  portalFrame,
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

/**
 * Soul Keeper glazing: one ring of green stained glass windows around a tower.
 *
 * Canon splits the palette in two - "almost everything is gray or black", plus
 * "the green visible on some structures" - so the green belongs here, in the
 * Soul Keepers' windows, and nowhere in the terrain. This is the only place
 * `P.greenGlass` is placed deliberately (the escape rooms' parkour course gets
 * it through the gravity-block substitution in blocks.ts).
 */
function greenGlazing(world: World, cx: number, cz: number, radius: number, y: number): void {
  for (const [dx, dz] of [
    [0, -radius],
    [0, radius],
    [-radius, 0],
    [radius, 0],
  ] as const) {
    world.set(cx + dx, y, cz + dz, P.greenGlass);
    world.set(cx + dx, y + 1, cz + dz, P.greenGlass);
  }
}

// ---------------------------------------------------------------------------
// 1. The Breach - where Wemmbu and Boosfer fell in (spawn)
// ---------------------------------------------------------------------------

export function buildBreach(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.breach.center;
  const level = areaGround(world, LANDMARKS.breach.footprint);
  pad(world, rect(cx - 30, cz - 30, cx + 30, cz + 30), level, P.cobbledDeepslate, P.deepslate);

  // The shattered bedrock shaft they fell through: a torn spire of bedrock and
  // obsidian hanging over the crater.
  world.disc(cx, cz, 14, level, P.obsidian);
  world.disc(cx, cz, 11, level, P.crackedBlackstoneBricks);
  const rng = new Rng(0x8ce0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 3 + (i % 3);
    const px = cx + Math.round(Math.cos(a) * r);
    const pz = cz + Math.round(Math.sin(a) * r);
    const h = 12 + rng.int(0, 22);
    for (let y = level; y <= level + h; y++) {
      world.set(px, y, pz, rng.chance(0.35) ? P.obsidian : P.blackstone);
    }
    if (rng.chance(0.5)) world.set(px, level + h, pz, P.cryingObsidian);
  }
  // The crater itself: an open bowl of black concrete ash, with the ground the
  // impact threw up cleared away so the bowl is actually visible from above.
  for (let z = cz - 26; z <= cz + 26; z++) {
    for (let x = cx - 26; x <= cx + 26; x++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d > 26) continue;
      const dip = Math.round((1 - d / 26) * 6);
      const floor = level - dip;
      for (let y = floor + 1; y <= level + 3; y++) world.set(x, y, z, AIR);
      world.set(x, floor, z, d < 8 ? P.blackConcrete : P.gravel);
      world.setSurface(x, z, floor);
    }
  }

  // Soul Keeper outpost guarding the breach: palisade, watchtower, cages.
  const style: BuildStyle = BLACKSTONE_STYLE;
  const outpost = rect(cx + 16, cz - 8, cx + 40, cz + 16);
  pad(world, outpost, level, style.floor);
  curtainWall(world, outpost, level, 6, style, [
    { x: outpost.x1, z: cz + 4, halfWidth: 2, facing: 1 },
    { x: cx + 28, z: outpost.z2, halfWidth: 2, facing: 2 },
  ]);
  tower(world, cx + 20, cz + 12, 4, level, 16, style, { round: true, crown: true });
  tower(world, cx + 36, cz + 12, 4, level, 16, style, { round: true, crown: true });
  greenGlazing(world, cx + 20, cz + 12, 4, level + 6);
  greenGlazing(world, cx + 36, cz + 12, 4, level + 6);
  greenGlazing(world, cx + 20, cz + 12, 4, level + 12);
  greenGlazing(world, cx + 36, cz + 12, 4, level + 12);
  house(world, cx + 28, cz + 6, 9, 7, level, 5, style, { face: 2 });
  // cages in front of the breach, exactly as Wemmbu found them
  const cages: Array<[number, number]> = [
    [cx - 10, cz + 20],
    [cx - 2, cz + 22],
    [cx + 6, cz + 20],
    [cx - 6, cz + 26],
  ];
  for (const [gx, gz] of cages) {
    cage(world, gx, gz, level + 1, 2);
  }
  for (let i = 0; i < 5; i++) {
    lampPost(world, cx - 24 + i * 12, cz + 32, level, style.light);
  }
  // A beacon-ish pyre marking spawn.
  world.fill(cx - 1, level, cz - 33, cx + 1, level + 2, cz - 31, P.chiseledBlackstone);
  world.set(cx, level + 3, cz - 32, P.soulCampfire);
  world.set(cx, level + 4, cz - 32, P.soulLantern);
}

// ---------------------------------------------------------------------------
// 2. The Center - the Withered Castle and the Gold Block
// ---------------------------------------------------------------------------

export function buildCenter(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.center.center;
  const level = areaGround(world, LANDMARKS.center.footprint);
  const style = BLACKSTONE_STYLE;

  pad(world, rect(cx - 54, cz - 54, cx + 54, cz + 54), level, P.polishedBlackstone, P.deepslate);

  const outer = rect(cx - 50, cz - 44, cx + 50, cz + 44);
  curtainWall(world, outer, level, 13, style, [
    { x: cx, z: cz + 44, halfWidth: 3, facing: 2 }, // south gate (from the Breach road)
    { x: cx, z: cz - 44, halfWidth: 3, facing: 3 }, // north gate
    { x: cx + 50, z: cz, halfWidth: 3, facing: 0 }, // east gate (Long Walk West)
    { x: cx - 50, z: cz, halfWidth: 3, facing: 1 }, // west gate
  ]);
  for (const sx of [-50, 50]) {
    for (const sz of [-44, 44]) {
      tower(world, cx + sx, cz + sz, 5, level, 24, style, { round: true, crown: true });
      // Soul Keeper glazing, placed after the tower so it survives.
      greenGlazing(world, cx + sx, cz + sz, 5, level + 7);
      greenGlazing(world, cx + sx, cz + sz, 5, level + 17);
    }
  }
  gatehouse(world, cx, cz + 44, level, style, 2, { open: true, height: 11 });
  gatehouse(world, cx, cz - 44, level, style, 3, { open: true, height: 11 });
  gatehouse(world, cx + 50, cz, level, style, 0, { open: true, height: 11 });
  gatehouse(world, cx - 50, cz, level, style, 1, { open: true, height: 11 });

  // courtyard paving + the crossed roads
  world.fill(cx - 49, level, cz - 43, cx + 49, level, cz + 43, P.blackstone);
  for (let i = -49; i <= 49; i++) {
    for (let w = -3; w <= 3; w++) {
      world.set(cx + i, level, cz + w, P.deepslateTiles);
      world.set(cx + w, level, cz + i, P.deepslateTiles);
    }
  }

  // THE CENTER: the gold block monument. Canon: "located in (about) the middle
  // of the castle, and standing on it or near it makes your game extremely
  // laggy" - here it is a gold-cored monolith on a gilded plinth.
  const gx = cx;
  const gz = cz;
  world.fill(gx - 4, level, gz - 4, gx + 4, level + 1, gz + 4, P.chiseledBlackstone);
  world.fill(gx - 3, level + 2, gz - 3, gx + 3, level + 2, gz + 3, P.gildedBlackstone);
  world.fill(gx - 2, level + 3, gz - 2, gx + 2, level + 3, gz + 2, P.polishedBlackstone);
  world.fill(gx - 2, level + 4, gz - 2, gx + 2, level + 6, gz + 2, P.goldBlock);
  world.fill(gx - 1, level + 7, gz - 1, gx + 1, level + 8, gz + 1, P.goldBlock);
  world.set(gx, level + 9, gz, P.gildedBlackstone);
  for (const [ox, oz] of [
    [-4, -4],
    [4, -4],
    [-4, 4],
    [4, 4],
  ]) {
    world.column(gx + ox, gz + oz, level + 1, level + 4, P.chiseledBlackstone);
    world.set(gx + ox, level + 5, gz + oz, P.soulLantern);
  }

  // The keep behind the monument.
  keep(world, cx, cz - 20, 40, 32, level, 17, style, { goldCrown: true, bannerColor: P.blackConcrete });

  // Side buildings inside the walls (barracks / halls), plus wall-top lamps.
  house(world, cx - 30, cz + 22, 14, 10, level, 6, style, { face: 0 });
  house(world, cx + 30, cz + 22, 14, 10, level, 6, style, { face: 1 });
  house(world, cx - 30, cz + 2, 10, 12, level, 5, style, { face: 0 });
  house(world, cx + 30, cz + 2, 10, 12, level, 5, style, { face: 1 });
  statue(world, cx - 20, cz + 30, level, 1, style);
  statue(world, cx + 20, cz + 30, level, 1, style);

  // Cages in front of the castle (Wemmbu sneaks past them after landing).
  for (let i = 0; i < 4; i++) {
    cage(world, cx - 16 + i * 11, cz + 50, level, 2);
  }
  for (let i = 0; i < 6; i++) {
    lampPost(world, cx - 40 + i * 16, cz + 56, level, style.light);
  }
  // Graveyard-adjacent rubble along the north wall.
  const rng = new Rng(0x1a2b);
  for (let i = 0; i < 60; i++) {
    const x = cx - 48 + rng.int(0, 96);
    const z = cz - 52 + rng.int(0, 6);
    world.set(x, level + rng.int(0, 1), z, rng.chance(0.5) ? P.crackedBlackstoneBricks : P.gravel);
  }
}

// ---------------------------------------------------------------------------
// 3. The Fields - wheat terraces and the brewing tower
// ---------------------------------------------------------------------------

export function buildFields(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.fields.center;
  const level = areaGround(world, LANDMARKS.fields.footprint);
  const style = STONE_STYLE;

  pad(world, rect(cx - 50, cz - 48, cx + 50, cz + 48), level, P.coarseDirt, P.deepslate, false);

  // TheOathBinder's wall: a ring wall that shuts the fields off once activated.
  const ringRect = rect(cx - 46, cz - 44, cx + 46, cz + 44);
  curtainWall(world, ringRect, level, 8, style, [
    { x: cx, z: cz + 44, halfWidth: 3, facing: 2 },
    { x: cx - 46, z: cz, halfWidth: 3, facing: 1 },
  ]);

  // Wheat terraces on the west half.
  wheatTerraces(world, rect(cx - 40, cz - 38, cx - 6, cz + 34), level, 7);
  // Second patch on the east.
  wheatTerraces(world, rect(cx + 8, cz - 30, cx + 40, cz + 20), level, 5);

  // The brewing tower: a slim round tower with cauldrons and a lit crown.
  const tx = cx + 4;
  const tz = cz - 2;
  tower(world, tx, tz, 6, level, 24, style, { round: true, crown: true, doorFacing: 2 });
  for (let y = level + 2; y <= level + 18; y += 4) {
    world.fill(tx - 4, y, tz - 4, tx + 4, y, tz + 4, P.darkOakPlanks);
    world.set(tx - 2, y + 1, tz - 3, P.cauldron);
    world.set(tx + 2, y + 1, tz - 3, P.barrel);
    world.set(tx - 3, y + 2, tz + 2, P.bookshelf);
    world.set(tx + 3, y + 2, tz + 2, P.bookshelf);
    world.set(tx, y + 3, tz, P.soulLantern);
  }
  // external staircase up the tower
  for (let i = 0; i < 12; i++) {
    const px = tx + 7 + Math.floor(i / 4);
    const pz = tz - 4 + (i % 4);
    world.set(px, level + i, pz, stairs("minecraft:stone_brick_stairs", 0));
    world.set(px, level + i - 1, pz, P.stoneBrick);
  }

  // Farm cottages, silos and hay.
  house(world, cx - 18, cz - 34, 12, 9, level, 5, style, { face: 2 });
  house(world, cx + 22, cz - 34, 11, 9, level, 5, style, { face: 2 });
  house(world, cx + 24, cz + 28, 13, 10, level, 6, style, { face: 3 });
  for (const [sx, sz] of [
    [cx - 30, cz + 30],
    [cx - 22, cz + 30],
  ]) {
    world.cylinder(sx, sz, 3, level, level + 10, P.deepslateBricks, true);
    world.disc(sx, sz, 3, level + 11, P.deepslateTiles);
    world.set(sx, level + 12, sz, P.hayBlock);
  }
  // Well + hay stacks + lamps
  world.cylinder(cx - 2, cz + 36, 3, level, level + 3, P.cobbledDeepslate, true);
  world.set(cx - 2, level + 2, cz + 36, P.water);
  world.fill(cx - 4, level + 4, cz + 34, cx, level + 4, cz + 38, P.darkOakPlanks);
  const rng = new Rng(0x9f31);
  for (let i = 0; i < 26; i++) {
    const x = cx - 42 + rng.int(0, 84);
    const z = cz - 40 + rng.int(0, 80);
    world.set(x, level + 1, z, rng.chance(0.5) ? P.hayBlock : P.composter);
  }
  for (let i = 0; i < 6; i++) {
    lampPost(world, cx - 40 + i * 16, cz - 42, level, style.light);
    lampPost(world, cx - 40 + i * 16, cz + 42, level, style.light);
  }
}

// ---------------------------------------------------------------------------
// 4. The Citadel - the great library of the west
// ---------------------------------------------------------------------------

export function buildCitadel(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.citadel.center;
  const level = areaGround(world, LANDMARKS.citadel.footprint);
  const style = DEEPSLATE_STYLE;

  pad(world, rect(cx - 31, cz - 31, cx + 31, cz + 31), level, P.polishedDeepslate, P.deepslate);

  const outer = rect(cx - 29, cz - 29, cx + 29, cz + 29);
  curtainWall(world, outer, level, 15, style, [
    { x: cx + 29, z: cz, halfWidth: 3, facing: 0 }, // east gate: the Long Walk West arrives here
  ]);
  for (const sx of [-29, 29]) {
    for (const sz of [-29, 29]) {
      tower(world, cx + sx, cz + sz, 5, level, 30, style, { round: true, crown: true });
      greenGlazing(world, cx + sx, cz + sz, 5, level + 9);
      greenGlazing(world, cx + sx, cz + sz, 5, level + 21);
    }
  }
  gatehouse(world, cx + 29, cz, level, style, 0, { open: true, height: 13 });

  // The library itself: three floors of shelves around a central void.
  const libRect = rect(cx - 24, cz - 22, cx + 24, cz + 22);
  world.fill(libRect.x1, level, libRect.z1, libRect.x2, level, libRect.z2, P.deepslateTiles);
  for (let floor = 0; floor < 3; floor++) {
    const y = level + floor * 8;
    world.rectWalls(libRect.x1, libRect.z1, libRect.x2, libRect.z2, y, y + 7, style.wall);
    world.fill(libRect.x1 + 1, y + 7, libRect.z1 + 1, libRect.x2 - 1, y + 7, libRect.z2 - 1, P.deepslateTiles);
    // shelves in rows, with reading aisles
    for (let z = libRect.z1 + 4; z <= libRect.z2 - 4; z += 6) {
      for (let x = libRect.x1 + 3; x <= libRect.x2 - 3; x++) {
        world.set(x, y + 1, z, P.bookshelf);
        world.set(x, y + 2, z, P.bookshelf);
        world.set(x, y + 3, z, P.bookshelf);
        world.set(x, y + 4, z, P.darkOakPlanks);
        if ((x & 7) === 0) world.set(x, y + 5, z, P.lantern);
      }
    }
    // colonnade around the central atrium
    for (let z = cz - 8; z <= cz + 8; z++) {
      for (const x of [cx - 8, cx + 8]) {
        world.column(x, z, y + 1, y + 7, (z & 3) === 0 ? style.trim : style.wall);
      }
    }
    for (let x = cx - 8; x <= cx + 8; x++) {
      for (const z of [cz - 8, cz + 8]) {
        world.column(x, z, y + 1, y + 7, (x & 3) === 0 ? style.trim : style.wall);
      }
    }
    // spiral-ish stairwell between floors
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(a) * 10);
    const pz = cz + Math.round(Math.sin(a) * 10);
    world.set(px, y + i, pz, stairs("minecraft:deepslate_tile_stairs", (i & 1) as 0 | 1));
  }
  }
  // The atrium shaft: open to the dark sky, with the gold-trimmed dome ribs.
  // The ground floor of the library stays intact under the shaft.
  world.fill(cx - 7, level + 1, cz - 7, cx + 7, level + 24, cz + 7, AIR);
  for (let r = 8; r <= 14; r++) {
    world.ring(cx, cz, r, level + 24 - (r - 8), style.trim);
  }
  world.disc(cx, cz, 7, level + 25, P.gildedBlackstone);

  // The exit stairwell Spoke escaped through: broken bedrock and a ladder.
  const ex = cx - 18;
  const ez = cz + 16;
  world.cylinder(ex, ez, 4, level, level + 28, style.wall, true);
  for (let i = 0; i <= 28; i++) {
    const px = ex + 2;
    const pz = ez + (i % 4) - 2;
    world.set(px, level + i, pz, P.darkOakTrapdoor);
  }
  world.fill(ex - 2, level + 29, ez - 2, ex + 2, level + 29, ez + 2, P.deepslate);
  world.fill(ex - 1, level + 30, ez - 1, ex + 1, level + 30, ez + 1, P.obsidian);

  // Outer courtyard details: scholars' study alcoves and braziers.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(a) * 26);
    const pz = cz + Math.round(Math.sin(a) * 26);
    world.column(px, pz, level + 1, level + 3, P.chiseledDeepslate);
    world.set(px, level + 4, pz, P.soulLantern);
  }
}

// ---------------------------------------------------------------------------
// 5. The void castles + glass bridges (the escape rooms)
// ---------------------------------------------------------------------------

function escapeRoomFloor(world: World, cx: number, cz: number, level: number, theme: string): void {
  const r = 4;
  // Black concrete shell - canon: "a box of black concrete ... redstone lamp floor".
  world.fill(cx - r, level - 1, cz - r, cx + r, level - 1, cz + r, P.blackConcrete);
  for (let y = level; y <= level + 5; y++) {
    for (let z = cz - r; z <= cz + r; z++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const edge = x === cx - r || x === cx + r || z === cz - r || z === cz + r;
        if (edge || y === level + 5) world.set(x, y, z, P.blackConcrete);
      }
    }
  }
  switch (theme) {
    case "redstone lamps & dripstone": {
      world.fill(cx - r + 1, level, cz - r + 1, cx + r - 1, level, cz + r - 1, P.litRedstoneLamp);
      for (let i = 0; i < 10; i++) world.set(cx - 3 + (i % 5), level + 5, cz, P.bone);
      break;
    }
    case "flooded maze": {
      for (let z = cz - r + 1; z <= cz + r - 1; z++) {
        for (let x = cx - r + 1; x <= cx + r - 1; x++) {
          const inWall = (x + z) % 4 === 0 && Math.abs(x - cx) > 1;
          if (inWall) {
            world.set(x, level, z, P.deepslateTiles);
            world.set(x, level + 1, z, P.deepslateTiles);
          } else {
            world.set(x, level - 1, z, P.water);
          }
        }
      }
      break;
    }
    case "copper bulbs & slime": {
      world.fill(cx - r + 1, level - 1, cz - r + 1, cx + r - 1, level - 1, cz + r - 1, P.copperBulb);
      world.fill(cx - 1, level - 1, cz - 1, cx + 1, level - 1, cz + 1, P.slime);
      world.fill(cx - r + 1, level + 4, cz - r + 1, cx + r - 1, level + 4, cz + r - 1, P.snowBlock);
      break;
    }
    case "floating sand parkour": {
      const rng = new Rng(0x5a17);
      for (let i = 0; i < 22; i++) {
        const x = cx - r + 1 + rng.int(0, r * 2 - 2);
        const z = cz - r + 1 + rng.int(0, r * 2 - 2);
        world.set(x, level + 1 + (i % 4), z, P.sand);
      }
      break;
    }
    default: {
      // dark parkour: barely lit platforms over black concrete
      for (let i = 0; i < 14; i++) {
        world.set(cx - 4 + (i % 7), level + 1 + (i % 3), cz - 2 + (i % 3), P.blackstone);
      }
    }
  }
  // the way out: an iron door in the shell
  world.set(cx + r, level + 1, cz, P.ironBars);
  world.set(cx + r, level + 2, cz, P.ironBars);
  world.set(cx + r, level, cz, AIR);
}

export function buildVoidCastles(world: World): void {
  const style = BLACKSTONE_STYLE;
  const islands = VOID_CASTLE_ISLANDS;
  const eastY = world.surfaceAt(-56, 40); // shore on the Center side
  const westY = world.surfaceAt(-128, 40); // the Citadel's approach

  // Deck heights follow the two shores and dip through the middle, so the
  // bridges are walkable from end to end.
  const tops = islands.map((_, index) => {
    const t = (index + 1) / (islands.length + 1);
    return Math.round(eastY + (westY - eastY) * t - Math.sin(Math.PI * t) * 7) + 1;
  });

  islands.forEach((island, index) => {
    const top = tops[index]!;
    const r = island.radius;
    // floating island: a tapered slab of rock torn out of the plate
    for (let layer = 0; layer < 9; layer++) {
      const radius = Math.max(2, r - layer * 1.6);
      const y = top - layer * 2;
      world.disc(island.x, island.z, Math.round(radius), y, layer === 0 ? P.blackstone : P.deepslate);
      world.disc(island.x, island.z, Math.round(radius), y - 1, P.deepslate);
    }

    // castle: square keep with two towers
    const half = Math.max(5, r - 3);
    world.rectWalls(island.x - half, island.z - half, island.x + half, island.z + half, top + 1, top + 8, style.wall);
    world.rectWalls(island.x - half, island.z - half, island.x + half, island.z + half, top + 9, top + 9, style.trim);
    world.disc(island.x, island.z, half, top, P.polishedBlackstone);
    tower(world, island.x - half, island.z - half, 3, top, 16, style, { round: true, crown: true });
    tower(world, island.x + half, island.z + half, 3, top, 16, style, { round: true, crown: true });
    greenGlazing(world, island.x - half, island.z - half, 3, top + 7);
    greenGlazing(world, island.x - half, island.z - half, 3, top + 12);
    greenGlazing(world, island.x + half, island.z + half, 3, top + 7);
    greenGlazing(world, island.x + half, island.z + half, 3, top + 12);
    // gate facing east (towards the Center) and west (towards the Citadel)
    world.fill(island.x + half - 1, top + 1, island.z - 1, island.x + half + 1, top + 3, island.z + 1, AIR);
    world.fill(island.x - half - 1, top + 1, island.z - 1, island.x - half + 1, top + 3, island.z + 1, AIR);

    // the escape room inside the keep
    escapeRoomFloor(world, island.x, island.z, top + 1, island.escapeRoom);
  });

  // Glass bridges: the chain itself, plus the two shore approaches.
  const first = islands[0]!;
  glassBridge(world, -56, 40, first.x + first.radius - 3, first.z, eastY + 1, {
    width: 2,
    sag: 2,
    deckY2: tops[0]! + 1,
  });
  for (let i = 0; i < islands.length - 1; i++) {
    const a = islands[i]!;
    const b = islands[i + 1]!;
    glassBridge(world, a.x - a.radius + 3, a.z, b.x + b.radius - 3, b.z, tops[i]! + 1, {
      width: 2,
      sag: 3,
      deckY2: tops[i + 1]! + 1,
    });
  }
  const last = islands[islands.length - 1]!;
  glassBridge(world, last.x - last.radius + 3, last.z, -128, 40, tops[tops.length - 1]! + 1, {
    width: 2,
    sag: 3,
    deckY2: westY + 1,
  });
}

// ---------------------------------------------------------------------------
// 6. The Graveyard
// ---------------------------------------------------------------------------

export function buildGraveyard(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.graveyard.center;
  const level = areaGround(world, LANDMARKS.graveyard.footprint);
  const style = DEEPSLATE_STYLE;
  pad(world, rect(cx - 34, cz - 30, cx + 34, cz + 30), level, P.gravel, P.deepslate, false);
  world.fill(cx - 34, level, cz - 30, cx + 34, level, cz + 30, P.gravel);

  const rng = new Rng(0x6e4e);
  // Grave rows, deliberately uneven.
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 9; col++) {
      const x = cx - 26 + col * 6 + rng.int(-1, 1);
      const z = cz - 24 + row * 7 + rng.int(-1, 1);
      if (rng.chance(0.15)) continue;
      grave(world, x, z, level + 1, style);
    }
  }
  // Ruined chapel.
  const chapel = rect(cx - 12, cz - 6, cx + 12, cz + 14);
  world.fill(chapel.x1, level, chapel.z1, chapel.x2, level, chapel.z2, P.deepslateTiles);
  world.rectWalls(chapel.x1, chapel.z1, chapel.x2, chapel.z2, level + 1, level + 9, style.wall);
  for (let i = 0; i < 14; i++) {
    const t = i / 14;
    if (rng.chance(0.35)) continue; // collapsed roof
    const x = Math.round(chapel.x1 + (chapel.x2 - chapel.x1) * t);
    world.set(x, level + 10, chapel.z1 + 1, style.roof);
    world.set(x, level + 10, chapel.z2 - 1, style.roof);
  }
  for (let z = chapel.z1 + 3; z <= chapel.z2 - 3; z += 4) {
    world.set(chapel.x2, level + 3, z, P.grayGlass);
    world.set(chapel.x2, level + 4, z, P.grayGlass);
  }
  world.set(chapel.x1 + 1, level + 10, cz + 4, P.cryingObsidian);
  // Crypt entrance + a lit stair down.
  const kx = cx - 18;
  const kz = cz - 8;
  world.fill(kx - 3, level + 1, kz - 3, kx + 3, level + 4, kz + 3, style.accent);
  world.fill(kx - 1, level + 1, kz - 5, kx + 1, level + 3, kz - 1, AIR);
  for (let i = 0; i < 12; i++) {
    world.set(kx, level - i, kz + i, stairs("minecraft:deepslate_brick_stairs", 2));
    world.set(kx, level - i - 1, kz + i, P.deepslateBricks);
  }
  world.fill(kx - 5, level - 13, kz + 8, kx + 5, level - 6, kz + 18, AIR);
  world.fill(kx - 5, level - 14, kz + 8, kx + 5, level - 14, kz + 18, P.deepslateTiles);
  world.rectWalls(kx - 5, kz + 8, kx + 5, kz + 18, level - 13, level - 7, style.wall);
  for (let i = 0; i < 5; i++) {
    world.set(kx - 4 + i * 2, level - 8, kz + 12, P.soulLantern);
  }
  for (let i = 0; i < 4; i++) {
    world.set(kx - 4 + i * 3, level - 6, kz + 16, P.soulCampfire);
  }
  // Dead trees around the graves.
  for (let i = 0; i < 22; i++) {
    const x = cx - 32 + rng.int(0, 64);
    const z = cz - 28 + rng.int(0, 56);
    const height = rng.int(4, 9);
    for (let y = level + 1; y <= level + height; y++) world.set(x, y, z, P.darkOakLog);
    for (let b = 1; b <= 3; b++) {
      world.set(x + (b & 1 ? 1 : -1) * rng.int(1, 2), level + height - 1, z, P.darkOakLog);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. The Ruins & broken viaduct
// ---------------------------------------------------------------------------

export function buildRuins(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.ruins.center;
  const style = DEEPSLATE_STYLE;
  const rng = new Rng(0x22dd);

  // A broken viaduct running north-south, with a collapsed span.
  for (let i = -34; i <= 34; i += 8) {
    const x = cx + i;
    const ground = world.surfaceAt(x, cz);
    ruinedArch(world, x, cz, ground, 12, style, false);
  }
  bridge(world, cx - 36, cz, cx + 36, cz, areaGround(world, LANDMARKS.ruins.footprint) + 12, style, {
    broken: true,
    railings: true,
  });

  // Fallen columns and wall fragments scattered across the plain.
  for (let i = 0; i < 90; i++) {
    const x = cx - 32 + rng.int(0, 64);
    const z = cz - 26 + rng.int(0, 52);
    const ground = world.surfaceAt(x, z);
    const kind = rng.next();
    if (kind < 0.4) {
      const h = rng.int(2, 8);
      world.column(x, z, ground + 1, ground + h, rng.chance(0.5) ? P.deepslateBricks : P.crackedDeepslateBricks);
      if (rng.chance(0.4)) world.set(x, ground + h + 1, z, P.chiseledDeepslate);
    } else if (kind < 0.75) {
      const w = rng.int(2, 6);
      for (let k = 0; k <= w; k++) {
        world.set(x + k, ground + 1, z, P.deepslateBricks);
        if (rng.chance(0.6)) world.set(x + k, ground + 2, z, P.deepslateBricks);
        if (rng.chance(0.3)) world.set(x + k, ground + 3, z, P.crackedDeepslateBricks);
      }
    } else {
      world.fill(x - 1, ground + 1, z - 1, x + 1, ground + 1, z + 1, P.gravel);
      world.set(x, ground + 2, z, P.cobbledDeepslate);
    }
  }
  // One intact landmark obelisk so the area reads as deliberate.
  const obeliskY = world.surfaceAt(cx, cz);
  world.fill(cx - 2, obeliskY + 1, cz - 2, cx + 2, obeliskY + 2, cz + 2, P.chiseledDeepslate);
  world.column(cx, cz, obeliskY + 3, obeliskY + 16, P.polishedDeepslate);
  world.set(cx, obeliskY + 17, cz, P.gildedBlackstone);
  world.set(cx, obeliskY + 18, cz, P.soulLantern);
}

// ---------------------------------------------------------------------------
// 8. Maze Valley & the crossroads labyrinth
// ---------------------------------------------------------------------------

export function buildMazeValley(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.mazeValley.center;
  const style = DEEPSLATE_STYLE;
  const level = areaGround(world, LANDMARKS.mazeValley.footprint);

  // The valley floor between the two mountains.
  const valley = rect(cx - 34, cz - 46, cx + 34, cz + 40);
  pad(world, valley, Math.min(level, 58), P.cobbledDeepslate, P.deepslate, false);

  // Gateway into the valley: two pillars and a watchtower.
  for (const sx of [-20, 20]) {
    tower(world, cx + sx, cz + 40, 4, Math.min(level, 58), 18, style, { round: true, crown: true });
  }
  world.fill(cx - 20, Math.min(level, 58) + 12, cz + 40, cx + 20, Math.min(level, 58) + 12, cz + 40, style.wall);

  // The labyrinth itself.
  labyrinth(world, rect(cx - 30, cz - 42, cx + 30, cz - 4), Math.min(level, 58), 6, style);

  // Hide the exit: a stair up out of the maze to the village road.
  for (let i = 0; i < 6; i++) {
    world.set(cx, Math.min(level, 58) + i, cz - 44 - i, stairs("minecraft:deepslate_brick_stairs", 3));
    world.set(cx + 1, Math.min(level, 58) + i, cz - 44 - i, P.deepslateBricks);
    world.set(cx - 1, Math.min(level, 58) + i, cz - 44 - i, P.deepslateBricks);
  }
}

// ---------------------------------------------------------------------------
// 9. The Abandoned Village
// ---------------------------------------------------------------------------

export function buildVillage(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.village.center;
  const style = STONE_STYLE;
  const level = areaGround(world, LANDMARKS.village.footprint);
  pad(world, rect(cx - 32, cz - 20, cx + 32, cz + 20), level, P.coarseDirt, P.deepslate, false);
  world.fill(cx - 32, level, cz - 20, cx + 32, level, cz + 20, P.coarseDirt);

  const rng = new Rng(0x77a1);
  // Main street.
  world.fill(cx - 32, level, cz - 1, cx + 32, level, cz + 1, P.gravel);
  const plots: Array<[number, number, number, number]> = [
    [-26, -16, 12, 9],
    [-10, -16, 11, 9],
    [6, -16, 13, 10],
    [22, -16, 10, 9],
    [-26, 10, 12, 10],
    [-8, 10, 12, 9],
    [10, 10, 11, 10],
    [24, 10, 12, 9],
  ];
  for (const [ox, oz, w, d] of plots) {
    const ruined = rng.chance(0.3);
    house(world, cx + ox, cz + oz, w, d, level, 5, style, { ruined, face: oz < 0 ? 2 : 3 });
    if (!ruined && rng.chance(0.6)) {
      // small garden / plot
      for (let z = cz + oz - d / 2 - 3; z < cz + oz - d / 2; z++) {
        for (let x = cx + ox - w / 2; x < cx + ox + w / 2; x++) {
          world.set(x, level, z, P.farmland);
          world.set(x, level + 1, z, rng.chance(0.6) ? P.wheat : P.youngWheat);
        }
      }
    }
  }
  // The village castle: small keep on the north side.
  keep(world, cx + 2, cz - 30, 24, 18, level, 12, style, { bannerColor: P.grayConcrete });
  // Wells, fences, lamps, market stalls.
  world.cylinder(cx - 2, cz + 6, 3, level, level + 3, P.cobbledDeepslate, true);
  world.set(cx - 2, level + 2, cz + 6, P.water);
  world.fill(cx - 4, level + 4, cz + 4, cx + 2, level + 4, cz + 8, P.sprucePlanks);
  for (let i = 0; i < 7; i++) {
    lampPost(world, cx - 30 + i * 10, cz + 4, level, style.light, 3);
    lampPost(world, cx - 30 + i * 10, cz - 4, level, style.light, 3);
  }
  for (let i = 0; i < 5; i++) {
    const x = cx - 20 + i * 9;
    const z = cz + 14;
    world.set(x, level + 1, z, P.spruceFence);
    world.set(x, level + 2, z, P.hayBlock);
    world.set(x, level + 3, z, P.spruceTrapdoor);
  }
  // Dead trees and rubble between the houses.
  for (let i = 0; i < 26; i++) {
    const x = cx - 30 + rng.int(0, 60);
    const z = cz - 18 + rng.int(0, 36);
    if (world.get(x, level, z)?.name !== "minecraft:coarse_dirt") continue;
    const h = rng.int(4, 8);
    for (let y = level + 1; y <= level + h; y++) world.set(x, y, z, rng.chance(0.8) ? P.spruceLog : P.darkOakLog);
  }
}

// ---------------------------------------------------------------------------
// 10. The Frost Pocket
// ---------------------------------------------------------------------------

export function buildFrostPocket(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.frostPocket.center;
  const rng = new Rng(0x4f2c);
  const level = areaGround(world, LANDMARKS.frostPocket.footprint);
  // Guarantee the pocket is solid ground even where it reaches the plate rim.
  pad(world, rect(cx - 34, cz - 30, cx + 34, cz + 30), level, P.snowLayer, P.snowBlock);

  // Frozen pond.
  world.disc(cx - 12, cz + 8, 12, level, P.ice);
  world.disc(cx - 12, cz + 8, 9, level, P.packedIce);
  world.disc(cx - 12, cz + 8, 4, level, P.blueIce);
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    const px = cx - 12 + Math.round(Math.cos(ang) * 11);
    const pz = cz + 8 + Math.round(Math.sin(ang) * 11);
    world.set(px, level + 1, pz, rng.chance(0.5) ? P.snowLayer : P.powderSnow);
  }
  // Dead pines in the drifts.
  for (let i = 0; i < 34; i++) {
    const x = cx - 30 + rng.int(0, 60);
    const z = cz - 28 + rng.int(0, 56);
    const surface = world.surfaceAt(x, z);
    if (!world.isLand(x, z)) continue;
    const h = rng.int(5, 11);
    for (let y = surface + 1; y <= surface + h; y++) world.set(x, y, z, P.spruceLog);
    const branches = rng.int(2, 4);
    for (let b = 0; b < branches; b++) {
      const by = surface + 3 + b * 2;
      const dir = rng.int(0, 3);
      const dx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
      const dz = dir === 2 ? 1 : dir === 3 ? -1 : 0;
      world.set(x + dx, by, z + dz, P.spruceLog);
      world.set(x + dx * 2, by + 1, z + dz * 2, P.spruceLog);
    }
    world.set(x, surface + h + 1, z, P.snowBlock);
  }
  // The secret entrance from the tomb: a broken stair emerging from the ground.
  for (let i = 0; i < 10; i++) {
    world.set(cx + 22, level + i - 6, cz - 24 + i, i % 2 === 0 ? P.deepslateBricks : P.snowBlock);
  }
  world.fill(cx + 20, level - 8, cz - 26, cx + 24, level - 1, cz - 14, AIR);
  world.fill(cx + 20, level - 9, cz - 26, cx + 24, level - 9, cz - 14, P.deepslateTiles);
}

// ---------------------------------------------------------------------------
// 11. The Pit & Tomb of the Mage of the Deep
// ---------------------------------------------------------------------------

export function buildTomb(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.tomb.center;
  const style = DEEPSLATE_STYLE;
  const level = areaGround(world, LANDMARKS.tomb.footprint);

  // Cave gate with an iron barred entrance, framed by statues.
  const gx = cx;
  const gz = cz + 30;
  world.fill(gx - 8, level, gz - 2, gx + 8, level + 10, gz + 2, P.deepslateBricks);
  world.fill(gx - 4, level, gz - 3, gx + 4, level + 6, gz + 3, AIR);
  for (let x = gx - 4; x <= gx + 4; x++) {
    world.set(x, level, gz, P.ironBars);
    world.set(x, level + 1, gz, P.ironBars);
    world.set(x, level + 2, gz, P.ironBars);
  }
  world.fill(gx - 6, level + 10, gz - 2, gx + 6, level + 11, gz + 2, P.chiseledDeepslate);
  statue(world, gx - 11, gz, level, 1, style);
  statue(world, gx + 11, gz, level, 1, style);
  world.set(gx, level + 12, gz, P.soulLantern);
  world.set(gx, level + 11, gz, P.chain);

  // The statue-lined dark pit.
  const pitX = cx;
  const pitZ = cz + 8;
  const pitDepth = 26;
  world.carveSphere(pitX, level - pitDepth + 8, pitZ, 17);
  for (let y = level - pitDepth; y <= level - pitDepth + 4; y++) {
    world.disc(pitX, pitZ, 16, y, P.deepslate);
  }
  world.disc(pitX, pitZ, 16, level - pitDepth + 5, P.blackConcrete);
  const statues = 10;
  for (let i = 0; i < statues; i++) {
    const a = (i / statues) * Math.PI * 2;
    const px = pitX + Math.round(Math.cos(a) * 14);
    const pz = pitZ + Math.round(Math.sin(a) * 14);
    statue(world, px, pz, level - 2, 1, style);
    world.set(px, level - 1, pz, P.soulTorch);
  }
  // Ramp down into the pit.
  for (let i = 0; i < pitDepth; i++) {
    const t = i / pitDepth;
    const px = pitX - 15 + Math.round(t * 13);
    const pz = pitZ - 15 + Math.round(t * 13);
    for (let w = -2; w <= 2; w++) {
      world.set(px, level - i, pz + w, P.deepslateTiles);
      world.set(px + 1, level - i, pz + w, P.deepslateTiles);
    }
  }

  // The tomb chamber: skulk, sensors and a shrine.
  const tx = cx + 4;
  const tz = cz - 18;
  world.fill(tx - 14, level - 24, tz - 12, tx + 14, level - 14, tz + 12, AIR);
  world.fill(tx - 14, level - 25, tz - 12, tx + 14, level - 25, tz + 12, P.sculk);
  world.rectWalls(tx - 14, tz - 12, tx + 14, tz + 12, level - 24, level - 15, P.deepslateBricks);
  for (let i = 0; i < 40; i++) {
    const x = tx - 12 + ((i * 37) % 25);
    const z = tz - 10 + ((i * 53) % 21);
    world.set(x, level - 14, z, i % 3 === 0 ? P.sculkShrieker : P.sculkVein);
  }
  world.fill(tx - 3, level - 24, tz - 3, tx + 3, level - 21, tz + 3, P.sculkCatalyst);
  world.fill(tx - 6, level - 24, tz - 6, tx + 6, level - 24, tz + 6, P.sculk);
  world.set(tx, level - 20, tz, P.soulLantern);
  // Muffled corridors out of the tomb: to the frost pocket and to the ravine.
  for (let i = 0; i < 34; i++) {
    world.set(tx + 14 + i, level - 20, tz, P.deepslateTiles);
    world.fill(tx + 14 + i, level - 19, tz - 2, tx + 14 + i, level - 16, tz + 2, AIR);
  }
  for (let i = 0; i < 30; i++) {
    world.set(tx, level - 20, tz + 12 + i, P.deepslateTiles);
    world.fill(tx - 2, level - 19, tz + 12 + i, tx + 2, level - 16, tz + 12 + i, AIR);
  }

  // The lava trap corridor on the surface: a channel of lava the crew must cross.
  for (let i = 0; i < 26; i++) {
    const x = cx - 30 + i;
    world.fill(x, level - 2, cz - 34, x, level + 6, cz - 26, AIR);
    world.set(x, level - 3, cz - 30, P.lava);
    world.set(x, level - 2, cz - 31, P.magma);
    world.set(x, level - 2, cz - 29, P.magma);
    if (i % 7 === 0) {
      world.set(x, level - 2, cz - 30, P.deepslateBricks);
      world.set(x, level - 1, cz - 30, P.deepslateBricks);
    }
  }
}

// ---------------------------------------------------------------------------
// 12. The Ashen Reaches (lava mountains + strider island)
// ---------------------------------------------------------------------------

export function buildAshenReaches(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.ashenReaches.center;
  const rng = new Rng(0x1a7a);

  // Magma outcrops and lava falls on the surrounding hills.
  for (let i = 0; i < 60; i++) {
    const x = cx - 60 + rng.int(0, 120);
    const z = cz - 60 + rng.int(0, 120);
    if (!world.isLand(x, z)) continue;
    const surface = world.surfaceAt(x, z);
    if (surface <= 46) continue;
    const h = rng.int(2, 7);
    for (let y = surface + 1; y <= surface + h; y++) {
      world.set(x, y, z, rng.chance(0.6) ? P.blackstone : P.basalt);
    }
    if (rng.chance(0.35)) world.set(x, surface + h, z, P.lava);
  }

  // The strider island: a dock, a launch ramp (the "machine" Parrot is offered)
  // and three carved strider-moorings.
  const ix = cx - 4;
  const iz = cz + 6;
  const islandY = world.surfaceAt(ix, iz);
  for (let i = 0; i < 3; i++) {
    const px = ix - 4 + i * 4;
    world.fill(px - 1, islandY + 1, iz + 4, px + 1, islandY + 1, iz + 8, P.blackstone);
    world.set(px, islandY + 2, iz + 8, P.darkOakFence);
    world.set(px, islandY + 2, iz + 4, P.blackstone);
  }
  // Launch ramp out over the lava.
  for (let i = 0; i < 10; i++) {
    world.fill(ix + 8 + i, islandY + 1 + Math.floor(i / 4), iz, ix + 8 + i, islandY + 1 + Math.floor(i / 4), iz + 2, P.darkOakPlanks);
  }
  world.set(ix + 6, islandY + 2, iz + 1, P.soulCampfire);
  for (let i = 0; i < 6; i++) {
    world.set(ix - 10 + i * 4, islandY + 2, iz - 6, P.magma);
  }
}

// ---------------------------------------------------------------------------
// 13. The Ruined Castle (the way out)
// ---------------------------------------------------------------------------

export function buildRuinedCastle(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.ruinedCastle.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.ruinedCastle.footprint);
  const rng = new Rng(0x3f77);
  pad(world, rect(cx - 26, cz - 24, cx + 26, cz + 24), level, P.cobbledDeepslate, P.deepslate);

  // A castle that lost its war: partial walls, collapsed towers.
  const shell: RectRegion = rect(cx - 24, cz - 22, cx + 24, cz + 22);
  for (let y = level; y <= level + 12; y++) {
    for (let x = shell.x1; x <= shell.x2; x++) {
      for (const z of [shell.z1, shell.z2]) {
        if (rng.chance(0.45)) continue;
        world.set(x, y, z, y === level + 12 ? style.trim : style.wall);
      }
    }
    for (let z = shell.z1; z <= shell.z2; z++) {
      for (const x of [shell.x1, shell.x2]) {
        if (rng.chance(0.45)) continue;
        world.set(x, y, z, y === level + 12 ? style.trim : style.wall);
      }
    }
  }
  tower(world, cx - 24, cz - 22, 4, level, 8, style, { round: true }); // half-collapsed
  tower(world, cx + 24, cz + 22, 4, level, 16, style, { round: true, crown: true });
  world.fill(shell.x1 + 1, level, shell.z1 + 1, shell.x2 - 1, level, shell.z2 - 1, P.blackstone);

  // The pressure plate platforms: two plates must be stood on to open the vault.
  const px1 = cx - 6;
  const px2 = cx + 6;
  const pz = cz - 6;
  for (const px of [px1, px2]) {
    world.fill(px - 2, level, pz - 2, px + 2, level + 1, pz + 2, P.chiseledBlackstone);
    world.set(px, level + 2, pz, P.pressurePlate);
    world.set(px, level + 2, pz - 2, P.soulLantern);
  }
  // The hidden vault with the portal home.
  const vx = cx;
  const vz = cz + 10;
  world.fill(vx - 8, level, vz - 6, vx + 8, level + 7, vz + 8, P.deepslateBricks);
  world.fill(vx - 6, level, vz - 4, vx + 6, level + 6, vz + 6, AIR);
  portalFrame(world, vx, level + 1, vz + 2, true);
  world.fill(vx - 6, level, vz - 4, vx + 6, level, vz + 6, P.blackConcrete);
  for (const sx of [-6, 6]) {
    world.column(vx + sx, vz - 4, level + 1, level + 6, P.chiseledBlackstone);
  }
  world.set(vx, level + 6, vz - 4, P.soulLantern);
  // Broken entry: the wall has fallen in where the crew walks through.
  world.fill(vx - 2, level, vz - 6, vx + 2, level + 4, vz - 6, AIR);
}

// ---------------------------------------------------------------------------
// 15. The Glassworks - the Soul Keepers' glazing hall
// ---------------------------------------------------------------------------

/**
 * Where the Soul Keepers' glazing comes from.
 *
 * Canon keeps the palette grey and black, with "the green visible on some
 * structures" as the only vibrant colour, so this is the place that green is
 * made: a long hall of stained glass set in blackstone frames, the roof half
 * fallen in, a rose window at each gable and a green glass crystal over the
 * furnace at its heart. It is also the map's glass set piece - the window
 * bands, the roof, the crystal and the cullet on the floor are all glazing.
 */
export function buildGlassworks(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.glassworks.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.glassworks.footprint);
  pad(world, rect(cx - 36, cz - 42, cx + 36, cz + 42), level, P.polishedBlackstone, P.deepslate);

  const glazing = [P.greenGlass, P.limeGlass, P.cyanGlass, P.lightBlueGlass, P.whiteGlass, P.grayGlass];
  const panes = [P.greenGlassPane, P.whiteGlassPane, P.lightBlueGlassPane, P.grayGlassPane];
  const frame = P.polishedBlackstone;
  const halfW = 15;
  const halfD = 30;
  const height = 21;
  const top = level + height;
  const rng = new Rng(0x91a5);

  // Floor, shell, and stonework banding above the glazing.
  world.fill(cx - halfW, level, cz - halfD, cx + halfW, level, cz + halfD, P.deepslateTiles);
  world.rectWalls(cx - halfW, cz - halfD, cx + halfW, cz + halfD, level + 1, top, style.wall);

  // Window bays: four along each long wall, full height, in a stone frame.
  for (let bay = 0; bay < 4; bay++) {
    const z1 = cz - halfD + 4 + bay * 14;
    glazedPanel(world, rect(cx - halfW, z1, cx - halfW, z1 + 8), level + 3, top - 4, glazing, frame);
    glazedPanel(world, rect(cx + halfW, z1, cx + halfW, z1 + 8), level + 3, top - 4, glazing, frame);
  }

  // Gable ends: a rose window over a pair of lesser windows.
  roseWindow(world, cx, cz - halfD, level + 13, 8, true, glazing, frame);
  roseWindow(world, cx, cz + halfD, level + 13, 8, true, glazing, frame);
  for (const gz of [cz - halfD, cz + halfD]) {
    glazedPanel(world, rect(cx - 10, gz, cx - 3, gz), level + 3, level + 9, glazing, frame);
    glazedPanel(world, rect(cx + 3, gz, cx + 10, gz), level + 3, level + 9, glazing, frame);
  }

  // The roof: a glazed ridge, deliberately collapsed over the north end.
  for (let step = 0; step <= halfW; step++) {
    const y = top + Math.min(step, Math.round(halfW / 2));
    for (let z = cz - halfD; z <= cz + halfD; z++) {
      if (z < cz - 6 && rng.chance(0.45)) continue;
      const glass = step % 2 === 0 ? glazing[0]! : panes[step % panes.length]!;
      world.set(cx - halfW + step, y, z, glass);
      world.set(cx + halfW - step, y, z, glass);
    }
  }
  for (let z = cz - halfD; z <= cz + halfD; z += 4) {
    world.set(cx, top + Math.round(halfW / 2) + 1, z, frame);
  }

  // Interior: a glass bridge, the furnace, and the green crystal over it.
  const bridgeY = level + 11;
  for (const bx of [cx - 8, cx + 8]) {
    for (let z = cz - halfD + 6; z <= cz + halfD - 6; z++) {
      world.set(bx, bridgeY, z, ((z >> 1) & 1) === 0 ? P.glass : frame);
      world.set(bx, bridgeY + 1, z, ((z >> 1) & 1) === 0 ? P.greenGlassPane : AIR);
    }
  }
  for (let i = 0; i < 6; i++) {
    world.column(cx - 8 + i * 3, cz - halfD + 6 + (i % 2) * 2, level + 1, bridgeY - 1, frame);
  }
  world.fill(cx - 3, level + 1, cz - 4, cx + 3, level + 2, cz + 4, P.chiseledBlackstone);
  world.set(cx, level + 3, cz, P.furnace);
  for (let y = level + 3; y <= level + 16; y++) {
    const r = y % 3 === 0 ? 2 : 1;
    world.disc(cx, cz, r, y, y % 4 === 0 ? P.limeGlass : P.greenGlass);
  }
  world.set(cx, level + 17, cz, P.glowstone);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      world.set(cx + sx * 4, level + 9, cz + sz * 4, P.hangingSoulLantern);
    }
  }

  // A Soul Keeper outbuilding and the cullet heap at the door.
  house(world, cx - 26, cz - 36, 11, 9, level, 6, style, { face: 0 });
  for (let i = 0; i < 40; i++) {
    const x = cx - 24 + rng.int(0, 48);
    const z = cz + 34 + rng.int(0, 8);
    world.set(x, level + 1, z, rng.chance(0.5) ? P.glass : P.glassPane);
  }
  for (let i = 0; i < 5; i++) {
    lampPost(world, cx - 20 + i * 10, cz - halfD - 6, level, style.light, 4);
  }
}

// ---------------------------------------------------------------------------
// 16. The Gate Field - the cut portals
// ---------------------------------------------------------------------------

/**
 * The field of gates: eighteen nether portals in three colonnades, each one in
 * a different state of failure.
 *
 * *whole* - the frame stands and the portal is lit;
 * *cut* - the frame is sheared off above head height, so only a stub of obsidian
 * and the lower half of the portal survives (the "cut portal");
 * *collapsed* - just the jambs and a scatter of obsidian are left.
 *
 * A grand double gate stands at the middle of the field.
 */
export function buildPortalField(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.portalField.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.portalField.footprint);
  pad(world, rect(cx - 40, cz - 50, cx + 40, cz + 50), level, P.blackstone, P.blackstone);
  const rng = new Rng(0x9a7e);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      const gx = cx - 30 + col * 12;
      const gz = cz - 32 + row * 32;
      if (Math.abs(gx - cx) < 3 && Math.abs(gz - cz) < 3) continue; // the grand gate stands here
      const y = level + 1;
      const alongX = rng.chance(0.5);
      const kind = rng.next();

      if (kind < 0.34) {
        // Cut: build it, then shear the top of the frame away.
        portalFrame(world, gx, y, gz, alongX, true);
        world.fill(gx - 4, y + 3, gz - 4, gx + 4, y + 12, gz + 4, AIR);
        for (let i = -2; i <= 2; i++) {
          const px = alongX ? gx + i : gx;
          const pz = alongX ? gz : gz + i;
          world.set(px, y, pz, P.obsidian);
          if (Math.abs(i) === 2) world.set(px, y + 1, pz, rng.chance(0.6) ? P.obsidian : P.cryingObsidian);
        }
      } else if (kind < 0.68) {
        // Collapsed: jambs and rubble only.
        for (const i of [-2, 2]) {
          const px = alongX ? gx + i : gx;
          const pz = alongX ? gz : gz + i;
          world.column(px, pz, y, y + rng.int(1, 3), P.obsidian);
          world.set(px, y + 4, pz, P.cryingObsidian);
        }
        for (let i = 0; i < 6; i++) {
          const px = gx + rng.int(-4, 4);
          const pz = gz + rng.int(-4, 4);
          world.set(px, y, pz, rng.chance(0.4) ? P.cryingObsidian : P.obsidian);
        }
      } else {
        portalFrame(world, gx, y, gz, alongX, false);
        world.set(gx, y + 5, gz, P.soulLantern);
      }
    }
  }

  // The grand gate: a ten-wide obsidian arch with a lit portal in the middle.
  const gateZ = cz + 2;
  for (let i = -5; i <= 5; i++) {
    for (let j = -1; j <= 9; j++) {
      const corner = Math.abs(i) === 5 && (j === -1 || j === 9);
      const edge = Math.abs(i) === 5 || j === -1 || j === 9;
      if (!edge) {
        world.set(cx + i, level + 1 + j, gateZ, P.portal);
        continue;
      }
      world.set(cx + i, level + 1 + j, gateZ, corner || rng.chance(0.85) ? P.obsidian : P.cryingObsidian);
    }
  }
  world.fill(cx - 3, level + 1, gateZ - 2, cx + 3, level + 3, gateZ + 2, P.chiseledBlackstone);
  for (const sx of [-7, 7]) {
    tower(world, cx + sx, gateZ, 3, level, 14, style, { round: true, crown: true });
  }
  for (const sz of [-34, 34]) {
    lampPost(world, cx - 24, cz + sz, level, style.light, 5);
    lampPost(world, cx + 24, cz + sz, level, style.light, 5);
  }
  // A couple of caged gates taken out of use.
  for (const [gx, gz] of [
    [cx - 34, cz + 44],
    [cx + 34, cz - 44],
  ] as const) {
    cage(world, gx, gz, level + 1, 2);
  }
}

// ---------------------------------------------------------------------------
// 17. The End Ruin
// ---------------------------------------------------------------------------

/**
 * The dark end of the realm: "the sky and void grow increasingly darker as the
 * proximity to the end shortens". A shattered plaza of end stone and purpur on
 * an obsidian rim, ringed by obsidian pillars carrying end rods, with four
 * broken end portals - the only ones in the world - and a shard of the End
 * hanging above it. `brokenEndPortal` had been written and never called; this is
 * its home.
 */
export function buildEndRuin(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.endRuin.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.endRuin.footprint);
  pad(world, rect(cx - 38, cz - 38, cx + 38, cz + 38), level, P.endStone, P.obsidian);
  const rng = new Rng(0x3ed0);

  // The plaza's outer rim stays in the realm's own black rock, so the end stone
  // reads as an island of End material dropped into the darkness rather than a
  // light platform sitting on it.
  for (let i = 0; i < 120; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = 26 + rng.next() * 12;
    const px = cx + Math.round(Math.cos(a) * r);
    const pz = cz + Math.round(Math.sin(a) * r);
    world.set(px, level, pz, rng.chance(0.5) ? P.obsidian : P.blackstone);
  }

  // The plaza: rings of end stone brick and purpur, cracked and gapped.
  world.disc(cx, cz, 24, level + 1, P.endStoneBricks);
  world.disc(cx, cz, 18, level + 2, P.endStone);
  for (let i = 0; i < 26; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = 6 + rng.next() * 18;
    const px = cx + Math.round(Math.cos(a) * r);
    const pz = cz + Math.round(Math.sin(a) * r);
    world.set(px, level + 2, pz, rng.chance(0.4) ? P.purpurBlock : P.purpurPillar);
  }
  world.ring(cx, cz, 24, level + 1, P.obsidian);

  // Obsidian pillars with end-rod crowns, in the End's own style.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(a) * 27);
    const pz = cz + Math.round(Math.sin(a) * 27);
    const h = 9 + (i % 3) * 4;
    world.column(px, pz, level + 1, level + h, P.obsidian);
    world.set(px, level + h + 1, pz, P.purpurPillar);
    world.set(px, level + h + 2, pz, P.endRod);
    if (i % 2 === 0) world.set(px, level + 1, pz + 1, P.cryingObsidian);
  }

  // Four shattered end portals - the ring shape built whole at the middle.
  world.disc(cx, cz, 5, level + 2, P.purpurBlock);
  brokenEndPortal(world, cx, level + 3, cz);
  brokenEndPortal(world, cx - 21, level + 2, cz + 19);
  brokenEndPortal(world, cx + 23, level + 2, cz - 17);
  brokenEndPortal(world, cx + 13, level + 2, cz + 23);

  // Ruined purpur walls, statues, and a shard of the End overhead.
  for (let i = 0; i < 30; i++) {
    const x = cx - 34 + rng.int(0, 68);
    const z = cz - 34 + rng.int(0, 68);
    if (Math.hypot(x - cx, z - cz) < 20) continue;
    const h = rng.int(1, 6);
    world.column(x, z, level + 1, level + h, rng.chance(0.5) ? P.endStoneBricks : P.purpurBlock);
    if (rng.chance(0.3)) world.set(x, level + h + 1, z, P.cryingObsidian);
  }
  world.disc(cx, cz, 11, level + 24, P.obsidian);
  world.disc(cx, cz, 7, level + 23, P.endStoneBricks);
  world.column(cx, cz, level + 25, level + 29, P.purpurPillar);
  world.set(cx, level + 30, cz, P.endRod);
  for (const sx of [-8, 8]) {
    for (const sz of [-8, 8]) {
      world.set(cx + sx, level + 23, cz + sz, P.cryingObsidian);
    }
  }

  // The way in: an archway off the road, flanked by statues.
  gatehouse(world, cx, cz + 30, level, style, 2, { height: 8 });
  for (let i = 0; i < 4; i++) {
    statue(world, cx - 12 + i * 8, cz + 34, level, 1, style);
  }
}

// ---------------------------------------------------------------------------
// 14. The Nether Portal Lobby (twenty portals)
// ---------------------------------------------------------------------------

export function buildPortalLobby(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.portalLobby.center;
  const style = DEEPSLATE_STYLE;
  const level = areaGround(world, LANDMARKS.portalLobby.footprint);
  pad(world, rect(cx - 24, cz - 22, cx + 24, cz + 22), level, P.polishedDeepslate, P.deepslate);

  const hall: RectRegion = rect(cx - 22, cz - 18, cx + 22, cz + 18);
  world.fill(hall.x1, level, hall.z1, hall.x2, level, hall.z2, P.blackConcrete);
  world.rectWalls(hall.x1, hall.z1, hall.x2, hall.z2, level + 1, level + 14, style.wall);
  for (let x = hall.x1; x <= hall.x2; x++) {
    if ((x & 1) === 0) world.set(x, level + 14, hall.z1, style.trim);
    if ((x & 1) === 0) world.set(x, level + 14, hall.z2, style.trim);
  }
  world.fill(hall.x1 + 1, level + 14, hall.z1 + 1, hall.x2 - 1, level + 14, hall.z2 - 1, P.deepslateTiles);
  // Leave a slot of sky above the middle so the portals read from a distance.
  world.fill(cx - 8, level + 8, cz - 8, cx + 8, level + 15, cz + 8, AIR);

  // Twenty portal frames: two colonnades of ten, with lamp posts between.
  let placed = 0;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 10; i++) {
      const px = cx - 19 + i * 4;
      const pz = row === 0 ? cz - 11 : cz + 11;
      portalFrame(world, px, level + 1, pz, true);
      placed++;
    }
  }
  // The remaining frames face the aisles.
  for (let i = 0; i < 4 && placed < 20; i++) {
    portalFrame(world, cx - 20, level + 1, cz - 6 + i * 4, false);
    placed++;
  }
  for (let i = 0; i < 2 && placed < 20; i++) {
    portalFrame(world, cx + 20, level + 1, cz - 2 + i * 4, false);
    placed++;
  }
  for (let i = 0; i < 6; i++) {
    lampPost(world, cx - 20 + i * 8, cz, level + 1, style.light, 4);
  }
  // Soul Keeper guard posts flanking the door, glazed in their house green.
  for (const sz of [-16, 16]) {
    tower(world, cx, cz + sz, 4, level, 14, style, { round: true, crown: true });
    greenGlazing(world, cx, cz + sz, 4, level + 5);
    greenGlazing(world, cx, cz + sz, 4, level + 11);
  }
}

// ---------------------------------------------------------------------------

export function buildAllAreas(world: World): void {
  buildBreach(world);
  buildCenter(world);
  buildFields(world);
  buildCitadel(world);
  buildVoidCastles(world);
  buildGraveyard(world);
  buildRuins(world);
  buildMazeValley(world);
  buildVillage(world);
  buildFrostPocket(world);
  buildTomb(world);
  buildAshenReaches(world);
  buildRuinedCastle(world);
  buildPortalLobby(world);
  buildGlassworks(world);
  buildPortalField(world);
  buildEndRuin(world);
}
