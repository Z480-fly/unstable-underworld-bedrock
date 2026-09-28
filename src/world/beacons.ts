/**
 * Sky beacons: one lit column of colour over every landmark.
 *
 * The request was "every landmark, make a colour beacon, give each one its own
 * colour, so I can see it in the sky". The Underworld is a 704x704 plate under
 * a glass canopy at y92-116, and the only way to tell where you are from the
 * air was to read the terrain. That does not work here: the canopy is a sheet
 * of overlapping glass, the plate is nearly flat, and most of the landmarks are
 * the same grey-black stone. From a spire you could see the Glassworks or you
 * could see nothing.
 *
 * So every landmark gets a mast: a slender, banded, *coloured* glass column
 * that rises out of the top of the building and punches up through the canopy
 * to a netherite crown at y121 - above every sheet in the sky, so it is the one
 * thing in the world that is never behind glass.
 *
 * The crown is an actual **lit beacon block** standing on a real beacon
 * pyramid, with clear air above it: the request was for beacons *activated*,
 * which is a real vanilla thing and not a lookalike.
 *
 * This is worth spelling out because it is the one part of the build that is
 * not just geometry. A beacon's power is *recomputed by the game* from the
 * blocks underneath it every time the chunk loads - the `power_level` in the
 * palette is only a cache the game is free to overwrite. So a mast capped with
 * a 3x3 of netherite, with `power_level: 1` written into the subchunk, looks
 * lit in every tool that reads the file and produces **no beam at all** in the
 * game, because 3x3 scores zero: the minimum for level 1 is a complete 5x5.
 * The crown is therefore a genuine two-tier pyramid - 5x5 netherite over 3x3
 * iron - and the masts have a beam the moment the world loads, without waiting
 * for a player to go and feed it metal.
 *
 * Four decisions that are not obvious:
 *
 * 1. **It runs after the canopy, not before.** `buildSkyCanopy` is documented
 *    as "the last word in the sky" over the landmarks. If the beacons ran
 *    before it, a sheet would land on top of every mast and the whole point
 *    would be lost. So this pass is called *after* the canopy and a beacon is
 *    allowed to cut a hole through a sheet - which is also what a real mast
 *    standing under a glass roof would do.
 *
 * 2. **Every landmark gets a different *pair* of colours, not a different
 *    colour.** There are sixteen stained glasses and twenty-three landmarks,
 *    so "each one its own colour" cannot be satisfied by the hue alone. Each
 *    beacon is a `main` glass with an `accent` band: sixteen hues, each used
 *    with two or three different accents, and `beaconColoursAreUnique` asserts
 *    that no two landmarks share a pair. The collar is always `accent`, so the
 *    silhouette alone is still recognisable.
 *
 * 3. **The base is the building's own top, not the ground.** Anchoring at
 *    `surfaceAt(x, z) + 2` means a beacon on the Glassworks spire starts 40
 *    blocks higher than one on the village, which is right: the mast should
 *    read as *part of* the landmark, and a mast planted on the ground next to a
 *    tower would be shorter than the thing it is marking.
 */
import { P, type BlockState } from "./blocks.ts";
import { CONFIG } from "./config.ts";
import { LANDMARKS, type LandmarkId } from "./layout.ts";
import type { World } from "./world.ts";

/**
 * The top of the mast itself. The build ceiling is y=127 and the canopy's
 * highest sheet is y=116, so a crown at 121 is clear of the glass and still six
 * blocks inside the buffer.
 *
 * Nothing is placed *above* the crown: an active beacon draws its beam from
 * the block's own position upwards, and anything on top of it - the old
 * glowstone flame - would cut the beam off one block above the glass. That is
 * the whole reason this number moved down from 123.
 */
export const BEACON_CROWN_Y = 121;

