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
import { planColumn, PURGATORY_LIGHTING, type ColumnMask, type LightingPlan } from "./purgatory.ts";
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
