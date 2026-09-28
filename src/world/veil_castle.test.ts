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
import { LANDMARKS, type LandmarkId } from "./layout.ts";
import { beaconMast } from "./beacons.ts";
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

/** A cell a player can stand in: air at the cell and at head height, floor below. */
const isStandable = (world: World, x: number, y: number, z: number): boolean =>
  isAir(world, x, y, z) && isAir(world, x, y + 1, z) && isSolid(world, x, y - 1, z);

/**
 * Every cell a player can walk to from the great hall's centre, on foot.
 *
 * This is the check that "every room should be accessible" actually means.
 * Counting doors and counting floor blocks both pass on a building full of
 * sealed rooms: a door can open onto a one-block wall, and a room can have a
 * beautiful floor with no way onto it. So this floods real walkable cells -
 * four-way, with a single step up or down, which is what a player can manage -
 * and the tests below then ask whether a named room is in the set.
 */
function reachableFromHall(world: World): Set<string> {
  const seen = new Set<string>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const start: [number, number, number] = [-162, LEVEL + 1, 133];
  const queue: Array<[number, number, number]> = [start];
  seen.add(key(...start));
  while (queue.length) {
    const [x, y, z] = queue.shift()!;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      for (const dy of [0, 1, -1]) {
        const ny = y + dy;
        if (ny < 1 || ny > 126) continue;
        if (!isStandable(world, x + dx, ny, z + dz)) continue;
        const k = key(x + dx, ny, z + dz);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push([x + dx, ny, z + dz]);
      }
    }
  }
  return seen;
}

/** The gallery deck, ten courses over the hall paving. */
const GALLERY_Y = LEVEL + 10;

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

  test("has a gallery down both sides of the hall, with a rail and banners", () => {
    const world = generateWorld();
    // Every interior reference the user sent has the same shape: a vaulted hall
    // with a balcony running down both sides above a colonnade. The first
    // version of this castle was one storey, which is a corridor with a roof.
    // Three wide, hard against each wall, on the line of the piers below.
    for (const [label, x1, x2, z1, z2] of [
      ["west", -168, -166, 123, 152],
      ["east", -158, -156, 114, 143],
    ] as const) {
      let deck = 0;
      for (let z = z1; z <= z2; z++) {
        for (let x = x1; x <= x2; x++) {
          const name = world.get(x, GALLERY_Y, z)?.name;
          if (name === P.darkOakPlanks.name || name === P.sprucePlanks.name) deck++;
        }
      }
      expect(deck, `the ${label} gallery has no deck`).toBeGreaterThan(60);
      // A balcony needs a rail on the nave side or it is a ledge.
      expect(
        countIn(world, x1, GALLERY_Y + 1, z1, x2, GALLERY_Y + 1, z2, (n) => n === P.darkOakFence.name),
        `the ${label} gallery has no rail`,
      ).toBeGreaterThan(15);
    }
    // Banners hung off the rail, in the castle's colours. They are on the rail
    // line, over the nave, so they cannot end up standing in the walkway. Both
    // banner colours count: the cloth is purple with a magenta band every third
    // course, and asserting on the purple alone would only ever see two thirds
    // of what is actually there.
    expect(
      countIn(
        world,
        -166,
        GALLERY_Y + 1,
        123,
        -158,
        GALLERY_Y + 5,
        152,
        (n) => n === P.purpleConcrete.name || n === P.magentaConcrete.name,
      ),
      "the gallery has no banners",
    ).toBeGreaterThan(20);
  });

  test("NEGATIVE: every room in the castle is reachable on foot from the hall", () => {
    const world = generateWorld();
    const seen = reachableFromHall(world);
    // This is the whole of the user's requirement - "every room should be
    // accessible" - stated as a list of cells a player can actually stand in
    // after walking there from the middle of the great hall.
    //
    // The gallery entries are the ones that fail if a stair is missing, walled
    // up, or blocked by whatever is standing at its foot: a balcony with no
    // way onto it is the exact failure this build already had once.
    for (const [label, x, y, z] of [
      ["great hall, west end", -167, LEVEL + 1, 116],
      ["great hall, east end", -157, LEVEL + 1, 150],
      ["the dais", -158, LEVEL + 4, 133],
      ["the west stair, foot", -166, LEVEL + 2, 113],
      ["the west stair, top", -167, GALLERY_Y + 1, 122],
      ["the west gallery, near end", -167, GALLERY_Y + 1, 128],
      ["the west gallery, far end", -167, GALLERY_Y + 1, 148],
      ["the east stair, foot", -157, LEVEL + 2, 153],
      ["the east stair, top", -157, GALLERY_Y + 1, 144],
      ["the east gallery, near end", -157, GALLERY_Y + 1, 118],
      ["the east gallery, far end", -157, GALLERY_Y + 1, 139],
      ["the rotunda", -146, LEVEL + 3, 127],
      ["the rotunda dais ring", -146, LEVEL + 4, 129],
      ["the rotunda dais ring, far side", -146, LEVEL + 4, 137],
      ["the north wing", -146, LEVEL + 1, 110],
      ["the south wing", -146, LEVEL + 1, 155],
    ] as const) {
      expect(isStandable(world, x, y, z), `${label} is not a cell a player can stand in`).toBe(true);
      expect(seen.has(`${x},${y},${z}`), `${label} cannot be walked to from the great hall`).toBe(true);
    }
  });

  test("NEGATIVE: nothing two blocks tall is standing where a player has to walk", () => {
    // A dais three courses high, a bench row across an aisle, or a bookcase in
    // a doorway are all invisible in a plan view and all of them end the tour.
    // The great hall's dais tapers one column per course for exactly this
    // reason, and the rotunda's is a single step.
    const world = generateWorld();
    // The nave is the run between the two colonnades, x -165 to -159, with the
    // carpet down the middle of it. It has to be clear at floor level for the
    // whole length of the hall.
    //
    // The pew bays either side of it - x -168/-167 and x -157/-156 - are *not*
    // sampled, and that is the point of moving the pews outboard: benches
    // belong against the wall, and a bench in the nave is a bench between the
    // door and the rest of the hall.
    let blocked = 0;
    for (let z = 114; z <= 152; z++) {
      for (const x of [-164, -163, -162, -160, -159]) {
        const name = world.get(x, LEVEL + 1, z)?.name;
        if (name && name !== AIR.name && name !== P.smoothQuartz.name && name !== P.quartz.name) blocked++;
      }
    }
    expect(blocked, "the hall's aisles have something standing in them").toBe(0);
    // The gallery's own aisle, over the pews. A rail with a gap every bay is
    // fine - that is how you get on and off it - but nothing two blocks tall.
    let galleryBlocked = 0;
    for (let z = 123; z <= 152; z++) {
      for (const x of [-168, -167]) {
        const name = world.get(x, GALLERY_Y + 1, z)?.name;
        if (name && name !== AIR.name && name !== P.darkOakFence.name) galleryBlocked++;
      }
    }
    expect(galleryBlocked, "the west gallery walkway is blocked").toBe(0);
  });
});

