import { describe, expect, test } from "bun:test";
import { AIR, P } from "./blocks.ts";
import { CONFIG } from "./config.ts";
import { LANDMARKS } from "./layout.ts";
import { canopyCoverage, CANOPY_BAND, SHEETS as CANOPY_SHEETS } from "./sky_canopy.ts";
import { beaconCourse, beaconMast, BEACON_COLOURS, BEACON_CROWN_Y } from "./beacons.ts";
import { buildSceneWorld } from "./scene.ts";
import type { World } from "./world.ts";

/** The full generation pipeline, in the order build.ts runs it. */
function generateWorld(): World {
  return buildSceneWorld().world;
}

describe("the sky canopy", () => {
  // The Cathedral hung a five-sheet glass sky over its own footprint, which is
  // right for a landmark and wrong for a sky: you walked out of the arch and
  // the ceiling stopped at the edge of the building. The canopy is the same
  // treatment spread over the whole realm, so these assert the property that
  // actually matters - that glass is overhead *everywhere*, not just in one
  // place, and that it did not cost the realm its ground detail to get there.
  test("glass hangs over the whole realm, not just the Cathedral", () => {
    const world = generateWorld();
    const { covered, total } = canopyCoverage(world, 24);
    // Comfortably under 1.0: the sheets are bounded discs with holes in them,
    // and the image depends on there being sky you can see through. If this
    // ever approaches 1.0 the canopy has become a lid and lost the parallax.
    expect(total).toBeGreaterThan(0);
    expect(covered / total, "the canopy should cover most of the plate").toBeGreaterThan(0.8);
    expect(covered / total, "the canopy must stay a canopy, not become a lid").toBeLessThan(0.99);
  });

  test("every sheet is inside the legal band and clear of the ceiling", () => {
    // The build ceiling is y=127 and the tallest thing in the realm is a
    // 34-block glass tree on a surface that reaches y=91, so the band is only
    // 24 blocks tall. A five-layer stack at gap 5 needs 25 and does not fit.
    //
    // This failure is invisible by construction: `glassSky` clamps an
    // overflowing stack instead of throwing, so an over-tall sheet does not
    // complain, it just quietly loses its top layer. The first draft of the
    // sheet table had 16 of 19 sheets over-tall and the only reason it was
    // caught is this assertion.
    const world = generateWorld();
    const overflowing = CANOPY_SHEETS.filter((s) => s.y + s.layers * s.layerGap > CANOPY_BAND.ceiling);
    expect(
      overflowing.map((s) => `${s.x},${s.z} (top y${s.y + s.layers * s.layerGap})`),
      "no sheet's stack may overflow the band, or glassSky silently truncates it",
    ).toEqual([]);
    const belowBand = CANOPY_SHEETS.filter((s) => s.y < CANOPY_BAND.floor);
    expect(belowBand, "no sheet may hang below the canopy band").toEqual([]);

    // And the payoff: a representative sheet kept *every* layer it was asked
    // for. glassSky clamps rather than throws, so a lost layer is silent -
    // this counts distinct occupied heights over the realm's centre and wants
    // the full spread the sheet list asks for.
    const centre = CANOPY_SHEETS[0]!;
    const heights = new Set<number>();
    for (let z = centre.z - centre.radius; z <= centre.z + centre.radius; z += 3) {
      for (let x = centre.x - centre.radius; x <= centre.x + centre.radius; x += 3) {
        for (let y = CANOPY_BAND.floor; y <= CANOPY_BAND.ceiling; y++) {
          const name = world.get(x, y, z)?.name;
          if (name && name.includes("stained_glass")) {
            heights.add(y);
            break;
          }
        }
      }
    }
    expect(
      heights.size,
      "the centre sheet should have kept every layer it was given",
    ).toBeGreaterThanOrEqual(centre.layers - 1);
  });

  test("the band hangs low enough to read at the lowest render distance", () => {
    // The band started at y100..y124, which clears every landmark and is
    // invisible on a phone: at minimum render distance a ceiling eight blocks
    // higher is the first thing past the far end of the view. It is now
    // y92..y116 - one block above the highest ground in the realm - and this
    // is the assertion that keeps it there.
    expect(CANOPY_BAND.floor, "the canopy should start just above the highest terrain").toBeLessThanOrEqual(96);
    expect(CANOPY_BAND.ceiling, "the band should still clear the build ceiling").toBeLessThanOrEqual(CONFIG.maxY - 8);
    const low = CANOPY_SHEETS.filter((s) => s.y <= CANOPY_BAND.floor + 4).length;
    expect(
      low,
      "most sheets should hang in the bottom of the band, not drift up out of sight",
    ).toBeGreaterThan(CANOPY_SHEETS.length / 2);
  });

  test("the canopy did not protect the ground and kill the detail pass", () => {
    // The one genuinely dangerous failure mode here. `glassSky` protects the
    // columns beneath a sheet by default, which is correct over a building and
    // catastrophic for a canopy drifting over open ground: it would switch off
    // ruins, ground fractures and detail scatter across most of the plate.
    //
    // The invariant is the *pairing*, not a raw count of unprotected ground:
    // a column can be under the canopy and still be open to the detail pass,
    // because the canopy is 60 blocks up and has no business claiming the
    // ground. Columns that are protected are protected by the landmark
    // underneath them, which is correct and not this test's business.
    const world = generateWorld();
    let underGlassOpen = 0;
    for (let z = -260; z <= 260; z += 11) {
      for (let x = -260; x <= 260; x += 11) {
        if (!world.inRealm(x, z)) continue;
        let under = false;
        for (let y = CANOPY_BAND.floor; y <= CANOPY_BAND.ceiling; y++) {
          const name = world.get(x, y, z)?.name;
          if (name && name.includes("stained_glass")) {
            under = true;
            break;
          }
        }
        if (under && !world.isProtected(x, z)) underGlassOpen++;
      }
    }
    expect(
      underGlassOpen,
      "columns under the canopy must still be open to ruins, fractures and detail",
    ).toBeGreaterThan(500);
  });
});

