/**
 * The Glass Cathedral and the layered sky above it.
 *
 * Two reference images drive this file. The first is a ruined gothic arch -
 * two fluted piers, a pointed opening, a crown of spires, and a green light
 * burning in the doorway. The second is a stack of huge violet and blue glass
 * sheets floating in the sky with moss growing along every rim, seen from
 * below: the Soul Keepers' glazing hung in the air itself rather than built
 * into a wall.
 *
 * Both are here because together they are the argument the rest of the map
 * was making badly: the glazing is not trim on the architecture, it *is* the
 * architecture. So the trees are glass too, and the ground is glass, and the
 * sky is glass.
 */
import { P } from "./blocks.ts";
import { LANDMARKS, type RectRegion } from "./layout.ts";
import { Rng } from "./noise.ts";
import { BLACKSTONE_STYLE, areaGround, pad } from "./structures.ts";
import {
  gothicArch,
  glazedHall,
  glassMosaic,
  glassSky,
  glassTree,
  prismPillar,
  seaLanternPost,
  PRISM,
  SOUL_GREEN,
  VIVID_PRISM,
} from "./structures_glass.ts";
import type { World } from "./world.ts";

function rect(x1: number, z1: number, x2: number, z2: number): RectRegion {
  return { kind: "rect", x1, z1, x2, z2 };
}

