import { describe, expect, test } from "bun:test";
import { AIR, P } from "./blocks.ts";
import { LANDMARKS } from "./layout.ts";
import { buildSceneWorld } from "./scene.ts";
import { LEVEL as CASTLE_LEVEL } from "./veil_castle.ts";
import {
  UNDERCROFT,
  UNDERCROFT_BOUNDS,
  PORTAL_CENTRE,
  PORTAL_FRAME,
  UNDERCROFT_ENTRANCE,
} from "./veil_undercroft.ts";
import type { World } from "./world.ts";

/** The full generation pipeline, in the order build.ts runs it. */
function generateWorld(): World {
  return buildSceneWorld().world;
}

const solid = (world: World, x: number, y: number, z: number): boolean => {
  const name = world.get(x, y, z)?.name;
  return !!name && name !== AIR.name;
};
/** A cell a player can stand in: nothing at their feet or their head, floor under. */
const standable = (world: World, x: number, y: number, z: number): boolean =>
  !solid(world, x, y, z) && !solid(world, x, y + 1, z) && solid(world, x, y - 1, z);

/**
 * Everything a player can walk to from one cell, on foot, in this world.
 *
 * Four ways across and one step up or down, which is the whole of what "you can
 * get there" means in a building: you cannot walk through a wall, and you cannot
 * walk up two blocks. Ladders and slabs are deliberately not special-cased -
 * a staircase is a staircase, and a test that counts a ladder as a staircase
 * passes on a build nobody could walk.
 */
function reachableFrom(world: World, start: [number, number, number], yMin = 1, yMax = CASTLE_LEVEL + 4): Set<string> {
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const seen = new Set<string>([key(...start)]);
  const queue: Array<[number, number, number]> = [start];
  while (queue.length) {
    const [x, y, z] = queue.shift()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (const dy of [0, 1, -1]) {
        const ny = y + dy;
        if (ny < yMin || ny > yMax) continue;
        const k = key(x + dx, ny, z + dz);
        if (seen.has(k)) continue;
        if (!standable(world, x + dx, ny, z + dz)) continue;
        seen.add(k);
        queue.push([x + dx, ny, z + dz]);
      }
    }
  }
  return seen;
}