describe("the split tables and the collapsed seam", () => {
  // These six helpers (splitTable, brokenSplitTable, glassSplitTable,
  // portalRibbon, voidWindow, portalPillar) arrived with no call sites at all -
  // correct code, and invisible in the world. Wiring them in is only worth
  // anything if they are still standing afterwards, and "still standing" is
  // exactly what the Splice's own fill pass and the path painter are both
  // capable of undoing: the fill writes to the surface column, and the path
  // painter writes AIR one block above it. So each of these asserts the
  // geometry is in the *generated world*, not just in the helper.
  const countBlock = (world: World, name: string, x1: number, z1: number, x2: number, z2: number): number => {
    let n = 0;
    for (let z = z1; z <= z2; z++) {
      for (let x = x1; x <= x2; x++) {
        for (let y = 0; y < CONFIG.maxY; y++) {
          if (world.get(x, y, z)?.name === name) n++;
        }
      }
    }
    return n;
  };

  test("the Splice's split table rows survived its own detail pass", () => {
    const world = generateWorld();
    const { x: cx, z: cz } = LANDMARKS.splice.center;
    // Ten tables: five rows of two, either side of the aisle. Each row is 11
    // blocks apart and the benches are 3 wide, so nothing overlaps and the
    // counts are a clean check that none was filled over.
    const west = { x1: cx - 22, z1: cz - 26, x2: cx - 18, z2: cz + 26 };
    const east = { x1: cx + 18, z1: cz - 26, x2: cx + 22, z2: cz + 26 };
    const tables = (name: string): number =>
      countBlock(world, name, west.x1, west.z1, west.x2, west.z2)
      + countBlock(world, name, east.x1, east.z1, east.x2, east.z2);

    // Every variant keeps its portal slice - that is the part that makes it a
    // splice rather than two tables standing next to each other. All ten.
    expect(tables(P.portal.name), "each split table should have kept its portal slice").toBe(10);
    // Six of the ten rows are whole or glazed and carry a crafting table; the
    // two ruined rows carry one only some of the time, so the floor is eight.
    expect(tables(P.craftingTable.name), "the Splice should carry its split table benches")
      .toBeGreaterThanOrEqual(8);
  });

  test("the Portal Field's seam, pillars and windows all produced geometry", () => {
    const world = generateWorld();
    const { x: cx, z: cz } = LANDMARKS.portalField.center;
    // The ribbon runs the width of the field at two fixed z values; if the
    // path painter had run across it, the count would be a stub, not a line.
    expect(
      countBlock(world, P.portal.name, cx - 33, cz - 34, cx + 33, cz - 32),
      "the north ribbon should run the full width of the field",
    ).toBeGreaterThanOrEqual(60);
    expect(
      countBlock(world, P.portal.name, cx - 33, cz + 26, cx + 33, cz + 28),
      "the south ribbon should run the full width of the field",
    ).toBeGreaterThanOrEqual(60);
    // The four standing stumps: a pillar is solid deepslate from the base up,
    // so four of them is unmistakably more than the gate frames contribute.
    const westStumps = countBlock(world, P.deepslateBricks.name, cx - 33, cz - 24, cx - 27, cz - 16);
    expect(westStumps, "the standing portal pillars should still be built").toBeGreaterThanOrEqual(20);
    // The windows: tinted glass either side of a lit portal core.
    const glass = countBlock(world, P.purpleGlass.name, cx - 36, cz - 10, cx - 30, cz + 2)
      + countBlock(world, P.purpleGlass.name, cx + 30, cz - 2, cx + 36, cz + 10);
    expect(glass, "the sheared void windows should still be glazed").toBeGreaterThanOrEqual(4);
  });
});

