/**
 * The glass sky canopy - the whole realm under one ceiling of glass.
 *
 * The reference's defining image is sheets of coloured glass stacked in the
 * sky with moss growing along every rim, seen from below. Until now that lived
 * in exactly one place: the Glass Cathedral hung a five-sheet cluster over its
 * own footprint, which is right for a landmark but wrong for a *sky*. You walk
 * out of the Cathedral and the ceiling ends at the edge of the arch, and the
 * rest of the Underworld is under flat teal nothing.
 *
 * So the canopy is built the way the reference reads: not one lid, but a drift
 * of overlapping sheets at mixed heights, thick where the realm is built up and
 * thin over the open plate, with gaps you can see the next layer through.
 *
 * Three decisions that are not obvious:
 *
 * 1. **Sheets, not a lid.** A single translucent sheet across 704x704 would
 *    be 495k columns of glass and would cost more than the entire rest of the
 *    world, then make the realm unplayable on a phone. Every sheet here is a
 *    bounded disc, they overlap, and the holes are load-bearing: the parallax
 *    between layers *is* the image. You should be able to look straight up
 *    through a gap and see teal, and that is what stops it reading as a ceiling.
 *
 * 2. **Height.** The band is y=92 to y=116. It started at y=100..y124, which
 *    clears every landmark, and it was wrong: at the lowest render distance -
 *    the setting a phone actually runs at - a ceiling eight blocks further up
 *    is the first thing that falls off the far end of the view, so the sky read
 *    as "hard to see" exactly where it was most supposed to be pretty. The band
 *    is eight blocks lower now, at the cost of drifting through the crowns of
 *    the glass trees and the Glassworks spires, which the reference does
 *    anyway - a sheet that passes behind a spire is what parallax looks like.
 *
 * 3. **It must not protect the ground.** `glassSky` protects the columns under
 *    a sheet by default, which is correct over a building and catastrophic
 *    here - it would switch off ruins, ground fractures and detail scatter
 *    across most of the plate. `protectGround: false` is load-bearing.
 */
import { P, type BlockState } from "./blocks.ts";
import { CONFIG } from "./config.ts";
import { hash2 } from "./noise.ts";
import { glassSky } from "./structures_glass.ts";
import type { World } from "./world.ts";

/**
 * Lowest a sheet is ever hung.
 *
 * The realm's ground tops out at y=91, so a sheet at 92 is one block above the
 * highest terrain in the world. That is the point: the band is set by what a
 * player can *see*, not by what clears the skyline.
 */
const SHEET_FLOOR = 92;
/** Highest a sheet's top layer may reach. The build ceiling is y=127. */
const SHEET_CEILING = 116;

/** The violet-to-cyan sheets the reference hangs, and the green set it accents with. */
const COOL: BlockState[] = [P.purpleGlass, P.blueGlass, P.lightBlueGlass, P.cyanGlass, P.magentaGlass];
const WARM: BlockState[] = [P.redGlass, P.orangeGlass, P.yellowGlass, P.pinkGlass, P.purpleGlass];
const SOUL: BlockState[] = [P.greenGlass, P.limeGlass, P.cyanGlass, P.purpleGlass];
const DEEP: BlockState[] = [P.purpleGlass, P.blueGlass, P.lightBlueGlass, P.cyanGlass, P.blackGlass];

/**
 * The drift, as a fixed list of sheets rather than anything sampled at build
 * time. Deterministic by construction, hand-placed so the realm reads as a
 * composed sky, and cheap to reason about: each entry is one disc of glass.
 *
 * `w` is a weight - it biases the radius, so a heavy sheet is a wide one. `hue`
 * picks the palette. Heights are spread across the legal band deliberately:
 * sheets at very different heights parallax against each other far better than
 * sheets at the same one, which is the whole point of stacking them.
 */
interface Sheet {
  x: number;
  z: number;
  y: number;
  radius: number;
  layers: number;
  layerGap: number;
  hue: number;
  w: number;
  /** Chance of green fronds trailing off this sheet's rim. */
  frond: number;
}

export type { Sheet };