describe("the sky beacons' pyramids", () => {
  test("NEGATIVE: every beacon stands on a full 5x5 base, with clear air above", () => {
    const world = generateWorld();
    // This is the test that would have caught the beams not appearing.
    //
    // A beacon's power is recomputed by the game from the blocks beneath it
    // every time the chunk loads, so `power_level: 1` in the palette is only a
    // cache. Level 1 needs a complete 5x5 of base material; a 3x3 collar -
    // which is what these masts were capped with - scores nothing, and the
    // game resets the beacon to unlit on load. The file looks perfect and the
    // game shows a grey block.
    //
    // The five valid base materials are the only ones that count, so the test
    // names them rather than counting "solid" blocks: a pane of glass in the
    // middle of the base voids it just as thoroughly as a missing block.
    const BASE = new Set([
      "minecraft:iron_block",
      "minecraft:gold_block",
      "minecraft:emerald_block",
      "minecraft:diamond_block",
      "minecraft:netherite_block",
    ]);
    for (const id of Object.keys(LANDMARKS) as LandmarkId[]) {
      const { x, z } = LANDMARKS[id].center;
      const crownY = beaconMast(world, id).crownY;
      for (const [dy, half] of [
        [2, 2],
        [1, 1],
      ] as const) {
        for (let dz = -half; dz <= half; dz++) {
          for (let dx = -half; dx <= half; dx++) {
            const name = world.get(x + dx, crownY - dy, z + dz)?.name ?? "";
            expect(
              BASE.has(name),
              `${id}'s beacon has no valid pyramid: (${x + dx}, ${crownY - dy}, ${z + dz}) is ${name}`,
            ).toBe(true);
          }
        }
      }
      // And the course the beam starts in has to be open, or the beam is one
      // block long and reads as a bug rather than a beacon.
      for (let dy = 1; dy <= 3; dy++) {
        expect(
          isAir(world, x, crownY + dy, z),
          `${id}'s beacon has a block above it at y${crownY + dy}`,
        ).toBe(true);
      }
    }
  });
});