/**
 * How many courses the crown's pyramid occupies below the beacon itself.
 *
 * This number is the whole reason the beams work, so it is worth being blunt
 * about what went wrong before it was 5.
 *
 * A beacon's power is **not** stored, it is *recomputed* by the game from the
 * blocks underneath it every time the chunk loads. The `power_level` written
 * into the palette is only a cache: if the pyramid underneath does not support
 * it, the game recomputes 0 and the block sits there grey and dead. A level-1
 * beacon needs a complete **5x5** layer of base material directly under it -
 * 3x3 scores nothing at all - which is why the first version of these masts
 * produced twenty-four perfectly lit-looking beacons and not one beam.
 *
 * So the collar is a real two-tier pyramid, exactly as the reference builds it:
 *
 *     crownY    the beacon, ringed by sea lanterns and accent panes
 *     crownY-1  3x3  iron      <- pyramid tier 2
 *     crownY-2  5x5  netherite <- pyramid tier 1, the base that makes it lit
 *     crownY-3  7x7  accent ring, decorative only
 *     crownY-4  5x5  netherite ring, decorative only
 *     crownY-5  3x3  netherite capital, carrying the overhang
 *
 * Only the two solid tiers are load-bearing and they are entirely valid base
 * material, because a single pane of glass in the middle of a layer is enough
 * to void the whole thing. The colour lives in the rings *below* the pyramid,
 * where it is decorative and cannot cost the mast its beam.
 */
export const BEACON_COLLAR = 5;

/**
 * Half-widths of the crown's five courses, top down: 3x3, 3x3, 5x5, 7x7, 5x5.
 *
 * Kept as data rather than three loops because the Purgatory office beacon
 * builds the same crown and the two have to agree - and because the order is
 * the entire point. Widening goes *downward*, and the two solid tiers (indices
 * 1 and 2) are the only ones the game ever looks at.
 */
export const BEACON_TIERS = [1, 1, 2, 3, 2] as const;

/** Shortest mast worth building. Below this the crown crowds the roofline. */
export const MIN_BEACON_HEIGHT = 8;

/** How far above the landmark's own top the mast starts. */
const BASE_CLEARANCE = 2;

/**
 * The mast is anchored to the landmark's own structure, and the scan stops at
 * the bottom of the canopy band.
 *
 * Beacons run *after* the canopy, so a naive "highest block in the column"
 * would find a sheet of sky glass and stand the whole mast on top of it - four
 * blocks of mast, in the wrong place, for every landmark.
 *
 * The scan ceiling is therefore 83, not 92. The canopy's lowest sheet is at
 * y=92, but `glassSky` hangs green fronds two to eight blocks *below* every
 * sheet's rim, so glass reaches down to y84; a scan that stopped at 91 found a
 * frond in all twenty-three landmark columns at once and anchored every mast
 * in the world to the sky. 83 is the lowest block any frond can reach.
 */
const ANCHOR_CEILING = 83;

/** The highest non-air block at or below `ceiling` in this column, or -1. */
function topSolidBelow(world: World, x: number, z: number, ceiling: number): number {
  for (let y = Math.min(ceiling, CONFIG.maxY - 1); y >= 0; y--) {
    const block = world.get(x, y, z);
    if (block && block.name !== "minecraft:air") return y;
  }
  return -1;
}

/** Every ninth course is a dark band, so the mast reads as built, not as a stick. */
const BAND_EVERY = 9;

/**
 * Two accent halos below the crown: the thing you actually see from a distance.
 *
 * Eight and twelve courses down, not four and eight. The pyramid now occupies
 * the five courses directly under the beacon, and a halo drawn inside it is
 * painted over by the tier above it - a ring of accent glass that costs twenty
 * four blocks per mast and is never once visible.
 */
const HALO_OFFSETS = [8, 12] as const;

export interface BeaconColours {
  /** The beacon's own colour. Its crown is always this. */
  main: BlockState;
  /** Bands and halos, so no two landmarks read the same. */
  accent: BlockState;
  /** Plain-language name of the pair, for the docs and the map tool. */
  label: string;
}

/**
 * One colour pair per landmark.
 *
 * Hand-assigned rather than generated, for the same reason the canopy sheets
 * are: a generated palette is a palette nobody chose. The `label` is what the
 * map tool and the session notes print, so it has to be a colour a person
 * would use to describe it.
 */