/**
 * The drift, hand-placed so the realm reads as a composed sky rather than a
 * scatter.
 *
 * **Every stack must fit the band.** The band is y92..y116, which is 24
 * blocks, so `layers * layerGap` may not exceed `116 - y`. Four layers at gap 5
 * is 20 and fits; five is 25 and does not. `glassSky` clamps an overflowing
 * stack rather than failing, so an over-tall sheet does not announce itself -
 * it just quietly loses its top layer, and a fifth of the sky you designed goes
 * missing without a single warning. The `skyCanopyFitsTheBand` test exists
 * because that failure is invisible by construction.
 *
 * Heights are spread inside the band on purpose: sheets at very different
 * heights parallax against each other, sheets at the same one do not.
 */
export const SHEETS: readonly Sheet[] = [
  // --- the main plate ------------------------------------------------------
  { x: 0, z: 0, y: 92, radius: 112, layers: 4, layerGap: 5, hue: 0, w: 1.15, frond: 0.16 },
  { x: -78, z: 52, y: 93, radius: 86, layers: 4, layerGap: 5, hue: 3, w: 1, frond: 0.14 },
  { x: 86, z: -40, y: 95, radius: 94, layers: 4, layerGap: 5, hue: 1, w: 1.05, frond: 0.15 },
  { x: 24, z: 128, y: 92, radius: 90, layers: 4, layerGap: 6, hue: 2, w: 1.1, frond: 0.17 },
  { x: -120, z: -96, y: 94, radius: 78, layers: 3, layerGap: 7, hue: 3, w: 0.95, frond: 0.13 },
  { x: 132, z: 96, y: 92, radius: 82, layers: 4, layerGap: 6, hue: 0, w: 1, frond: 0.15 },
  { x: -40, z: -160, y: 95, radius: 74, layers: 3, layerGap: 7, hue: 3, w: 0.9, frond: 0.12 },
  { x: 62, z: -186, y: 93, radius: 70, layers: 4, layerGap: 5, hue: 2, w: 0.95, frond: 0.16 },
  { x: 168, z: 30, y: 95, radius: 66, layers: 3, layerGap: 7, hue: 1, w: 0.9, frond: 0.12 },
  { x: -196, z: 84, y: 93, radius: 72, layers: 4, layerGap: 5, hue: 0, w: 0.95, frond: 0.13 },
  { x: -8, z: -70, y: 96, radius: 78, layers: 3, layerGap: 6, hue: 1, w: 1, frond: 0.14 },

  // --- east and south: the Gate Field, the Glassworks, the Sunken City ------
  { x: 252, z: -116, y: 92, radius: 88, layers: 4, layerGap: 6, hue: 1, w: 1, frond: 0.13 },
  { x: 188, z: 226, y: 92, radius: 84, layers: 4, layerGap: 5, hue: 2, w: 1.05, frond: 0.18 },
  { x: 280, z: 290, y: 94, radius: 80, layers: 3, layerGap: 7, hue: 3, w: 1, frond: 0.14 },
  { x: 196, z: -16, y: 93, radius: 92, layers: 4, layerGap: 5, hue: 0, w: 1.1, frond: 0.15 },
  { x: -300, z: 300, y: 95, radius: 66, layers: 3, layerGap: 7, hue: 3, w: 0.85, frond: 0.11 },
  { x: 60, z: -232, y: 92, radius: 76, layers: 4, layerGap: 6, hue: 2, w: 0.95, frond: 0.17 },
  { x: 226, z: 120, y: 95, radius: 74, layers: 3, layerGap: 6, hue: 1, w: 0.95, frond: 0.13 },
  { x: 128, z: -238, y: 94, radius: 70, layers: 3, layerGap: 7, hue: 0, w: 0.9, frond: 0.12 },

  // --- the western dark, where the sky closes down -------------------------
  { x: -246, z: -170, y: 93, radius: 72, layers: 3, layerGap: 6, hue: 3, w: 0.9, frond: 0.09 },
  { x: -158, z: 140, y: 94, radius: 76, layers: 3, layerGap: 7, hue: 3, w: 0.95, frond: 0.1 },
  { x: -140, z: -180, y: 92, radius: 88, layers: 4, layerGap: 6, hue: 2, w: 1, frond: 0.14 },
  { x: -100, z: 30, y: 95, radius: 68, layers: 3, layerGap: 6, hue: 3, w: 0.85, frond: 0.1 },
  { x: -286, z: 62, y: 93, radius: 66, layers: 3, layerGap: 7, hue: 3, w: 0.85, frond: 0.09 },
  { x: -60, z: 232, y: 92, radius: 72, layers: 4, layerGap: 6, hue: 2, w: 0.95, frond: 0.14 },
];

