/**
 * The Veil Castle's eyes and its insides.
 *
 * These live in their own file rather than at the end of `world.test.ts`
 * because they are about two specific claims that are easy to *look* right and
 * be wrong:
 *
 *  1. the eyes. The reference castle is hung with circular green medallions,
 *     and on a closer look those are not medallions - they are eyes. A disc in
 *     a stone ring is a rose window; a disc with a pupil is a face. So the
 *     shape is pinned as an almond with the lids closed at the corners, and the
 *     negative test is the only thing that actually distinguishes the two.
 *
 *  2. the insides. A castle that is furnished on the outside and hollow in the
 *     middle is the failure mode of a build like this: every screenshot the
 *     request came from was taken from outside, so nothing forces the inside to
 *     exist, and a player walks through the gate into four walls.
 */
import { describe, expect, test } from "bun:test";
import { AIR, P } from "./blocks.ts";
import { buildSceneWorld } from "./scene.ts";
import type { World } from "./world.ts";

/** The full generation pipeline, in the order build.ts runs it. */
function generateWorld(): World {
  return buildSceneWorld().world;
}

/** Plaza level: everything in the castle is measured up from here. */
const LEVEL = 46;

/** The great hall's west face, on the approach axis. */
const HALL_FACE = { x: -169, z: 133 };

const countIn = (
  world: World,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  match: (name: string) => boolean,
): number => {
  let n = 0;
  for (let z = z1; z <= z2; z++) {
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const name = world.get(x, y, z)?.name;
        if (name && match(name)) n++;
      }
    }
  }
  return n;
};

const isAir = (world: World, x: number, y: number, z: number): boolean =>
  world.get(x, y, z)?.name === AIR.name;

const isSolid = (world: World, x: number, y: number, z: number): boolean => {
  const name = world.get(x, y, z)?.name;
  return !!name && name !== AIR.name;
};

describe("the Veil Castle's eyes", () => {
  test("watches you with almond eyes: white, green iris, black pupil, lit catchlight", () => {
    const world = generateWorld();
    const { x, z } = HALL_FACE;
    // The sclera either side of the iris, on the centre line of the big eye.
    expect(world.get(x, LEVEL + 14, z - 5)?.name, "no white in the eye").toBe(P.whiteGlass.name);
    expect(world.get(x, LEVEL + 14, z + 5)?.name, "no white in the eye").toBe(P.whiteGlass.name);
    // The pupil, dead centre.
    expect(world.get(x, LEVEL + 14, z)?.name, "the eye has no pupil").toBe(P.blackGlass.name);
    // The iris, immediately around it - green, in the reference's greens.
    let iris = 0;
    for (let dz = -3; dz <= 3; dz++) {
      for (let dy = -3; dy <= 3; dy++) {
        const name = world.get(x, LEVEL + 14 + dy, z + dz)?.name ?? "";
        if (name.includes("green_stained_glass") || name.includes("lime_stained_glass") || name.includes("cyan_stained_glass")) {
          iris++;
        }
      }
    }
    expect(iris, "the eye has no green iris around its pupil").toBeGreaterThan(10);
  });

  test("puts an eye on every face a visitor looks at", () => {
    const world = generateWorld();
    // The gatehouse over the arch - the first thing anyone walking up the
    // causeway sees. The east gate. The plaza, laid flat. And the tympanum over
    // the door into the rotunda, which is the last thing before the dome.
    expect(world.get(-181, LEVEL + 18, 133)?.name, "no eye over the gate").toBe(P.blackGlass.name);
    expect(world.get(-131, LEVEL + 10, 133)?.name, "no eye over the east gate").toBe(P.blackGlass.name);
    expect(world.get(-189, LEVEL, 142)?.name, "no eye inlaid in the plaza").toBe(P.blackGlass.name);
    expect(world.get(-194, LEVEL, 142)?.name, "no sclera in the plaza eye").toBe(P.whiteGlass.name);
    // The iris is the reference's greens, picked per cell, so it is counted
    // rather than sampled: a single sample is a coin toss between three hues.
    expect(
      countIn(world, -196, LEVEL, 137, -182, LEVEL, 147, (n) => n.includes("green_stained_glass") || n.includes("lime_stained_glass") || n.includes("cyan_stained_glass")),
      "the plaza eye has no green iris",
    ).toBeGreaterThan(10);
    expect(world.get(-155, LEVEL + 10, 133)?.name, "no eye over the rotunda door").toBe(P.blackGlass.name);
    // The catchlight is a lit block rather than a white one, so the eye catches
    // light at night instead of going dark with the rest of the facade.
    expect(
      countIn(world, -200, LEVEL, 120, -170, LEVEL + 30, 150, (n) => n === P.seaLantern.name),
      "no eye has a catchlight",
    ).toBeGreaterThan(0);
  });

  test("NEGATIVE: the eyes are eyes and not roundels", () => {
    const world = generateWorld();
    // A roundel is a disc: stone all the way round at the height of its centre.
    // An eye is an almond: by the time you reach the corner the lids have shut.
    // So the distance from the centre that is sclera in the middle of the shape
    // has to be stone near the ends - and that difference is the whole test. It
    // is what fails if the lid line is drawn as a circle.
    const x = HALL_FACE.x;
    const cy = LEVEL + 14;
    const inside = world.get(x, cy, HALL_FACE.z - 4)?.name;
    const outside = world.get(x, cy, HALL_FACE.z - 7)?.name;
    expect(inside, "the eye is not open at its widest point").not.toBe(P.chiseledSandstone.name);
    expect(outside, "the eye has no closed lid at its corner").toBe(P.chiseledSandstone.name);
  });
});

