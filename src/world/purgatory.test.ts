/**
 * Tests for the Purgatory's lighting pass.
 *
 * The pass itself walks the vendored source world - 300,000 columns, ~40
 * seconds - which is far too slow to assert on in a unit test. What is worth
 * pinning down is the decision it makes per column, and that is pure: given a
 * column's occupancy, does it count as a dark room that needs a lamp? These
 * tests build synthetic columns, because the failure mode that matters (a
 * ceiling lamp buried in rock, or a light dropped into a room that already has
 * a torch in it) is exactly the kind you cannot see by looking at a build log.
 */
import { describe, expect, test } from "bun:test";
import {
  planColumn,
  planOfficeBeacon,
  PURGATORY_LIGHTING,
  PURGATORY_OFFICE_BEACON,
  type ColumnMask,
  type LightingPlan,
} from "./purgatory.ts";
import { P } from "./blocks.ts";

const WORDS = 8;

/** A column with solid blocks in [ranges] and light sources at `lights`. */
function column(solid: Array<[number, number]>, lights: number[] = []): ColumnMask {
  const mask: ColumnMask = { solid: new Uint32Array(WORDS), lit: new Uint32Array(WORDS) };
  for (const [lo, hi] of solid) {
    for (let y = lo; y <= hi; y++) {
      mask.solid[y >>> 5]! |= 1 << (y % 32);
    }
  }
  for (const y of lights) {
    mask.lit[y >>> 5]! |= 1 << (y % 32);
  }
  return mask;
}

const plan = (): LightingPlan => new Map();

describe("the Purgatory's room lighting", () => {
  test("hangs a lamp from the ceiling of an enclosed dark room", () => {
    // Solid floor at y=42, an 11-block air storey, a ceiling slab at y=54.
    // This is the storey the source build repeats every 35 blocks.
    const into = plan();
    planColumn(0, 0, column([[42, 42], [54, 60]]), into);
    expect(into.size, "an enclosed dark room should get a lamp").toBe(1);
    const [[key, block]] = [...into.entries()];
    // y is the low 8 bits, so the lamp must be flat against the ceiling
    expect(key % 256, "the lamp hangs at the top of the room, not in the floor").toBe(53);
    expect([P.glowstone.name, P.seaLantern.name]).toContain(block.name);
  });

  test("lights every storey of a column, not just the first", () => {
    // Two storeys in one column: the tower repeats, and lighting only the
    // ground floor would leave six black levels above it.
    const into = plan();
    // floor y=42, storey 43..53, slab y=54, storey 55..65, slab y=66..77
    planColumn(0, 0, column([[42, 42], [54, 54], [66, 77]]), into);
    expect(into.size, "both storeys should be lit").toBe(2);
    const ys = [...into.keys()].map((k) => k % 256).sort((a, b) => a - b);
    expect(ys, "one lamp flat under each ceiling").toEqual([53, 65]);
  });

  test("NEGATIVE: leaves a room alone if it already has a light in it", () => {
    // Any lighting in the source build is the author's. A pass that adds lamps
    // on top of it is the one way this could make the Purgatory worse.
    const into = plan();
    planColumn(0, 0, column([[42, 42], [54, 60]], [50]), into);
    expect(into.size, "an already-lit room must be left alone").toBe(0);
  });

  test("NEGATIVE: never lights open air", () => {
    // Air with no ceiling is the sky, not a room. Burying a lamp in it would
    // hang a glowing block in mid-air over the landscape.
    const into = plan();
    planColumn(0, 0, column([[42, 42]]), into);
    expect(into.size, "open air must not be lit").toBe(0);
  });

  test("NEGATIVE: ignores rooms too low to be rooms", () => {
    // A 2-block crawlspace under a floor is a join, not a cell.
    const into = plan();
    planColumn(0, 0, column([[40, 40], [43, 50]]), into);
    expect(into.size, "a 2-block gap is not a room").toBe(0);
    planColumn(0, 0, column([[40, 40], [45, 50]]), into);
    expect(into.size, "a 4-block gap is a room, and is the documented minimum").toBe(1);
  });

  test("NEGATIVE: the lamp grid is sparse and aligned", () => {
    // One lamp per spacing x spacing of floor, on a global grid, so a storey
    // reads as a regular grid of lamps rather than a solid ceiling of them.
    const spacing = PURGATORY_LIGHTING.spacing;
    const onto = plan();
    for (let x = 0; x < spacing * 3; x++) {
      for (let z = 0; z < spacing * 3; z++) {
        planColumn(x, z, column([[42, 42], [54, 60]]), onto);
      }
    }
    expect(onto.size, `expected one lamp per ${spacing}x${spacing} patch`).toBe(9);
  });
});

