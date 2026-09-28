import { describe, expect, test } from "bun:test";
import { AIR, P } from "./blocks.ts";
import { CONFIG } from "./config.ts";
import { LANDMARKS } from "./layout.ts";
import { canopyCoverage, CANOPY_BAND, SHEETS as CANOPY_SHEETS } from "./sky_canopy.ts";
import { beaconMast, BEACON_COLOURS } from "./beacons.ts";
import { buildSceneWorld } from "./scene.ts";
import type { World } from "./world.ts";

/** The full generation pipeline, in the order build.ts runs it. */
function generateWorld(): World {
  return buildSceneWorld().world;
}

describe("the sky canopy", () => {
  test("glass hangs over the whole realm, not just the Cathedral", () => {
    const world = generateWorld();
    const { covered, total } = canopyCoverage(world, 24);
    expect(total).toBeGreaterThan(0);
    expect(covered / total, "the canopy should cover most of the plate").toBeGreaterThan(0.8);
    expect(covered / total, "the canopy must stay a canopy, not become a lid").toBeLessThan(0.99);
  });

  test("every sheet is inside the legal band and clear of the ceiling", () => {
    const world = generateWorld();
    const overflowing = CANOPY_SHEETS.filter((s) => s.y + s.layers * s.layerGap > CANOPY_BAND.ceiling);
    expect(
      overflowing.map((s) => `${s.x},${s.z} (top y${s.y + s.layers * s.layerGap})`),
      "no sheet's stack may overflow the band, or glassSky silently truncates it",
    ).toEqual([]);
    const belowBand = CANOPY_SHEETS.filter((s) => s.y < CANOPY_BAND.floor);
    expect(belowBand, "no sheet may hang below the canopy band").toEqual([]);

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
    expect(CANOPY_BAND.floor, "the canopy should start just above the highest terrain").toBeLessThanOrEqual(96);
    expect(CANOPY_BAND.ceiling, "the band should still clear the build ceiling").toBeLessThanOrEqual(CONFIG.maxY - 8);
    const low = CANOPY_SHEETS.filter((s) => s.y <= CANOPY_BAND.floor + 4).length;
    expect(
      low,
      "most sheets should hang in the bottom of the band, not drift up out of sight",
    ).toBeGreaterThan(CANOPY_SHEETS.length / 2);
  });

  test("the canopy did not protect the ground and kill the detail pass", () => {
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
    const west = { x1: cx - 22, z1: cz - 26, x2: cx - 18, z2: cz + 26 };
    const east = { x1: cx + 18, z1: cz - 26, x2: cx + 22, z2: cz + 26 };
    const tables = (name: string): number =>
      countBlock(world, name, west.x1, west.z1, west.x2, west.z2)
      + countBlock(world, name, east.x1, east.z1, east.x2, east.z2);

    expect(tables(P.portal.name), "each split table should have kept its portal slice").toBe(10);
    expect(tables(P.craftingTable.name), "the Splice should carry its split table benches")
      .toBeGreaterThanOrEqual(8);
  });

  test("the Portal Field's seam, pillars and windows all produced geometry", () => {
    const world = generateWorld();
    const { x: cx, z: cz } = LANDMARKS.portalField.center;
    expect(
      countBlock(world, P.portal.name, cx - 33, cz - 34, cx + 33, cz - 32),
      "the north ribbon should run the full width of the field",
    ).toBeGreaterThanOrEqual(60);
    expect(
      countBlock(world, P.portal.name, cx - 33, cz + 26, cx + 33, cz + 28),
      "the south ribbon should run the full width of the field",
    ).toBeGreaterThanOrEqual(60);
    const westStumps = countBlock(world, P.deepslateBricks.name, cx - 33, cz - 24, cx - 27, cz - 16);
    expect(westStumps, "the standing portal pillars should still be built").toBeGreaterThanOrEqual(20);
    const glass = countBlock(world, P.purpleGlass.name, cx - 36, cz - 10, cx - 30, cz + 2)
      + countBlock(world, P.purpleGlass.name, cx + 30, cz - 2, cx + 36, cz + 10);
    expect(glass, "the sheared void windows should still be glazed").toBeGreaterThanOrEqual(4);
  });
});

/**
 * Ground-level colour beacons at the centre of every landmark.
 */
describe("the ground beacons", () => {
  test("every landmark has one, and each has a colour", () => {
    expect(
      Object.keys(BEACON_COLOURS).sort(),
      "every landmark needs a beacon colour, and no others",
    ).toEqual(Object.keys(LANDMARKS).sort());

    for (const [id, colours] of Object.entries(BEACON_COLOURS)) {
      expect(colours.label, `${id} has no colour label`).toBeTruthy();
      expect(colours.glass.name, `${id} has no glass colour`).toContain("stained_glass");
    }
  });

  test("each beacon sits on a 5x5 netherite base at ground level", () => {
    const world = generateWorld();
    for (const id of Object.keys(LANDMARKS) as Array<keyof typeof LANDMARKS>) {
      const mast = beaconMast(world, id);
      const colours = BEACON_COLOURS[id];

      // Real activated beacon.
      const crown = world.get(mast.x, mast.beaconY, mast.z);
      expect(crown?.name, `${id}'s crown should be a beacon block`).toBe(P.litBeacon.name);
      expect(crown?.states?.power_level, `${id}'s beacon is not lit`).toBeGreaterThan(0);

      // Solid 5x5 netherite under it.
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          expect(
            world.get(mast.x + dx, mast.baseY, mast.z + dz)?.name,
            `${id}'s beacon has no netherite base under it`,
          ).toBe(P.netheriteBlock.name);
        }
      }

      // Lanterns on corners, coloured glass on edges.
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        expect(world.get(mast.x + dx, mast.beaconY, mast.z + dz)?.name, `${id} has no lanterns`).toBe(P.seaLantern.name);
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        expect(
          world.get(mast.x + dx, mast.beaconY, mast.z + dz)?.name,
          `${id} is missing its colour glass`,
        ).toBe(colours.glass.name);
      }

      // On the ground, not in the sky.
      expect(mast.baseY, `${id} is floating in the sky`).toBeLessThan(CANOPY_BAND.floor);
    }
  });

  test("NEGATIVE: nothing stands on a beacon, and air is clear above for the beam", () => {
    const world = generateWorld();
    const capped: string[] = [];
    for (const id of Object.keys(LANDMARKS) as Array<keyof typeof LANDMARKS>) {
      const mast = beaconMast(world, id);
      for (let y = mast.beaconY + 1; y < Math.min(mast.beaconY + 30, CONFIG.maxY); y++) {
        const name = world.get(mast.x, y, mast.z)?.name;
        if (name && name !== AIR.name) {
          capped.push(`${id} is capped at y${y} by ${name}`);
          break;
        }
      }
    }
    expect(capped, `beacon beams blocked: ${capped.join("; ")}`).toEqual([]);
  });
});