describe("the Veil Castle's insides", () => {
  test("furnishes the great hall: pews, a throne, banners, chandeliers", () => {
    const world = generateWorld();
    // The reference is a palace, and a palace you walk into and find four walls
    // in is a box. Dark oak against pale masonry is the contrast the whole
    // building runs on, so the furniture is counted, not eyeballed.
    expect(
      countIn(world, -168, LEVEL, 113, -157, LEVEL + 16, 153, (n) => n === P.darkOakPlanks.name),
      "the great hall has no furniture in it",
    ).toBeGreaterThan(30);
    // The throne, on the dais at the head of the hall, facing the door.
    expect(world.get(-157, LEVEL + 4, 133)?.name, "no throne at the head of the hall").toBe(P.darkOakPlanks.name);
    expect(world.get(-157, LEVEL + 6, 133)?.name, "the throne has no back").toBe(P.darkOakPlanks.name);
    expect(world.get(-161, LEVEL + 1, 133)?.name, "no lectern on the carpet").toBe(P.lectern.name);
    // Chandeliers on chains. The facade glazing is decorative - there is no sky
    // above this building - so without a light source in it the hall is a dark
    // box with a green floor.
    expect(
      countIn(world, -168, LEVEL + 10, 113, -157, LEVEL + 20, 153, (n) => n === P.chain.name),
      "no chandeliers hanging in the hall",
    ).toBeGreaterThan(10);
    expect(
      countIn(world, -168, LEVEL, 113, -157, LEVEL + 20, 153, (n) => n === P.glowstone.name),
      "the hall is unlit",
    ).toBeGreaterThan(3);
  });

  test("turns both wings into galleries with a library down them", () => {
    const world = generateWorld();
    // The wings are the widest rooms in the castle and the reference gives them
    // arcaded walls and a long glazed run, so the inside gets bookcases against
    // both walls and refectory tables either side of the carpet.
    expect(
      countIn(world, -154, LEVEL, 101, -138, LEVEL + 6, 121, (n) => n === P.bookshelf.name),
      "the north wing has no library",
    ).toBeGreaterThan(20);
    expect(
      countIn(world, -154, LEVEL, 145, -138, LEVEL + 6, 165, (n) => n === P.darkOakPlanks.name),
      "the south wing has no tables",
    ).toBeGreaterThan(12);
  });

  test("lays a compass under the dome, with the castle's flattest eye at its centre", () => {
    const world = generateWorld();
    // The drum was already hollow; it was hollow and *empty*, which from the
    // great hall is a nine-block shaft with a hole in the ceiling.
    expect(world.get(-146, LEVEL + 2, 133)?.name, "no carpet cross in the rotunda floor").toBe(P.purpleConcrete.name);
    expect(world.get(-149, LEVEL + 2, 133)?.name, "no green ring in the rotunda floor").toBe(P.greenGlass.name);
    expect(
      countIn(world, -153, LEVEL + 2, 126, -139, LEVEL + 20, 140, (n) => n === P.quartzPillar.name),
      "no piers round the rotunda",
    ).toBeGreaterThan(60);
    // The eye, laid flat on the dais, looking up into the dome. A sea lantern
    // goes under the pupil so the black glass has something behind it.
    expect(world.get(-146, LEVEL + 4, 133)?.name, "no eye inlaid in the rotunda dais").toBe(P.blackGlass.name);
    expect(world.get(-146, LEVEL + 3, 133)?.name, "nothing under the pupil to light it").toBe(P.seaLantern.name);
  });

  test("NEGATIVE: every room has a floor, headroom and a way in", () => {
    const world = generateWorld();
    // A door cut before the room behind it is built gets paved over again, and
    // nothing looks broken until you try to walk through it. So these are
    // checked as walkable cells, not by counting blocks.
    for (const [label, x, y, z] of [
      ["great hall", -162, LEVEL, 133],
      ["north wing", -146, LEVEL, 110],
      ["south wing", -146, LEVEL, 155],
      ["rotunda", -152, LEVEL + 2, 133],
    ] as const) {
      expect(isSolid(world, x, y, z), `the ${label} has no floor`).toBe(true);
      expect(isAir(world, x, y + 1, z), `the ${label} has no headroom`).toBe(true);
    }
    // The three doorways, at the height a player walks through them. The drum's
    // own wall is two blocks thick on its axis, so both of its courses have to
    // be open or the door opens onto a one-block wall.
    expect(isAir(world, -155, LEVEL + 1, 133), "the rotunda door is walled up").toBe(true);
    expect(isAir(world, -154, LEVEL + 3, 133), "the drum's wall is across the rotunda door").toBe(true);
    expect(isAir(world, -153, LEVEL + 3, 133), "the drum's inner wall is across the rotunda door").toBe(true);
    // The wing doors are cut through the wings' arcade, which is built one block
    // *inside* the hall's east wall, so both columns have to be open.
    expect(isAir(world, -155, LEVEL + 1, 120), "the north wing door is walled up").toBe(true);
    expect(isAir(world, -156, LEVEL + 1, 120), "the north wing arcade is across its door").toBe(true);
    expect(isAir(world, -155, LEVEL + 1, 146), "the south wing door is walled up").toBe(true);
  });

  test("NEGATIVE: nothing two blocks tall is standing where a player has to walk", () => {
    // A dais three courses high, a bench row across an aisle, or a bookcase in
    // a doorway are all invisible in a plan view and all of them end the tour.
    // The great hall's dais tapers one column per course for exactly this
    // reason, and the rotunda's is a single step.
    const world = generateWorld();
    // The aisle either side of the carpet is clear at floor level for the whole
    // length of the hall.
    let blocked = 0;
    for (let z = 114; z <= 152; z++) {
      for (const x of [-164, -163, -162, -157]) {
        const name = world.get(x, LEVEL + 1, z)?.name;
        if (name && name !== AIR.name && name !== P.smoothQuartz.name && name !== P.quartz.name) blocked++;
      }
    }
    expect(blocked, "the hall's aisles have something standing in them").toBe(0);
  });
});