export const BEACON_COLOURS: Record<LandmarkId, BeaconColours> = {
  breach: { main: P.redGlass, accent: P.orangeGlass, label: "red over orange" },
  ruinedCastle: { main: P.orangeGlass, accent: P.yellowGlass, label: "orange over gold" },
  fields: { main: P.yellowGlass, accent: P.limeGlass, label: "gold over lime" },
  ashenReaches: { main: P.redGlass, accent: P.brownGlass, label: "ember red over brown" },
  center: { main: P.yellowGlass, accent: P.brownGlass, label: "gold over brown" },
  graveyard: { main: P.grayGlass, accent: P.blackGlass, label: "grey over black" },
  ruins: { main: P.lightGrayGlass, accent: P.grayGlass, label: "pale grey over grey" },
  mazeValley: { main: P.purpleGlass, accent: P.magentaGlass, label: "purple over magenta" },
  village: { main: P.brownGlass, accent: P.orangeGlass, label: "brown over orange" },
  frostPocket: { main: P.lightBlueGlass, accent: P.whiteGlass, label: "ice blue over white" },
  tomb: { main: P.blackGlass, accent: P.grayGlass, label: "black over grey" },
  dungeonChain: { main: P.magentaGlass, accent: P.pinkGlass, label: "magenta over pink" },
  citadel: { main: P.brownGlass, accent: P.limeGlass, label: "brown over lime" },
  portalLobby: { main: P.purpleGlass, accent: P.blueGlass, label: "purple over blue" },
  veilCastle: { main: P.whiteGlass, accent: P.lightBlueGlass, label: "white over ice blue" },
  glassworks: { main: P.greenGlass, accent: P.limeGlass, label: "green over lime" },
  portalField: { main: P.blueGlass, accent: P.cyanGlass, label: "blue over cyan" },
  splice: { main: P.cyanGlass, accent: P.lightBlueGlass, label: "cyan over ice blue" },
  cathedral: { main: P.blueGlass, accent: P.purpleGlass, label: "blue over purple" },
  glassGrove: { main: P.limeGlass, accent: P.greenGlass, label: "lime over green" },
  ancientCity: { main: P.cyanGlass, accent: P.greenGlass, label: "cyan over green" },
  wardenArena: { main: P.blackGlass, accent: P.cyanGlass, label: "black over cyan" },
  endRuin: { main: P.magentaGlass, accent: P.blackGlass, label: "magenta over black" },
};

export interface BeaconMast {
  id: LandmarkId;
  x: number;
  z: number;
  /** Lowest course of the mast. */
  baseY: number;
  /** The crown course - the mast body runs to `crownY - 1`. */
  crownY: number;
  colours: BeaconColours;
}

/**
 * Where a landmark's mast runs.
 *
 * Split out from the build so it can be asserted directly: the failure mode
 * this guards against is a mast that is *there* but buried - anchored below the
 * surface, or clamped down to nothing because the landmark's own top is already
 * at the crown - and both of those still produce stained glass at the column,
 * so counting glass would pass them.
 */
export function beaconMast(world: World, id: LandmarkId): BeaconMast {
  const { x, z } = LANDMARKS[id].center;
  // The landmark's own top, read out of the blocks rather than out of the
  // height map: `surfaceAt` is written by terrain and pads, so it reports the
  // ground a landmark was *padded* to and misses every tower above it. A mast
  // anchored to that would spear straight through the keep it is marking.
  const landmarkTop = Math.max(topSolidBelow(world, x, z, ANCHOR_CEILING), world.surfaceAt(x, z));
  const baseY = Math.max(landmarkTop + BASE_CLEARANCE, 60);
  // Push the crown up rather than down when the landmark is already tall: a
  // short mast is the one outcome that makes the beacon useless.
  const crownY = Math.max(BEACON_CROWN_Y, baseY + MIN_BEACON_HEIGHT);
  return { id, x, z, baseY, crownY, colours: BEACON_COLOURS[id] };
}