export function buildCathedral(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.cathedral.center;
  const level = areaGround(world, LANDMARKS.cathedral.footprint);
  const style = BLACKSTONE_STYLE;
  pad(world, rect(cx - 56, cz - 56, cx + 56, cz + 56), level, P.polishedBlackstone, P.deepslate);
  const rng = new Rng(0xca7ed2);

  // --- the nave floor -------------------------------------------------------
  // A glazed processional way running south out of the arch, so the approach
  // reads as a nave floor rather than as paving.
  for (let z = cz - 6; z <= cz + 46; z++) {
    for (let x = cx - 9; x <= cx + 9; x++) {
      const onWay = Math.abs(x - cx) <= 5;
      const block = onWay
        ? (x + z) % 6 === 0
          ? P.limeGlass
          : (x - z) % 6 === 0
            ? P.cyanGlass
            : P.greenGlass
        : Math.abs(x - cx) <= 8
          ? style.floor
          : P.glass;
      world.set(x, level, z, block);
    }
  }
  // Colonnade of prism pillars lining the nave.
  for (let i = 0; i < 7; i++) {
    const z = cz + 8 + i * 5;
    prismPillar(world, cx - 7, z, level + 1, 7, SOUL_GREEN, 0xc0 + i);
    prismPillar(world, cx + 7, z, level + 1, 7, SOUL_GREEN, 0xd0 + i);
  }

  // --- the arch -------------------------------------------------------------
  gothicArch(world, cx, cz - 22, level, 26, 13, style, VIVID_PRISM, 0xa2c4);

  // A second, smaller arch further back, so the ruin is a sequence rather than
  // a single gate - the reference shows one behind another down the nave.
  gothicArch(world, cx, cz - 52, level, 18, 9, style, SOUL_GREEN, 0xb3d5);

  // --- the cloister ---------------------------------------------------------
  // Glazed halls either side of the nave, so the cathedral is a complex.
  for (const side of [-1, 1]) {
    const hx = cx + side * 34;
    const hz = cz - 6;
    const hallLevel = areaGround(world, rect(hx - 12, hz - 10, hx + 12, hz + 10));
    pad(world, rect(hx - 14, hz - 12, hx + 14, hz + 12), hallLevel, P.polishedBlackstone, P.blackstone);
    glazedHall(world, hx, hz, 11, 9, hallLevel, 15, style, side < 0 ? VIVID_PRISM : PRISM, 0xe0 + side);
  }

  // --- the all-glass trees --------------------------------------------------
  // The grove's trees are glass; these repeat the idea at the cathedral so the
  // two landmarks read as one territory. All-glass crowns, no leaves at all.
  const trees: Array<{ dx: number; dz: number; scale: number; green: boolean }> = [
    { dx: -44, dz: 30, scale: 0.62, green: true },
    { dx: 44, dz: 26, scale: 0.58, green: false },
    { dx: -30, dz: 44, scale: 0.5, green: true },
    { dx: 28, dz: 42, scale: 0.66, green: false },
    { dx: -50, dz: -20, scale: 0.46, green: false },
    { dx: 50, dz: -18, scale: 0.54, green: true },
  ];
  for (const [i, t] of trees.entries()) {
    const tx = cx + t.dx;
    const tz = cz + t.dz;
    const ground = world.surfaceAt(tx, tz);
    world.disc(tx, tz, 6, ground, P.polishedBlackstone);
    world.ring(tx, tz, 6, ground, t.green ? P.greenGlass : P.purpleGlass);
    glassTree(world, tx, tz, ground + 1, {
      height: Math.round(34 * t.scale),
      trunkRadius: Math.max(2, Math.round(4 * t.scale)),
      canopyRadius: Math.round(14 * t.scale),
      canopyLayers: 10,
      allGlass: true,
      glasses: t.green ? SOUL_GREEN : VIVID_PRISM,
      seed: 0xf00d + (i + 1) * 6151,
    });
    seaLanternPost(world, tx + 8, tz + 2, ground + 1, 4);
  }

  // --- the layered sky ------------------------------------------------------
  // Five stacked sheets over the whole cathedral, hung high enough to walk
  // under and read as a ceiling of colour rather than as fog.
  // The first sheet hangs 30 blocks over the floor: high enough to walk under
  // and still read as a ceiling of colour. Hung any higher the 5-layer stack
  // runs into the y=127 ceiling and has to be clamped, which loses a sheet.
  glassSky(world, cx, cz, level + 30, {
    layers: 5,
    radius: 62,
    layerGap: 8,
    sheetThickness: 1,
    glasses: [P.purpleGlass, P.blueGlass, P.lightBlueGlass, P.cyanGlass, P.magentaGlass],
    underGlass: [P.purpleGlass, P.blueGlass, P.purpleGlass],
    frondChance: 0.14,
    seed: 0x5c1a,
  });
  // A second, smaller cluster of sheets off to one side, so the sky is not a
  // single symmetrical disc centred on the arch.
  glassSky(world, cx + 46, cz + 34, level + 28, {
    layers: 3,
    radius: 30,
    layerGap: 7,
    glasses: [P.greenGlass, P.limeGlass, P.cyanGlass, P.purpleGlass],
    underGlass: [P.greenGlass, P.cyanGlass, P.limeGlass],
    frondChance: 0.18,
    seed: 0x5c2b,
  });

  // --- ground detail --------------------------------------------------------
  for (let i = 0; i < 120; i++) {
    const px = cx + rng.int(-54, 54);
    const pz = cz + rng.int(-54, 54);
    if (!world.inRealm(px, pz) || !world.isLand(px, pz) || world.isProtected(px, pz)) continue;
    const ground = world.surfaceAt(px, pz);
    const pick = rng.int(0, 5);
    if (pick === 0) world.set(px, ground, pz, P.cryingObsidian);
    else if (pick === 1) world.set(px, ground, pz, PRISM[rng.int(0, PRISM.length - 1)]!);
    else if (pick === 2) world.set(px, ground, pz, P.mossyStoneBrick);
    else if (pick === 3) world.set(px, ground, pz, P.soulSoil);
    else if (pick === 4) {
      for (let y = ground; y <= ground + 3; y++) world.set(px, y, pz, P.blackstoneBricks);
    }
  }

  // Free-standing mosaic screens between the trees, catching the sky's colour.
  for (const [dx, dz] of [[-16, 34], [16, 32], [-38, 8], [38, 6]] as const) {
    const px = cx + dx;
    const pz = cz + dz;
    const ground = world.surfaceAt(px, pz);
    for (let x = px - 5; x <= px + 5; x++) world.column(x, pz, ground + 1, ground + 11, P.obsidian);
    glassMosaic(world, px, ground + 7, pz, 5, 3, true, VIVID_PRISM, P.obsidian, 0xf100 + dx * 5 + dz);
    world.fill(px - 5, ground + 1, pz - 1, px + 5, ground + 1, pz + 1, P.polishedBlackstone);
    world.protect(px, pz, 6);
  }
}
