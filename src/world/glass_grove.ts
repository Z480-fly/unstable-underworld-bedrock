/**
 * The Glass Grove: the one place in the realm where the glazing is grown
 * rather than built.
 *
 * The reference screenshots show a colossal dark tree whose crown is shot
 * through with stained glass, an eye set into its bole, lesser trees of the
 * same kind around it, and a hall whose walls are mosaic from top to bottom.
 * Canon calls the Soul Keepers the people who made the glazing, so this is
 * their ground: the only landmark in the realm where the trees themselves are
 * made of it.
 */
import { P, type BlockState } from "./blocks.ts";
import { LANDMARKS, type RectRegion } from "./layout.ts";
import { Rng } from "./noise.ts";
import { BLACKSTONE_STYLE, areaGround, pad } from "./structures.ts";
import {
  glazedHall,
  glassMosaic,
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

export function buildGlassGrove(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.glassGrove.center;
  const level = areaGround(world, LANDMARKS.glassGrove.footprint);
  pad(world, rect(cx - 44, cz - 44, cx + 44, cz + 44), level, P.coarseDirt, P.dirt);
  const rng = new Rng(0x61055);

  // --- the plaza ------------------------------------------------------------
  // A dark stone apron under the great tree, ringed with the canon green, so
  // the tree reads as standing on something rather than growing out of dirt.
  world.disc(cx, cz, 20, level, P.polishedBlackstone);
  world.ring(cx, cz, 20, level, P.greenGlass);
  world.ring(cx, cz, 21, level, P.polishedDeepslate);
  for (let dz = -19; dz <= 19; dz++) {
    for (let dx = -19; dx <= 19; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > 12 || d < 6) continue;
      if ((dx * 7 + dz * 11) % 5 !== 0) continue;
      world.set(cx + dx, level + 1, cz + dz, d > 15 ? P.greenGlass : P.limeGlass);
    }
  }
  // The compass eye set into the apron, pointing back down the approach road.
  for (let dz = -5; dz <= 5; dz++) {
    for (let dx = -5; dx <= 5; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > 5) continue;
      const block: BlockState =
        d < 1 ? P.blackGlass : d < 2 ? P.greenGlass : d < 3.2 ? P.cyanGlass : d < 4.4 ? P.limeGlass : P.greenGlass;
      world.set(cx + dx, level + 1, cz + dz, block);
    }
  }
  world.set(cx, level + 1, cz, P.seaLantern);

  // --- the great tree -------------------------------------------------------
  glassTree(world, cx, cz, level, {
    height: 46,
    trunkRadius: 6,
    canopyRadius: 24,
    canopyLayers: 13,
    glassiness: 0.3,
    glasses: VIVID_PRISM,
    seed: 0x9a11,
    eyeAt: true,
  });

  // --- lesser trees ---------------------------------------------------------
  // A ring of smaller glass trees, each with its own seed so no two crowns
  // repeat, alternating loud and canon-green the way the reference does.
  const lesser: Array<{ dx: number; dz: number; scale: number; green: boolean }> = [
    { dx: -30, dz: -26, scale: 0.62, green: true },
    { dx: 28, dz: -28, scale: 0.7, green: false },
    { dx: -34, dz: 18, scale: 0.55, green: false },
    { dx: 33, dz: 16, scale: 0.66, green: true },
    { dx: -12, dz: -36, scale: 0.5, green: false },
    { dx: 14, dz: 34, scale: 0.58, green: true },
  ];
  for (const [i, t] of lesser.entries()) {
    const tx = cx + t.dx;
    const tz = cz + t.dz;
    const ground = world.surfaceAt(tx, tz);
    world.disc(tx, tz, 5, ground, P.polishedBlackstone);
    world.ring(tx, tz, 5, ground, t.green ? P.greenGlass : P.purpleGlass);
    glassTree(world, tx, tz, ground + 1, {
      height: Math.round(30 * t.scale),
      trunkRadius: Math.max(2, Math.round(4 * t.scale)),
      canopyRadius: Math.round(12 * t.scale),
      canopyLayers: 9,
      glassiness: t.green ? 0.24 : 0.34,
      glasses: t.green ? SOUL_GREEN : PRISM,
      seed: 0x9a11 + (i + 1) * 7919,
    });
    // A pillar and a lamp at the foot of each lesser tree, the way the
    // reference dots its plaza with drop-shaped markers.
    prismPillar(world, tx + 7, tz + 4, ground + 1, 6, t.green ? SOUL_GREEN : VIVID_PRISM, 0x31 + i);
    seaLanternPost(world, tx - 7, tz + 4, ground + 1, 3);
  }

  // --- the hall -------------------------------------------------------------
  // South of the tree, facing the approach: a blackstone hall glazed top to
  // bottom, with a great eye on the north face looking back at the grove.
  const hx = cx;
  const hz = cz + 34;
  const hallLevel = areaGround(world, rect(hx - 16, hz - 12, hx + 16, hz + 12));
  pad(world, rect(hx - 18, hz - 14, hx + 18, hz + 14), hallLevel, P.polishedBlackstone, P.blackstone);
  glazedHall(world, hx, hz, 14, 11, hallLevel, 16, BLACKSTONE_STYLE, PRISM, 0x5117);
  // A second, smaller hall west of the plaza, so the grove reads as a campus
  // rather than as one building with a tree behind it.
  const ax = cx - 40;
  const az = cz - 34;
  const annexLevel = areaGround(world, rect(ax - 12, az - 10, ax + 12, az + 10));
  pad(world, rect(ax - 14, az - 12, ax + 14, az + 12), annexLevel, P.polishedBlackstone, P.deepslate);
  glazedHall(world, ax, az, 10, 9, annexLevel, 12, BLACKSTONE_STYLE, SOUL_GREEN, 0x7331);

  // --- the lantern avenue ---------------------------------------------------
  // Sea-lantern posts marching from the grove's south gate up to the trunk, so
  // the approach is lit the whole way instead of only at the ends.
  for (let i = 0; i <= 8; i++) {
    const z = cz + 26 - i * 5;
    seaLanternPost(world, cx - 8, z, level, 4);
    seaLanternPost(world, cx + 8, z, level, 4);
    if (i % 2 === 0) {
      prismPillar(world, cx - 12, z, level, 5, SOUL_GREEN, 0x90 + i);
      prismPillar(world, cx + 12, z, level, 5, SOUL_GREEN, 0xa0 + i);
    }
  }

  // --- mosaic screens -------------------------------------------------------
  // Free-standing mosaic panels between the lesser trees: the reference hangs
  // big glazed sheets between its trees, and these catch the crown's light.
  for (const [dx, dz] of [[-22, -6], [22, -4], [-4, -24], [6, 24]] as const) {
    const px = cx + dx;
    const pz = cz + dz;
    const ground = world.surfaceAt(px, pz);
    for (let x = px - 4; x <= px + 4; x++) {
      world.column(x, pz, ground + 1, ground + 9, P.obsidian);
    }
    glassMosaic(world, px, ground + 6, pz, 4, 3, true, PRISM, P.obsidian, 0x400 + dx * 7 + dz);
    world.fill(px - 4, ground + 1, pz - 1, px + 4, ground + 1, pz + 1, P.polishedBlackstone);
    world.protect(px, pz, 5);
  }

  // --- ground detail --------------------------------------------------------
  // Soul soil and moss between the roots, plus a scatter of the glass chips the
  // Keepers leave lying about, so the grove floor is not bare.
  for (let i = 0; i < 90; i++) {
    const px = cx + rng.int(-42, 42);
    const pz = cz + rng.int(-42, 42);
    if (!world.inRealm(px, pz) || !world.isLand(px, pz) || world.isProtected(px, pz)) continue;
    const ground = world.surfaceAt(px, pz);
    const pick = rng.int(0, 5);
    if (pick === 0) world.set(px, ground, pz, P.soulSoil);
    else if (pick === 1) world.set(px, ground, pz, P.mossyStoneBrick);
    else if (pick === 2) world.set(px, ground, pz, P.cryingObsidian);
    else if (pick === 3) {
      // A chip of glazing dropped and half sunk into the dirt.
      world.set(px, ground, pz, PRISM[rng.int(0, PRISM.length - 1)]!);
    } else if (pick === 4) {
      for (let y = ground; y <= ground + 2; y++) world.set(px, y, pz, P.darkOakLog);
    }
  }
}
