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
 * The crown is an actual **lit beacon block**, on a netherite base, with clear
 * air above it: the request was for beacons *activated*, which is a real
 * vanilla thing and not a lookalike. A beacon's power comes from the block
 * under it - and netherite is one of the five pyramid materials - so the
 * 3x3 netherite collar is not decoration, it is what makes the beam render.
 * Because the state is written into the subchunk, the beam is there the moment
 * the world loads rather than waiting for a player to feed it metal.
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
 * Courses of 3x3 netherite under the beacon block.
 *
 * Netherite is one of the five beacon base materials, so this collar is not
 * decoration: it is the block that makes the crown *lit* instead of a dead grey
 * one. The upper course is inset with accent glass on its four edge midpoints
 * so the collar is not a grey lump from the ground.
 */
export const BEACON_COLLAR = 2;

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

/** Two accent halos near the crown: the thing you actually see from a distance. */
const HALO_OFFSETS = [4, 8] as const;

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

  // The shaft stops two courses short of the crown: those two are the collar
  // the beacon stands on, and a course of mast glass poking out of the middle
  // of the collar would be the one block you can see the beam failing to start
  // above.
  for (let y = baseY; y < crownY - BEACON_COLLAR; y++) {
    world.set(x, y, z, beaconCourse(colours, y - baseY));
  }

  // Halos: a plus of accent glass floating clear of the shaft, so the beacon
  // has a silhouette from ground level as well as from the air. They are only
  // two courses of four blocks each, which is nothing against a 700x700 world.
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

  // The crown, from the top down: the lit beacon itself, a ring of sea lanterns
  // on the corners of the course below it, then the netherite collar it stands
  // on. The beam starts at the beacon and goes up, so the one course above the
  // crown is deliberately left as air.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const corner = Math.abs(dx) + Math.abs(dz) === 2;
      const edge = !corner && (dx === 0 || dz === 0);
      const middle = dx === 0 && dz === 0;
      // crownY: the beacon, ringed by four sea lanterns and four accent panes.
      world.set(
        x + dx,
        crownY,
        z + dz,
        middle ? P.litBeacon : corner ? P.seaLantern : colours.accent,
      );
      // crownY-1: netherite, with the four edge midpoints in the accent glass.
      world.set(x + dx, crownY - 1, z + dz, edge ? colours.accent : P.netheriteBlock);
      // crownY-2: solid netherite. This course is the beacon's base, and the
      // only reason the crown is lit at all.
      world.set(x + dx, crownY - 2, z + dz, P.netheriteBlock);
    }
  }

  // Protect the single column so the detail pass cannot scatter debris up a
  // 60-block shaft. Radius 0 is deliberate: a wider protect would switch off
  // detail on the roof the mast is standing on.
  world.protect(x, z, 0);
}