describe("the Purgatory office beacon", () => {
  // The beacon is planned in *source* coordinates, because the transplant is
  // the only pass that can write above y127 - Purgatory is a 250-block tower
  // and `World.set` refuses anything past the realm's own ceiling. So it cannot
  // be a `beacons.ts` mast like every other landmark, and it cannot be asserted
  // on the generated world at all; these tests pin the plan instead.
  const plan = () => planOfficeBeacon(new Map());

  /** The block planned at a world Y in the beacon column, or undefined. */
  function at(planMap: LightingPlan, y: number) {
    // The plan is keyed by the same packed key the transplant uses, so recover
    // it the same way rather than reaching into the map's internals.
    const { x, z } = PURGATORY_OFFICE_BEACON;
    const key = (x + 1024) * 1048576 + (z + 1024) * 256 + y;
    return planMap.get(key);
  }

  test("stands in the middle of the office rotunda, on one column", () => {
    // The screenshot the request came from reads `Position: -623, 270, 23`,
    // which is source-local (273, 254, 279). The rotunda's floor is a disc of
    // polished tuff about 28 across centred on (274, 283), so the mast goes in
    // the centre - a beacon four blocks off to one side is inside the seating.
    expect(PURGATORY_OFFICE_BEACON.x).toBe(274);
    expect(PURGATORY_OFFICE_BEACON.z).toBe(283);
    const onto = plan();
    const columns = new Set<number>();
    for (const [key] of onto) columns.add(Math.floor(key / 1048576));
    expect([...columns], "the beacon must be a single column, not a slab").toEqual([PURGATORY_OFFICE_BEACON.x + 1024]);
  });

  test("runs from the office floor to the top of the island", () => {
    // A mast that stops at the office ceiling is invisible from outside, and
    // Purgatory has no exterior to speak of until its roof at y282 - which is
    // the highest block anywhere in the source.
    const onto = plan();
    expect(onto.size, "one course of glass per Y from base to top").toBe(
      PURGATORY_OFFICE_BEACON.topY - PURGATORY_OFFICE_BEACON.baseY + 1,
    );
    expect(at(onto, PURGATORY_OFFICE_BEACON.baseY), "the mast does not start on the office floor").toBeDefined();
    expect(at(onto, PURGATORY_OFFICE_BEACON.topY - 2), "the mast does not reach the roof").toBeDefined();
    expect(at(onto, PURGATORY_OFFICE_BEACON.baseY - 1), "the mast starts below the office floor").toBeUndefined();
  });

  test("is lit at the top and banded all the way down", () => {
    const onto = plan();
    // The crown: a sea lantern under a glowstone, so the beacon is visible from
    // the Underworld and not just a coloured line on a grey tower.
    expect(at(onto, PURGATORY_OFFICE_BEACON.topY)?.name).toBe(P.glowstone.name);
    expect(at(onto, PURGATORY_OFFICE_BEACON.topY - 1)?.name).toBe(P.seaLantern.name);
    // The banding. A plain 30-block stick of one glass is not a beacon, it is a
    // pillar, and the eye reads it as part of the building.
    let bands = 0;
    let accents = 0;
    for (let y = PURGATORY_OFFICE_BEACON.baseY; y < PURGATORY_OFFICE_BEACON.topY - 1; y++) {
      const name = at(onto, y)?.name;
      if (name === P.blackGlass.name) bands++;
      if (name === PURGATORY_OFFICE_BEACON.accent.name) accents++;
    }
    expect(bands, "the mast has no dark banding").toBeGreaterThan(2);
    expect(accents, "the mast has no accent colour").toBeGreaterThan(2);
  });

  test("NEGATIVE: it is Purgatory's own green, not a colour imported from the Underworld", () => {
    // Every other beacon in the world is a prism mast; this one is inside
    // somebody else's build, in somebody else's palette, and a lime-and-cyan
    // spire on a prison tower would read as a bug rather than as a sign.
    expect(PURGATORY_OFFICE_BEACON.main.name).toBe(P.greenGlass.name);
    expect(PURGATORY_OFFICE_BEACON.accent.name).toBe(P.limeGlass.name);
    const onto = plan();
    const foreign = [...onto.values()].filter(
      (b) => b.name !== P.greenGlass.name && b.name !== P.limeGlass.name && b.name !== P.blackGlass.name
        && b.name !== P.seaLantern.name && b.name !== P.glowstone.name,
    );
    expect(foreign, "the beacon should only use its own four materials").toEqual([]);
  });
});