/** The block one course of a mast, given how far up it is. */
export function beaconCourse(colours: BeaconColours, course: number): BlockState {
  // Netherite for the dark bands, not obsidian: the bands are the part of the
  // mast that reads from the ground, and a mast that is worth flying to should
  // be worth looking at on the way up.
  if (course % BAND_EVERY === 0) return P.netheriteBlock;
  if (course % BAND_EVERY === 4) return colours.accent;
  return colours.main;
}

/**
 * Builds every mast.
 *
 * Run last, after the canopy - see the header. Returns the masts it built so
 * the build script can log the count.
 */
export function buildBeacons(world: World): BeaconMast[] {
  const built: BeaconMast[] = [];
  for (const id of Object.keys(LANDMARKS) as LandmarkId[]) {
    const mast = beaconMast(world, id);
    if (mast.crownY + 1 >= CONFIG.maxY) continue; // no room in the buffer
    buildBeacon(world, mast);
    built.push(mast);
  }
  return built;
}

/** One mast: banded glass on a netherite spine, two accent halos, a lit crown. */
export function buildBeacon(world: World, mast: BeaconMast): void {
  const { x, z, baseY, crownY, colours } = mast;

  // The shaft stops short of the crown: the courses above this one are the
  // pyramid, and a course of mast glass poking out through the middle of a
  // 5x5 base is the one block you can see the beam failing to start above.
  for (let y = baseY; y <= crownY - BEACON_TIERS.length; y++) {
    world.set(x, y, z, beaconCourse(colours, y - baseY));
  }

  // Halos: a plus of accent glass floating clear of the shaft, so the beacon
  // has a silhouette from ground level as well as from the air. They sit below
  // the pyramid's shoulder, because a halo drawn into the 7x7 ring is a halo
  // nobody can see.
  for (const offset of HALO_OFFSETS) {
    const y = crownY - offset;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      world.set(x + dx, y, z + dz, colours.accent);
    }
  }

  // The crown. Two solid tiers of base material, then the decoration, then the
  // beacon on top with clear air above it.
  //
  //   crownY-5  5x5 ring        decorative
  //   crownY-4  7x7 ring        decorative, the mast's colour shoulder
  //   crownY-3  5x5 netherite   PYRAMID BASE - this is what lights it
  //   crownY-2  3x3 iron        PYRAMID TIER 2
  //   crownY-1  the beacon's neighbours
  //   crownY    the beacon
  //
  // The two load-bearing tiers are drawn as solid squares rather than rings, and
  // they are solid *only* valid base material. A ring would leave holes the
  // size of the mast shaft in the middle of the base, and the game counts a
  // pyramid with a hole in it as no pyramid at all. The accent is confined to
  // the two courses *below* the base for the same reason: painted onto the base
  // itself it would void the pyramid, which is precisely the bug this file was
  // rewritten to fix.
  for (const [i, half] of BEACON_TIERS.entries()) {
    const y = crownY - i;
    for (let dz = -half; dz <= half; dz++) {
      for (let dx = -half; dx <= half; dx++) {
        const decorative = i >= 3;
        const edge = Math.max(Math.abs(dx), Math.abs(dz)) === half;
        world.set(
          x + dx,
          y,
          z + dz,
          decorative && edge ? colours.accent : i === 1 ? P.ironBlock : P.netheriteBlock,
        );
      }
    }
  }

  // The beacon's own course: the lit block dead centre, four sea lanterns on
  // the corners and four accent panes on the edge midpoints. The beam starts at
  // the beacon and goes up, so the course above the crown is left as air.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const corner = Math.abs(dx) + Math.abs(dz) === 2;
      world.set(
        x + dx,
        crownY,
        z + dz,
        dx === 0 && dz === 0 ? P.litBeacon : corner ? P.seaLantern : colours.accent,
      );
    }
  }

  // Protect the single column so the detail pass cannot scatter debris up a
  // 60-block shaft. Radius 0 is deliberate: a wider protect would switch off
  // detail on the roof the mast is standing on.
  world.protect(x, z, 0);
}
