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
    expect(world.get(x, LEVEL + 14, z - 5)?.name, "no white in the eye").toBe(P.whiteGlass.name);
    expect(world.get(x, LEVEL + 14, z + 5)?.name, "no white in the eye").toBe(P.whiteGlass.name);
    expect(world.get(x, LEVEL + 14, z)?.name, "the eye has no pupil").toBe(P.blackGlass.name);
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
    expect(world.get(-181, LEVEL + 18, 133)?.name, "no eye over the gate").toBe(P.blackGlass.name);
    expect(world.get(-131, LEVEL + 10, 133)?.name, "no eye over the east gate").toBe(P.blackGlass.name);
    expect(world.get(-189, LEVEL, 142)?.name, "no eye inlaid in the plaza").toBe(P.blackGlass.name);
    expect(world.get(-194, LEVEL, 142)?.name, "no sclera in the plaza eye").toBe(P.whiteGlass.name);
    expect(
      countIn(world, -196, LEVEL, 137, -182, LEVEL, 147, (n) => n.includes("green_stained_glass") || n.includes("lime_stained_glass") || n.includes("cyan_stained_glass")),
      "the plaza eye has no green iris",
    ).toBeGreaterThan(10);
    expect(world.get(-155, LEVEL + 10, 133)?.name, "no eye over the rotunda door").toBe(P.blackGlass.name);
    expect(
      countIn(world, -200, LEVEL, 120, -170, LEVEL + 30, 150, (n) => n === P.seaLantern.name),
      "no eye has a catchlight",
    ).toBeGreaterThan(0);
  });

  test("NEGATIVE: the eyes are eyes and not roundels", () => {
    const world = generateWorld();
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
    expect(
      countIn(world, -168, LEVEL, 113, -157, LEVEL + 16, 153, (n) => n === P.darkOakPlanks.name),
      "the great hall has no furniture in it",
    ).toBeGreaterThan(30);
    expect(world.get(-157, LEVEL + 4, 133)?.name, "no throne at the head of the hall").toBe(P.darkOakPlanks.name);
    expect(world.get(-157, LEVEL + 6, 133)?.name, "the throne has no back").toBe(P.darkOakPlanks.name);
    expect(world.get(-161, LEVEL + 1, 133)?.name, "no lectern on the carpet").toBe(P.lectern.name);
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
    expect(world.get(-146, LEVEL + 2, 133)?.name, "no carpet cross in the rotunda floor").toBe(P.purpleConcrete.name);
    expect(world.get(-149, LEVEL + 2, 133)?.name, "no green ring in the rotunda floor").toBe(P.greenGlass.name);
    expect(
      countIn(world, -153, LEVEL + 2, 126, -139, LEVEL + 20, 140, (n) => n === P.quartzPillar.name),
      "no piers round the rotunda",
    ).toBeGreaterThan(60);
    expect(world.get(-146, LEVEL + 4, 133)?.name, "no eye inlaid in the rotunda dais").toBe(P.blackGlass.name);
    expect(world.get(-146, LEVEL + 3, 133)?.name, "nothing under the pupil to light it").toBe(P.seaLantern.name);
  });

  test("NEGATIVE: every room has a floor, headroom and a way in", () => {
    const world = generateWorld();
    for (const [label, x, y, z] of [
      ["great hall", -162, LEVEL, 133],
      ["north wing", -146, LEVEL, 110],
      ["south wing", -146, LEVEL, 155],
      ["rotunda", -152, LEVEL + 2, 133],
    ] as const) {
      expect(isSolid(world, x, y, z), `the ${label} has no floor`).toBe(true);
      expect(isAir(world, x, y + 1, z), `the ${label} has no headroom`).toBe(true);
    }
    expect(isAir(world, -155, LEVEL + 1, 133), "the rotunda door is walled up").toBe(true);
    expect(isAir(world, -154, LEVEL + 3, 133), "the drum's wall is across the rotunda door").toBe(true);
    expect(isAir(world, -153, LEVEL + 3, 133), "the drum's inner wall is across the rotunda door").toBe(true);
    expect(isAir(world, -155, LEVEL + 1, 120), "the north wing door is walled up").toBe(true);
    expect(isAir(world, -156, LEVEL + 1, 120), "the north wing arcade is across its door").toBe(true);
    expect(isAir(world, -155, LEVEL + 1, 146), "the south wing door is walled up").toBe(true);
  });

  test("has a gallery down both sides of the hall, with a rail and banners", () => {
    const world = generateWorld();
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
      expect(
        countIn(world, x1, GALLERY_Y + 1, z1, x2, GALLERY_Y + 1, z2, (n) => n === P.darkOakFence.name),
        `the ${label} gallery has no rail`,
      ).toBeGreaterThan(15);
    }
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
    const world = generateWorld();
    let blocked = 0;
    for (let z = 114; z <= 152; z++) {
      for (const x of [-164, -163, -162, -160, -159]) {
        const name = world.get(x, LEVEL + 1, z)?.name;
        if (name && name !== AIR.name && name !== P.smoothQuartz.name && name !== P.quartz.name) blocked++;
      }
    }
    expect(blocked, "the hall's aisles have something standing in them").toBe(0);
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

describe("the ground beacons' pyramids", () => {
  test("NEGATIVE: every beacon stands on a full 5x5 netherite base, with clear air above", () => {
    const world = generateWorld();
    const BASE = new Set([
      "minecraft:iron_block",
      "minecraft:gold_block",
      "minecraft:emerald_block",
      "minecraft:diamond_block",
      "minecraft:netherite_block",
    ]);
    for (const id of Object.keys(LANDMARKS) as LandmarkId[]) {
      const mast = beaconMast(world, id);
      const { x, z, baseY, beaconY } = mast;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const name = world.get(x + dx, baseY, z + dz)?.name ?? "";
          expect(
            BASE.has(name),
            `${id}'s beacon has no valid pyramid: (${x + dx}, ${baseY}, ${z + dz}) is ${name}`,
          ).toBe(true);
        }
      }
      expect(world.get(x, beaconY, z)?.name, `${id} is not a beacon`).toBe(P.litBeacon.name);
      for (let dy = 1; dy <= 8; dy++) {
        expect(
          isAir(world, x, beaconY + dy, z),
          `${id}'s beam is blocked at y${beaconY + dy}`,
        ).toBe(true);
      }
    }
  });
});