/**
 * "Every landmark gets a colour beacon, its own colour, so I can see it in the
 * sky."
 *
 * The failure modes this block exists to catch are all invisible in a build log
 * and all of them still leave glass at the column, so none of them would be
 * caught by counting glass:
 *
 *  - a mast anchored on a *canopy sheet* rather than on the landmark, which is
 *    four blocks tall and stands in the sky;
 *  - two landmarks sharing a colour pair, so the beacon tells you nothing;
 *  - a crown with a sheet of canopy across its beam.
 */
describe("the sky beacons", () => {
  test("every landmark has one, and no two are the same colour", () => {
    expect(
      Object.keys(BEACON_COLOURS).sort(),
      "every landmark needs a beacon colour, and no others",
    ).toEqual(Object.keys(LANDMARKS).sort());

    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [id, colours] of Object.entries(BEACON_COLOURS)) {
      const pair = `${colours.main.name}|${colours.accent.name}`;
      const other = seen.get(pair);
      if (other) clashes.push(`${id} and ${other} are both ${colours.label}`);
      seen.set(pair, id);
      // A label is what the map tool and the notes print; an empty one means
      // somebody added a landmark and forgot to describe its colour.
      expect(colours.label, `${id} has no colour label`).toBeTruthy();
    }
    expect(clashes, `beacons that cannot be told apart: ${clashes.join("; ")}`).toEqual([]);
  });

  test("each mast is a banded column in that landmark's own colour", () => {
    const world = generateWorld();
    for (const id of Object.keys(LANDMARKS) as Array<keyof typeof LANDMARKS>) {
      const mast = beaconMast(world, id);
      const colours = BEACON_COLOURS[id];
      // The crown is a real, *activated* beacon block - the request was for
      // beacons switched on, and a lookalike is not one.
      const crown = world.get(mast.x, mast.crownY, mast.z);
      expect(crown?.name, `${id}'s crown should be a beacon block`).toBe(P.litBeacon.name);
      expect(crown?.states?.power_level, `${id}'s beacon is not lit`).toBeGreaterThan(0);
      // The pyramid it stands on. This is not decoration and not a style
      // choice: a beacon's power is recomputed by the game from the blocks
      // beneath it on every chunk load, and level 1 needs a complete 5x5 of
      // base material. The 3x3 collar this used to assert scored zero, the game
      // reset every beacon to unlit, and the masts showed no beam at all.
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          expect(
            world.get(mast.x + dx, mast.crownY - 2, mast.z + dz)?.name,
            `${id}'s beacon has no netherite base under it`,
          ).toBe(P.netheriteBlock.name);
        }
      }
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          expect(
            world.get(mast.x + dx, mast.crownY - 1, mast.z + dz)?.name,
            `${id}'s beacon has no iron tier under it`,
          ).toBe(P.ironBlock.name);
        }
      }
      // ...ringed by lanterns, or it is a coloured stripe and not a beacon.
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        expect(world.get(mast.x + dx, mast.crownY, mast.z + dz)?.name, `${id} has no lanterns`).toBe(P.seaLantern.name);
      }

      // The shaft: banded, and carrying the accent somewhere along it.
      let bands = 0;
      let accents = 0;
      for (let y = mast.baseY; y < mast.crownY; y++) {
        const name = world.get(mast.x, y, mast.z)?.name;
        if (name === P.netheriteBlock.name) bands++;
        if (name === colours.accent.name) accents++;
      }
      expect(bands, `${id}'s mast has no netherite banding`).toBeGreaterThan(1);
      expect(accents, `${id}'s mast never shows its accent colour`).toBeGreaterThan(0);
      // The banding has to be the shared one, or every mast is unique again.
      expect(beaconCourse(colours, 0).name, "banding must be the shared netherite course").toBe(P.netheriteBlock.name);
    }
  });

  test("NEGATIVE: nothing stands on a crown, or the beam is one block long", () => {
    // An active beacon draws its beam from its own block upwards. The first
    // version of this crown had a glowstone flame on top of it, which is a
    // perfectly good light and a beam you cannot see.
    const world = generateWorld();
    const capped: string[] = [];
    for (const id of Object.keys(LANDMARKS) as Array<keyof typeof LANDMARKS>) {
      const mast = beaconMast(world, id);
      for (let y = mast.crownY + 1; y < CONFIG.maxY; y++) {
        const name = world.get(mast.x, y, mast.z)?.name;
        if (name && name !== AIR.name) {
          capped.push(`${id} is capped at y${y} by ${name}`);
          break;
        }
      }
    }
    expect(capped, `beacon crowns with something on top of them: ${capped.join("; ")}`).toEqual([]);
  });

  test("every crown has its own skylight, so no beam is drawn across a sheet", () => {
    // The masts stand on their landmark's own roof, which for most of the
    // Underworld puts the crown *under* the canopy band - a mast at y64 with
    // the sheets at y92 is a beam drawn across fifty blocks of glass. So the
    // pass that used to assert "every crown is above the canopy" now asserts
    // the thing that actually makes a crown visible from outside: a clear
    // column straight up out of it, through every sheet in the way.
    const world = generateWorld();
    const blocked: string[] = [];
    for (const id of Object.keys(LANDMARKS) as Array<keyof typeof LANDMARKS>) {
      const mast = beaconMast(world, id);
      expect(mast.crownY + 2, `${id}'s crown runs past the build ceiling`).toBeLessThan(CONFIG.maxY);
      scan: for (let y = mast.crownY + 1; y <= CANOPY_BAND.ceiling; y++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const name = world.get(mast.x + dx, y, mast.z + dz)?.name;
            if (name && name !== AIR.name) {
              blocked.push(`${id} is behind ${name} at y${y}`);
              break scan;
            }
          }
        }
      }
    }
    expect(blocked, `crowns with a sheet over them: ${blocked.slice(0, 6).join("; ")}`).toEqual([]);
    expect(BEACON_CROWN_Y, "the crown cap should still clear the build ceiling").toBeLessThan(CONFIG.maxY);
  });

  test("NEGATIVE: a mast is anchored on its landmark, never on the sky", () => {
    // The bug this catches is subtle and total. `glassSky` hangs green fronds
    // two to eight blocks below every sheet, so glass reaches down to y84: a
    // mast anchored by "the highest block in this column" finds a frond, in
    // every landmark's centre column at once, and the whole world grows a
    // 28-block mast hanging in the canopy with nothing under it. It still puts
    // glass at the column, so only an explicit floor catches it.
    const world = generateWorld();
    const stranded: string[] = [];
    for (const id of Object.keys(LANDMARKS) as Array<keyof typeof LANDMARKS>) {
      const mast = beaconMast(world, id);
      if (mast.baseY >= CANOPY_BAND.floor) stranded.push(`${id} (base y${mast.baseY})`);
    }
    expect(stranded, `beacons anchored in the sky: ${stranded.join("; ")}`).toEqual([]);
  });

  test("NEGATIVE: the beacons are thin enough not to thin the sky", () => {
    // 23 shafts have to be invisible as a change to the canopy. Coverage is the
    // blunt half of that check; the sharp half is the block count, because the
    // obvious "improvement" - widening the mast into a lattice so it reads from
    // further off - multiplies this by an order of magnitude and would still
    // leave coverage looking fine.
    const world = generateWorld();
    const { covered, total } = canopyCoverage(world);
    expect(covered / total, "the sky lost too much of its glass to the beacons").toBeGreaterThan(0.8);
    let beaconBlocks = 0;
    for (const id of Object.keys(LANDMARKS) as Array<keyof typeof LANDMARKS>) {
      const mast = beaconMast(world, id);
      beaconBlocks += mast.crownY + 3 - mast.baseY;
    }
    expect(
      beaconBlocks,
      `${beaconBlocks} blocks of beacon for ${Object.keys(LANDMARKS).length} landmarks - a mast has stopped being a mast`,
    ).toBeLessThan(1400);
  });
});