const PALETTES: BlockState[][] = [COOL, WARM, SOUL, DEEP];

/**
 * Builds the canopy.
 *
 * Runs after every landmark so the sheets are the last word in the sky, and
 * after the terrain so a sheet never has to argue with a heightfield. It does
 * not care whether the ground under it is land, void or a building: the whole
 * point is that the sky is continuous and the ground underneath it is not.
 */
export function buildSkyCanopy(world: World): void {
  for (const [i, sheet] of SHEETS.entries()) {
    // Clamp the *base* into the legal band before handing it over. A sheet
    // that starts above the ceiling is dropped by glassSky entirely, which is
    // correct but silent; clamping here means the stack always fits and
    // `glassSky`'s own clamp is a backstop rather than the primary guard.
    const baseY = Math.max(SHEET_FLOOR, Math.min(sheet.y, SHEET_CEILING - sheet.layers * sheet.layerGap));
    const glasses = PALETTES[sheet.hue % PALETTES.length]!;
    glassSky(world, sheet.x, sheet.z, baseY, {
      layers: sheet.layers,
      radius: Math.round(sheet.radius * sheet.w),
      layerGap: sheet.layerGap,
      sheetThickness: 1,
      glasses,
      underGlass: [glasses[1] ?? P.purpleGlass, glasses[0] ?? P.blueGlass, glasses[2] ?? P.purpleGlass],
      frondChance: sheet.frond,
      seed: CONFIG.seed + 0x5c00 + i * 6151,
      // See the header: protecting the ground here would gut the detail pass
      // across most of the plate.
      protectGround: false,
      // The canopy's band is lower than the one the hand-placed landmark skies
      // were tuned against, so it has to say which ceiling it means.
      ceiling: SHEET_CEILING,
    });
  }
}

/**
 * How much of the plate has glass above it.
 *
 * Used by the tests, and worth having as a number rather than a vibe: the
 * canopy is the difference between "the sky exists" and "the sky exists and
 * you can walk out of the Cathedral and still be under it".
 */
export function canopyCoverage(world: World, step = 12): { covered: number; total: number } {
  let covered = 0;
  let total = 0;
  // Precompute a set of every column in the band that holds glass. Sampled
  // straight off the world this is 25 lookups per column over 2500 columns;
  // as a set it is one pass, and the coverage question becomes a cheap
  // neighbourhood test.
  const glass = new Set<string>();
  for (let z = -320; z <= 320; z++) {
    for (let x = -320; x <= 320; x++) {
      if (!world.inRealm(x, z)) continue;
      for (let y = SHEET_FLOOR; y <= SHEET_CEILING; y++) {
        const name = world.get(x, y, z)?.name;
        if (name && name.includes("stained_glass")) {
          glass.add(`${x},${z}`);
          break;
        }
      }
    }
  }
  for (let z = -300; z <= 300; z += step) {
    for (let x = -300; x <= 300; x += step) {
      if (!world.inRealm(x, z)) continue;
      total++;
      // "Covered" means there is glass overhead somewhere in the legal band -
      // not necessarily directly above this column, because that is the
      // parallax. A column with a sheet 20 blocks to the side still reads as
      // being under sky when you look up.
      let hit = false;
      for (let dx = -20; dx <= 20 && !hit; dx += 5) {
        for (let dz = -20; dz <= 20; dz += 5) {
          if (glass.has(`${x + dx},${z + dz}`)) {
            hit = true;
            break;
          }
        }
      }
      if (hit) covered++;
    }
  }
  return { covered, total };
}

/** The height band the canopy occupies, for the session notes and the inspector. */
export const CANOPY_BAND = { floor: SHEET_FLOOR, ceiling: SHEET_CEILING } as const;

/** Deterministic per-sheet hash, so callers can reason about a specific sheet. */
export function sheetAt(x: number, z: number): number {
  return hash2(x, z, CONFIG.seed + 0x5c00);
}