describe("the Veil Castle's undercroft", () => {
  test("is underground: a hall under the castle, with rock the whole way down", () => {
    const world = generateWorld();
    const cx = PORTAL_CENTRE.x;
    for (const y of UNDERCROFT.floors) {
      expect(y, "a hall floor should be below the surface castle").toBeLessThan(CASTLE_LEVEL - 8);
      // ...and it is a floor, not a hole: solid under the player, air above.
      expect(solid(world, cx, y, PORTAL_CENTRE.z), `no floor at y${y}`).toBe(true);
      expect(solid(world, cx, y + 1, PORTAL_CENTRE.z), `no headroom at y${y + 1}`).toBe(false);
    }
    // The whole thing is inside the castle's own ground plate, so there is
    // rock between the deepest hall and the void the Underworld opens into
    // below it - the undercroft is cut into the world, not hung in it.
    const floor = world.surfaceAt(cx, PORTAL_CENTRE.z);
    expect(floor, "the castle's own plate should still be the surface above the undercroft").toBe(CASTLE_LEVEL);
  });

  test("is big: three halls of floor, and forty blocks of drop", () => {
    // "Make it big" against the building it belongs to. The surface palace's
    // own rooms are 40 by 70; this is 64 by 69 of floor over three storeys,
    // and it is *deeper* than the castle is tall. It is not as wide as the
    // castle's whole footprint because that footprint includes the forecourt
    // and the ramp, and the undercroft may not cut into the causeway's arch
    // piers or the portal lobby - which is what "hit no builds" costs.
    const width = UNDERCROFT_BOUNDS.x2 - UNDERCROFT_BOUNDS.x1;
    const depth = UNDERCROFT_BOUNDS.z2 - UNDERCROFT_BOUNDS.z1;
    expect(width * depth, "the undercroft's floor should be bigger than the surface palace").toBeGreaterThan(4000);
    expect(UNDERCROFT.floors.length, "the undercroft should be more than a cellar").toBeGreaterThanOrEqual(3);
    expect(CASTLE_LEVEL - PORTAL_CENTRE.y, "the portal should be a long way down").toBeGreaterThan(35);
  });

  test("is reached on foot from the great hall above it", () => {
    // The one that matters. An underground area you cannot get to is a
    // separate map, and the only route is the stair the castle's own floor is
    // opened for.
    const world = generateWorld();
    const start: [number, number, number] = [-166, CASTLE_LEVEL + 1, 133];
    expect(standable(world, ...start), "the great hall's own floor should be walkable").toBe(true);
    const seen = reachableFrom(world, start, 1, CASTLE_LEVEL + 4);

    for (const y of UNDERCROFT.floors) {
      let cells = 0;
      for (let z = UNDERCROFT_BOUNDS.z1; z <= UNDERCROFT_BOUNDS.z2; z++) {
        for (let x = UNDERCROFT_BOUNDS.x1; x <= UNDERCROFT_BOUNDS.x2; x++) {
          if (seen.has(`${x},${y + 1},${z}`)) cells++;
        }
      }
      expect(cells, `the hall at y${y} is not reachable from the great hall`).toBeGreaterThan(1000);
    }
    // ...and you can stand beside the frame, which is the point of the descent.
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
      expect(
        seen.has(`${PORTAL_CENTRE.x + dx},${PORTAL_CENTRE.y + 1},${PORTAL_CENTRE.z + dz}`),
        `no way to stand beside the frame at ${dx},${dz}`,
      ).toBe(true);
    }
  });

  test("puts an end-portal-frame's worth of nether portal at the bottom of it", () => {
    // "At the bottom of it put an end portal, but instead of an end frame it's
    // a nether portal frame, but it's like in the way an end frame would go."
    //
    // An end portal frame is a 3x3 ring of frame blocks lying *flat in the
    // floor* with the portal in the middle cell. So: a 3x3 ring, flat, in the
    // floor, with `minecraft:portal` - the nether portal's own surface block -
    // standing in the middle of it and air above it so the portal is the two
    // blocks tall a nether portal is.
    const world = generateWorld();
    const { x, y, z } = PORTAL_CENTRE;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const name = world.get(x + dx, y, z + dz)?.name;
        expect(
          name,
          `${dx},${dz} in the 3x3 should be the frame`,
        ).toBe(dx === 0 && dz === 0 ? P.portal.name : PORTAL_FRAME.name);
      }
    }
    // ...and nothing on top of it, or the portal is one block tall and the
    // chamber above it is a lid.
    expect(solid(world, x, y + 1, z), "the portal needs air above it").toBe(false);
    expect(solid(world, x, y + 2, z), "the portal needs two courses of air above it").toBe(false);
  });

  test("is 'eye style', like the castle it belongs to", () => {
    // The request was explicitly eye style, so every hall carries the castle's
    // own eye on each of its four walls, facing in. What is asserted is the
    // *catchlight*: `eyeMosaic` sets a sea lantern in the upper left of every
    // eye it draws, so a lit two-cell patch high on the wall is a signature no
    // other pass in the build leaves behind.
    const world = generateWorld();
    const cx = PORTAL_CENTRE.x;
    const cz = PORTAL_CENTRE.z;
    for (const y of UNDERCROFT.floors) {
      for (const [dx, dz] of [
        [-3, 0],
        [-4, 0],
        [0, -3],
        [0, -4],
      ] as const) {
        const onX = dz === 0;
        const x = onX ? cx + dx : dx < 0 ? UNDERCROFT_BOUNDS.x1 + 1 : UNDERCROFT_BOUNDS.x2 - 1;
        const z = onX ? (dx < 0 ? UNDERCROFT_BOUNDS.z1 + 1 : UNDERCROFT_BOUNDS.z2 - 1) : cz + dz;
        expect(
          world.get(x, y + 5, z)?.name,
          `the hall at y${y} has no eye on the wall at ${x},${z}`,
        ).toBe(P.seaLantern.name);
      }
    }
  });

  test("NEGATIVE: hits no builds", () => {
    // The other half of the sentence, and the one that was broken: this file
    // runs *after* the castle and the portal lobby, so every block it writes is
    // a subtraction from work that already exists.
    //
    // Three things own blocks below the surface in this world, and all three
    // are asserted here rather than assumed: the castle's ground plate (solid
    // at y46 across its whole footprint), the causeway's arch piers (the one
    // piece of the castle that reaches *under* its own floor), and the portal
    // lobby next door, whose substructure reaches y18.
    const world = generateWorld();
    const { x: cx, z: cz } = PORTAL_CENTRE;

    // 1. The castle's plate: intact everywhere under the undercroft, except the
    //    stair the entrance is cut for - which is 3 wide and 13 deep, and
    //    nothing else.
    const holes: string[] = [];
    for (let z = UNDERCROFT_BOUNDS.z1; z <= UNDERCROFT_BOUNDS.z2; z++) {
      for (let x = UNDERCROFT_BOUNDS.x1; x <= UNDERCROFT_BOUNDS.x2; x++) {
        if (!solid(world, x, CASTLE_LEVEL, z)) holes.push(`${x},${z}`);
      }
    }
    expect(
      holes.length,
      `the undercroft has taken ${holes.length} holes out of the castle's own floor - ${holes.slice(0, 8).join(" ")}`,
    ).toBeLessThanOrEqual(41);

    // 2. The height map: the castle is still standing on its own ground, and
    //    the undercroft did not rewrite the ground under it as y4.
    let sunk = 0;
    for (let z = UNDERCROFT_BOUNDS.z1; z <= UNDERCROFT_BOUNDS.z2; z++) {
      for (let x = UNDERCROFT_BOUNDS.x1; x <= UNDERCROFT_BOUNDS.x2; x++) {
        if (world.surfaceAt(x, z) < CASTLE_LEVEL - 2) sunk++;
      }
    }
    expect(sunk, "the castle's ground plate has been taken out from under it").toBe(0);

    // 3. The causeway's arches, which stand on the only piers the castle has
    //    below its own floor.
    for (const px of [-208, -200]) {
      expect(solid(world, px, 40, 133), `the causeway's arch pier at x${px} is gone`).toBe(true);
    }

    // 4. The portal lobby next door: untouched, floor and all.
    const lobby = LANDMARKS.portalLobby.center;
    expect(solid(world, lobby.x, CASTLE_LEVEL, lobby.z), "the portal lobby's floor is gone").toBe(true);
    expect(world.surfaceAt(lobby.x, lobby.z), "the portal lobby's ground has moved").toBe(CASTLE_LEVEL);
    let lobbyFloor = 0;
    for (let z = lobby.z - 10; z <= lobby.z + 10; z++) {
      for (let x = lobby.x - 10; x <= lobby.x + 10; x++) if (solid(world, x, CASTLE_LEVEL, z)) lobbyFloor++;
    }
    expect(lobbyFloor, "the portal lobby's court should still be paved").toBeGreaterThan(300);

    // 5. And the rule that keeps 1-4 true: the undercroft's ceiling is a
    //    constant, and it is a course below the castle's own plate.
    expect(UNDERCROFT.ceiling, "the undercroft's ceiling must stay under the castle's plate").toBeLessThan(
      CASTLE_LEVEL,
    );
    // The forecourt is still paved, and the great hall still has a floor over
    // the stair it opens.
    expect(solid(world, cx, CASTLE_LEVEL, cz), "the forecourt should still be paved").toBe(true);
    expect(
      solid(world, UNDERCROFT_ENTRANCE.x, CASTLE_LEVEL + 1, UNDERCROFT_ENTRANCE.z + 4),
      "the great hall's floor should be open where the stair goes down",
    ).toBe(false);
  });
});
