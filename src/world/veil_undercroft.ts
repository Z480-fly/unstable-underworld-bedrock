/**
 * The Veil Castle's undercroft: a second, much larger Eye castle, underground.
 *
 * The request was "an underground area for the castle, eye style, same style of
 * castle... Make sure you hit no builds - but is it underground? Make it big."
 *
 * Four things in that sentence pull in different directions, and they are worth
 * separating because they are not all the same requirement:
 *
 *  1. **It has to actually be underground.** Not a basement under the existing
 *     hall - a castle that starts below the plate and is reached by going down.
 *     It is reached by a switchback stair cut out of the great hall's own floor,
 *     and it runs from y45 down to y4.
 *
 *  2. **It has to be the same castle.** Same masonry, same carpets, same
 *     colonnades, same eyes - so `veil_castle.ts`'s palette constants and
 *     `eyeMosaic` are imported rather than reinvented. A second castle that
 *     looks like a different building is two buildings, and the request was
 *     for one castle with a lower half.
 *
 *  3. **It has to be big.** Wider than the surface palace (41x71) in both
 *     directions: 65x69 of floor over three storeys, every one of them a hall
 *     you can walk the length of.
 *
 *  4. **And it must hit no builds.** This is the constraint that shapes every
 *     number in `UNDERCROFT`, so it is worth being explicit about what it
 *     excludes. The undercroft is built *after* the surface castle and the
 *     portal lobby, so everything it writes is a subtraction from work that
 *     already exists. Three things in this world own blocks below y46:
 *
 *       - the **castle**: its ground plate. `pad` fills the whole footprint to
 *         `LEVEL` and stamps land, so y46 is solid ground from x -195 to -127
 *         and z 92 to 174. Everything the castle stands on - the hall floor, the
 *         palace, the forecourt - is at y46 and above.
 *       - the **causeway's arch piers**: the bridge west to the portal lobby is
 *         carried on piers at x -208 and -200, z 130-136, filled from the ground
 *         up to y45. This is the one piece of the castle that reaches *below*
 *         its own floor, and it is the reason the west edge of the undercroft
 *         stops at x -193 rather than running out to the lobby.
 *       - the **portal lobby**: x -231 to -211, whose substructure reaches y18.
 *
 *     So the footprint is inset inside the castle's own pad, every write is
 *     capped at `UNDERCROFT.ceiling` (y45, one under the plate), and the
 *     heightmap is left alone. The first version of this file cleared y5 to y54
 *     over 97x97 and called `setSurface(x, z, 5)` on every cell: it took the
 *     castle's floor out from under itself, cut the lobby in half, and told the
 *     heightmap the ground was at y5 - which is what made the landmark test
 *     report that the castle was standing on air.
 */
import { P, AIR, type BlockState } from "./blocks.ts";
import { LANDMARKS } from "./layout.ts";
import { hash2 } from "./noise.ts";
import type { World } from "./world.ts";
import { eyeMosaic, VEIL_COURT, LEVEL as CASTLE_LEVEL } from "./veil_castle.ts";

/** The centre line the whole undercroft is laid out on. */
const CZ = VEIL_COURT.z;

/**
 * The block the portal ring is built from.
 *
 * Bedrock 1.26.51 has no `minecraft:nether_portal_frame` - the palette
 * validator rejects the name outright, because the block does not exist - so
 * the frame is crying obsidian: the block a nether portal is actually made of,
 * in the Nether family, which is what the request was reaching for.
 */
export const PORTAL_FRAME: BlockState = P.cryingObsidian;

/** The same masonry the surface castle is built from. */
const PALE: BlockState = P.smoothQuartz;
const PALE_PLAIN: BlockState = P.quartz;
const PALE_TRIM: BlockState = P.chiseledQuartz;
const WARM: BlockState = P.smoothSandstone;
const WARM_TRIM: BlockState = P.chiseledSandstone;
const CARPET: BlockState = P.purpleConcrete;
const CARPET_EDGE: BlockState = P.magentaConcrete;
const ROOF: BlockState = P.blueConcrete;
const ROOF_LIGHT: BlockState = P.lightBlueConcrete;

/**
 * The undercroft's footprint and levels.
 *
 * The bounds are inset inside the surface castle's own ground plate rather than
 * centred on `VEIL_COURT`, and that is the whole of "hit no builds":
 *
 *  - **x -193..-129.** The castle's pad runs to x -127 and its ramp to -123, so
 *    every column here has the castle's floor slab at y46 over it and nothing
 *    of the castle's own below it. The causeway piers are at x -208 and -200,
 *    a clear six blocks west of this edge, so the bridge keeps its arches.
 *  - **z 99..167.** Inside the pad's z 92..174 with room to spare, and clear
 *    of the great hall's own staircases below it (which are at y47 and above).
 *
 * 65 by 69 over three storeys is bigger than the surface palace in both
 * directions, which is what "make it big" asked for, and it is as big as it
 * can honestly be without reaching out under the causeway.
 */
export const UNDERCROFT = {
  x1: -193,
  x2: -129,
  z1: 99,
  z2: 167,
  /**
   * The highest this file is allowed to write. The surface castle's ground
   * plate is y46, so y45 is the last course that can be touched without
   * touching the castle itself.
   */
  ceiling: CASTLE_LEVEL - 1,
  /** The three hall floors, 14 apart, with a vault's worth of headroom each. */
  floors: [33, 19, 5],
  /** Floor-to-springing height of a hall. */
  height: 8,
  /** How far the vault rises above the springing, over the centre of the floor. */
  rise: 4,
  /** How far the rock has to be cut for the whole thing. */
  floorOfExcavation: 4,
  /** The portal chamber is the middle of the deepest hall, this many blocks out. */
  chamberRadius: 18,
  /**
   * The head of the stair down from the great hall, in the hall's own
   * coordinates: three wide in the nave, north of the carpet axis so the aisle
   * from the gate to the dais is not cut in half by it.
   */
  entrance: { x: -164, z: 114 },
  /** The undercroft's own stair between halls, east of centre and clear of the galleries. */
  stairX: -145,
  /** ...starting this far north of the centre line. */
  stairZ: CZ - 20,
  /** The deepest hall's floor, which is also the portal chamber's floor. */
  deepest: 5,
} as const;

/** The centre of the footprint: the same spot the halls are laid out around. */
const CX = Math.round((UNDERCROFT.x1 + UNDERCROFT.x2) / 2);

const x1 = UNDERCROFT.x1;
const x2 = UNDERCROFT.x2;
const z1 = UNDERCROFT.z1;
const z2 = UNDERCROFT.z2;

/** Deterministic per-cell pick, so the mosaic is the same mural every build. */
function mosaicCell(x: number, y: number, z: number, seed: number): BlockState {
  const h = hash2(x * 31 + y, z * 17 + seed, seed + 3);
  return h < 0.34 ? P.greenGlass : h < 0.67 ? P.limeGlass : P.cyanGlass;
}

/**
 * Cut the void the castle occupies.
 *
 * This has to run *first* and it has to clear the full column, because the
 * ground under this footprint is solid rock from y20 up to the castle's plate at
 * y46. Filling in a hall afterwards would just draw it on top of the rock, and
 * the player would find a sealed room with a stone ceiling a block above their
 * head.
 *
 * Two things it must not do, both of which the first version did:
 *
 *  - **Nothing above `UNDERCROFT.ceiling`.** The surface castle is already
 *    standing here. Clearing to y54 took its floor out from under itself.
 *  - **Nothing to the heightmap.** `setSurface` is how `pad` told the world the
 *    ground was at y46; overwriting it with 5 said the castle was on air, and
 *    every landmark test that asks "is this on solid land" then failed.
 */
function excavate(world: World): void {
  for (let z = z1; z <= z2; z++) {
    for (let x = x1; x <= x2; x++) {
      if (!world.inRealm(x, z)) continue;
      for (let y = UNDERCROFT.floorOfExcavation; y <= UNDERCROFT.ceiling; y++) {
        world.set(x, y, z, AIR);
      }
      world.setLand(x, z, true);
      // The whole footprint is claimed: nothing may scatter rubble into a
      // castle that is 65 blocks across and 42 deep.
      world.protect(x, z);
    }
  }
}

/** The rock shell around the excavation, so it reads as carved, not floating. */
function shell(world: World): void {
  for (let z = z1 - 1; z <= z2 + 1; z++) {
    for (let x = x1 - 1; x <= x2 + 1; x++) {
      if (x > x1 - 1 && x < x2 + 1 && z > z1 - 1 && z < z2 + 1) continue;
      if (!world.inRealm(x, z)) continue;
      for (let y = UNDERCROFT.floorOfExcavation; y <= UNDERCROFT.ceiling; y++) {
        world.set(x, y, z, P.deepslate);
      }
    }
  }
  // A lip of rock all the way round the top, so the vault dies into the
  // castle's own foundation instead of stopping at a line.
  for (let z = z1; z <= z2; z++) {
    for (const x of [x1, x2]) {
      world.set(x, UNDERCROFT.ceiling, z, P.chiseledDeepslate);
      world.set(x, UNDERCROFT.ceiling - 1, z, P.deepslateTiles);
    }
  }
  for (let x = x1; x <= x2; x++) {
    for (const z of [z1, z2]) {
      world.set(x, UNDERCROFT.ceiling, z, P.chiseledDeepslate);
      world.set(x, UNDERCROFT.ceiling - 1, z, P.deepslateTiles);
    }
  }
}

/** One hall floor: slab, laid pattern, carpet axes, and an eye at each end. */
function hallFloor(world: World, y: number, seed: number): void {
  for (let z = z1 + 1; z <= z2 - 1; z++) {
    for (let x = x1 + 1; x <= x2 - 1; x++) {
      const edge = x === x1 + 1 || x === x2 - 1 || z === z1 + 1 || z === z2 - 1;
      const onAxis = Math.abs(x - CX) <= 2 || Math.abs(z - CZ) <= 2;
      world.set(
        x,
        y,
        z,
        edge
          ? WARM_TRIM
          : onAxis
            ? Math.abs(x - CX) === 2 || Math.abs(z - CZ) === 2
              ? CARPET_EDGE
              : CARPET
            : (x + z) % 2 === 0
              ? PALE
              : PALE_PLAIN,
      );
    }
  }
  // A ring of glass in the floor at the half-way mark, so each hall has a
  // centre as well as an axis.
  for (let dz = -9; dz <= 9; dz++) {
    for (let dx = -9; dx <= 9; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > 9.2 || d < 6.4) continue;
      world.set(CX + dx, y, CZ + dz, mosaicCell(CX + dx, y, CZ + dz, seed));
    }
  }
}

/**
 * A colonnade down both sides of a hall, and a barrel vault over it.
 *
 * The vault's rise is taken from the distance to the *centre* of the floor, so
 * the ceiling is highest down the middle of the hall - the shape of the great
 * vaults in the reference photographs. (Taking it from the distance to the
 * nearest *edge*, which is what this function did at first, builds the same
 * barrel upside down: a funnel with its lowest point over the middle of the
 * room.)
 *
 * The crown is clipped to `UNDERCROFT.ceiling`, because for the topmost hall
 * that crown is one block under the surface castle's own floor slab and an
 * unclipped vault goes straight through it.
 */
function hallShell(world: World, y: number, height: number, rise: number): void {
  // Piers, two deep, every 10 blocks.
  for (const px of [CX - 26, CX - 9, CX + 9, CX + 26]) {
    for (let z = z1 + 6; z <= z2 - 6; z += 10) {
      for (let h = 1; h <= height - 2; h++) {
        world.set(px, y + h, z, h === 1 || h === height - 2 ? WARM_TRIM : h % 5 === 0 ? WARM : PALE);
      }
      world.set(px, y + height - 2, z, P.seaLantern);
    }
  }
  // The vault: solid fill from the springing, rising toward the centre.
  for (let z = z1; z <= z2; z++) {
    for (let x = x1; x <= x2; x++) {
      const over = rise - Math.abs(x - CX);
      const top = Math.min(y + height + Math.max(0, over), UNDERCROFT.ceiling);
      for (let yy = y + height; yy <= top; yy++) {
        const rafter = (x + z) % 4 === 0;
        world.set(x, yy, z, rafter ? WARM : ROOF_LIGHT);
      }
      // The mandala, in the vault's own surface, as the surface hall does it.
      const d = Math.hypot((x - CX) / 22, (z - CZ) / 22) * 22;
      if (d > 22) continue;
      const ring = d < 5 ? P.blackGlass : d < 10 ? P.greenGlass : d < 15 ? P.cyanGlass : P.whiteGlass;
      const spoke = Math.floor((Math.atan2(z - CZ, x - CX) + Math.PI) / (Math.PI / 8)) % 2;
      world.set(x, top, z, spoke === 0 && d > 5 ? WARM : ring);
    }
  }
}

/** Chandeliers on chains, hung from the crown of the vault. */
function chandeliers(world: World, y: number, top: number, zs: number[]): void {
  for (const z of zs) {
    world.set(CX, top, z, P.chain);
    for (let i = 1; i <= 3; i++) world.set(CX, top - i, z, P.chain);
    world.disc(CX, z, 2, top - 4, WARM_TRIM);
    world.set(CX, top - 5, z, P.glowstone);
    for (const [dx, dz] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ] as const) {
      world.set(CX + dx, top - 4, z + dz, P.seaLantern);
    }
  }
}

/**
 * The eyes, one big one on each wall of every hall.
 *
 * These are the castle's signature and the request was explicitly "eye style",
 * so every undercroft hall carries four - one per wall, facing in - the same
 * `eyeMosaic` the surface facade uses, at the surface hall's largest scale.
 *
 * They are half-height 4 rather than 5 for a reason that is not artistic: the
 * mosaic reaches two blocks past its own half-height for the stone socket, so
 * a taller eye on the topmost hall is a course or two above y45 - that is, up
 * inside the surface castle's floor.
 */
function hallEyes(world: World, y: number, seed: number): void {
  const cy = y + 6;
  // North and south walls.
  for (const [z, seedAt] of [
    [z1 + 1, 1],
    [z2 - 1, 2],
  ] as const) {
    eyeMosaic(world, CX, cy, z, 7, 4, "xy", seed + seedAt);
  }
  // West and east walls.
  for (const [x, seedAt] of [
    [x1 + 1, 3],
    [x2 - 1, 4],
  ] as const) {
    eyeMosaic(world, x, cy, CZ, 7, 4, "zy", seed + seedAt);
  }
}

/**
 * The grand stair down the spine, from one floor to the next.
 *
 * One straight run of steps, three wide, with a landing half way down, and the
 * next flight below it running back the other way in the same shaft - so the
 * bottom step of one flight *is* the top step of the one under it, and the
 * whole descent is one staircase folded in half rather than three flights with
 * a floor to cross between them.
 *
 * Every step clears the blocks above itself. That is not decoration: the floor
 * is a solid 63x67 slab, and a flight that starts at floor level and runs
 * *downward* immediately passes underneath it, so the slab roofs over every
 * step after the first and the stairs are a sealed trench.
 */
function descent(
  world: World,
  yTop: number,
  yBottom: number,
  runX: number,
  zStart: number,
  dir: 1 | -1,
  opts: { carpet?: boolean; newels?: boolean } = {},
): void {
  const drop = yTop - yBottom;
  if (drop < 2) return;
  const landing = Math.ceil(drop / 2);

  for (let i = 0; i <= drop; i++) {
    const y = yTop - i;
    const z = zStart + dir * i;
    // The landing is the one step that is five wide instead of three: an
    // alcove in the side of the flight, with the stair carried on its own
    // stringer either side of it.
    const half = i === landing ? 2 : 1;
    for (let w = -half; w <= half; w++) {
      const block =
        Math.abs(w) === half
          ? WARM_TRIM
          : opts.carpet && w === 0
            ? CARPET
            : (w + i) % 2 === 0
              ? PALE
              : PALE_PLAIN;
      world.set(runX + w, y, z, block);
    }
    if (i % 4 === 0) world.set(runX, y + 2, z, P.seaLantern);
    // Headroom above this tread, up to and including the floor the flight
    // starts from: that course is the lid over every step after the first.
    for (let w = -half; w <= half; w++) {
      for (let yy = y + 1; yy <= yTop; yy++) world.set(runX + w, yy, z, AIR);
    }
  }

  // Newel posts and lamps at the head and the foot of the flight.
  //
  // Beside the flight, never on its approach. A post one block off the top
  // tread is a wall across the only way onto the stairs. These go *past* the
  // outer edge of the run, where they mark the head of the flight without
  // standing in it.
  if (opts.newels === false) return;
  for (const [x, z, y] of [
    [runX - 2, zStart - dir, yTop],
    [runX - 2, zStart + dir * (drop + 1), yBottom],
  ] as const) {
    for (let h = 1; h <= 4; h++) world.set(x, y + h, z, P.darkOakLog);
    world.set(x, y + 5, z, P.seaLantern);
  }
}

/**
 * The portal chamber: the bottom of the whole thing, and the deepest hall.
 *
 * The request is specific - "at the bottom of it put an end portal, but instead
 * of an end frame it's a nether portal frame, but it's like in the way an end
 * frame would go."
 *
 * An end portal frame is a 3x3 ring of frame blocks lying flat in the floor with
 * the portal in the middle. So this is a 3x3 ring of **nether portal frame**
 * lying flat, the same way up, with a lit nether portal standing in the middle
 * of it, set into the compass of the deepest hall.
 *
 * Bedrock has no `minecraft:nether_portal_frame` block - the palette validator
 * rejects the name outright, because the block does not exist in 1.26.51 - so
 * the ring is crying obsidian, which is what a nether portal is actually built
 * from, and the centre carries `minecraft:portal`, the nether portal's own
 * surface block. The portal is a *working* one, not a picture of one: obsidian
 * or crying obsidian underneath, air above, and it lights the chamber.
 *
 * The chamber is the middle of the deepest hall rather than a room below it,
 * because there is nowhere below it to put one - the void starts at about y20 -
 * and because a room the size of this one that is *under* the hall it belongs
 * to needs a stair through the hall's own floor to reach.
 */
function portalChamber(world: World, y: number): void {
  const r = UNDERCROFT.chamberRadius;

  // The chamber's own volume, cleared before anything is drawn in it: the
  // deepest hall's vault springs at y+8 and this room is taller than that.
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = CX + dx;
      const z = CZ + dz;
      if (!world.inRealm(x, z)) continue;
      for (let yy = y + 1; yy <= y + 12; yy++) world.set(x, yy, z, AIR);
    }
  }

  // A flat glazed ceiling, because the hall's own vault has just been taken out
  // over the middle of the room and a chamber twelve blocks tall wants a lid.
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = CX + dx;
      const z = CZ + dz;
      const d = Math.hypot(dx, dz);
      world.set(x, y + 12, z, d < 4 ? P.blackGlass : d < 8 ? P.greenGlass : (x + z) % 2 === 0 ? ROOF : ROOF_LIGHT);
    }
  }

  // The chamber floor: the compass octagon in the middle, and a pavement of
  // the same warm stone all the way out to the edge of the cleared square, so
  // the room reads as a floor and not as an island.
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dz);
      let block: BlockState;
      if (d < 2.6) block = P.blackGlass;
      else if (d < 4.4) block = P.greenGlass;
      else if (d < 6.2) block = P.cyanGlass;
      else if (d < 8) block = P.whiteGlass;
      else if (d < 12) block = (dx + dz) % 2 === 0 ? PALE : PALE_PLAIN;
      else if (d < 16) block = WARM;
      else if (d <= 17.2) block = WARM_TRIM;
      else block = (dx + dz) % 2 === 0 ? WARM : WARM_TRIM;
      world.set(CX + dx, y, CZ + dz, block);
    }
  }

  // The frame: a 3x3 ring of nether portal frame lying flat in the floor, with
  // the lit portal in the middle - the way an end frame goes.
  //
  // Flat in the floor, not standing on it. A frame block is a full block, and
  // an end portal frame is set *into* the floor with the portal in its middle
  // cell; standing the ring up on the pavement would be three blocks and a
  // fence around a hole.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      world.set(CX + dx, y, CZ + dz, PORTAL_FRAME);
    }
  }
  // ...and the portal standing in it. The cell above is air, so the portal is
  // the two blocks tall a nether portal is.
  world.set(CX, y, CZ, P.portal);
  for (let yy = y + 1; yy <= y + 2; yy++) world.set(CX, yy, CZ, AIR);

  // A kerb of netherite round the frame, so it is not just three blocks in a
  // floor. In the floor, not on it: the whole point of the ring is that you
  // walk round it, and a kerb standing a block proud is a trip hazard.
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) {
      const d = Math.hypot(dx, dz);
      if (d < 2.6 || d > 3.8) continue;
      world.set(CX + dx, y, CZ + dz, P.netheriteBlock);
    }
  }

  // The chamber's back wall: the masonry the great eye is painted on.
  //
  // The eye is a one-block-deep panel, so with the chamber's volume cleared it
  // would hang in mid-air like a sign. Two courses of the castle's own stone,
  // floor to ceiling across the far edge of the room, give it a wall to sit on
  // and the chamber a back. It is the *south* wall, because the stair comes
  // down the north side of the room and a wall there would be in its way.
  for (const dz of [r - 1, r]) {
    for (let dx = -r; dx <= r; dx++) {
      for (let yy = y + 1; yy <= y + 12; yy++) {
        world.set(CX + dx, yy, CZ + dz, yy === y + 1 ? WARM_TRIM : (dx + yy) % 5 === 0 ? WARM : PALE);
      }
    }
  }

  // Four corner posts carrying lamps, after the wall so the south pair are not
  // paved over by it.
  for (const [dx, dz] of [
    [-r + 1, -r + 1],
    [r - 1, -r + 1],
    [-r + 1, r - 1],
    [r - 1, r - 1],
  ] as const) {
    for (let h = 1; h <= 5; h++) world.set(CX + dx, y + h, CZ + dz, P.chiseledDeepslate);
    world.set(CX + dx, y + 6, CZ + dz, P.soulLantern);
  }

  // The great eye on that wall, looking down the room at the portal. The
  // largest in the undercroft: this is the thing all three halls descend to.
  eyeMosaic(world, CX, y + 7, CZ + r - 2, 9, 4, "xy", 0x5e91);

  // Chandeliers over the compass, hung from the flat ceiling.
  chandeliers(world, y + 1, y + 12, [CZ - 10, CZ + 10]);
}

/** Balconies looking into each hall from the side walls, as the surface castle has. */
function galleries(world: World, y: number): void {
  for (const side of [-1, 1]) {
    // Six in from the wall, so the gallery deck does not stand in front of the
    // eye that is painted on it.
    const gx = side === -1 ? x1 + 6 : x2 - 6;
    for (let z = z1 + 4; z <= z2 - 4; z++) {
      // The corbels the balcony is carried on, so it is not a floating shelf.
      if ((z - z1) % 4 === 0) {
        for (let d = 0; d < 3; d++) world.set(gx + side * d, y + 5, z, WARM_TRIM);
      }
      for (let d = 0; d < 3; d++) {
        world.set(gx + side * d, y + 6, z, (z + d) % 2 === 0 ? P.darkOakPlanks : P.sprucePlanks);
      }
      // Rail on the nave side, with a gap every sixth bay.
      if ((z - z1) % 6 !== 3) world.set(gx - side * 1, y + 7, z, P.darkOakFence);
    }
  }
}

/**
 * The way in: the stair from the surface castle's great hall.
 *
 * "An underground area for the castle" is not an underground area if the only
 * way into it is a hole in the floor of a room you cannot get out of, so the
 * great hall's own paving is opened and a switchback runs down out of it into
 * the topmost undercroft hall.
 *
 * It is cut in the nave north of the carpet axis, three wide, clear of the
 * colonnade, the pews, the dais and both of the hall's own gallery stairs -
 * and it is built *last*, after the halls, because the top hall's own floor
 * slab is at y33 and would otherwise be laid straight over the bottom of it.
 */
function hallEntrance(world: World): void {
  const { x, z } = UNDERCROFT.entrance;
  descent(world, CASTLE_LEVEL, UNDERCROFT.floors[0]!, x, z, 1, { carpet: true, newels: false });

  // The trench's own sides, railed from the great hall's floor so the opening
  // reads as a stair and not as a hole. Outboard of the flight, so nothing
  // stands on a tread, and only along the cells the flight actually opens.
  for (let dz = 1; dz <= CASTLE_LEVEL - UNDERCROFT.floors[0]!; dz++) {
    for (const side of [-1, 3] as const) {
      const rx = x + side;
      world.set(rx, CASTLE_LEVEL + 1, z + dz, (z + dz) % 6 === 0 ? WARM_TRIM : P.darkOakFence);
      if ((z + dz) % 6 === 0) world.set(rx, CASTLE_LEVEL + 2, z + dz, P.seaLantern);
    }
  }
  // A newel at the head of the flight and one at the foot, marking it from the
  // far end of the hall. Both stand on the paving beside the opening, on the
  // east side: the west side is where the hall's own gallery stair lands.
  for (const [nx, nz] of [
    [x + 3, z - 1],
    [x + 3, z + CASTLE_LEVEL - UNDERCROFT.floors[0]! + 1],
  ] as const) {
    for (let h = 1; h <= 4; h++) world.set(nx, CASTLE_LEVEL + h, nz, P.darkOakLog);
    world.set(nx, CASTLE_LEVEL + 5, nz, P.seaLantern);
  }
  // And the great eye over the head of the stair, on the hall's own north wall,
  // so the way down is the one the castle is watching.
  eyeMosaic(world, x + 1, CASTLE_LEVEL + 8, z - 2, 6, 4, "xy", 0x5e31);
}

/**
 * Build the whole undercroft.
 *
 * Order matters and is the same order the surface castle uses: excavate, shell,
 * then build downward from the top, so each hall is finished before the one
 * below it is cut into.
 */
export function buildVeilUndercroft(world: World): void {
  excavate(world);
  shell(world);

  // Two passes over the halls, then one over the flights.
  //
  // Every hall is built first, then every flight. A flight lands *on* the next
  // hall's floor slab, so a flight built before that slab exists is simply
  // paved over by it - the bottom step disappears under a floor and the run
  // ends in a wall. Building all the halls and then all the flights means each
  // stairwell is cut through masonry that is already there.
  UNDERCROFT.floors.forEach((y, i) => {
    const { height, rise } = UNDERCROFT;
    // Clear the hall's volume FIRST, then furnish it. Doing it the other way
    // round - build the floor, vault and eyes, then clear - wipes everything
    // that was just drawn and leaves solid blocks of rock where the halls
    // should be. The excavation above only clears to `ceiling`, so each
    // successive floor down still has the *previous* floor's slab in its way.
    for (let z = z1 + 1; z <= z2 - 1; z++) {
      for (let x = x1 + 1; x <= x2 - 1; x++) {
        for (let yy = y + 1; yy <= y + height - 1; yy++) world.set(x, yy, z, AIR);
      }
    }
    hallFloor(world, y, 0x5e80 + i);
    hallShell(world, y, height, rise);
    hallEyes(world, y, 0x5e80 + i);
    galleries(world, y);
    chandeliers(world, y, Math.min(y + height + rise, UNDERCROFT.ceiling), [CZ - 30, CZ, CZ + 30]);
  });

  // The deepest hall's middle is the portal chamber, and it is cut *before* the
  // flights: it clears a 37x37 column twelve blocks tall, and the flight that
  // lands in it is at the edge of that square.
  const deepest = UNDERCROFT.deepest;
  portalChamber(world, deepest);

  // The flights, each one running back the other way in the same shaft, so the
  // bottom step of one is the top step of the next and the descent is one
  // staircase folded in half. Every hall is already built by this point, so
  // each flight cuts its own shaft through masonry that is standing there.
  for (let i = 0; i < UNDERCROFT.floors.length - 1; i++) {
    descent(
      world,
      UNDERCROFT.floors[i]!,
      UNDERCROFT.floors[i + 1]!,
      UNDERCROFT.stairX,
      UNDERCROFT.stairZ,
      i % 2 === 0 ? 1 : -1,
    );
  }

  // The way in from the castle above, last of all, so the top hall's floor
  // cannot be laid over the bottom of the flight.
  hallEntrance(world);

  world.protect(CX, CZ, 0);
}

/** The undercroft's bounding box, for the docs and the map tool. */
export const UNDERCROFT_BOUNDS = { x1, x2, z1, z2 } as const;

/** The centre of the portal, in the floor of the deepest hall. */
export const PORTAL_CENTRE = { x: CX, y: UNDERCROFT.deepest, z: CZ } as const;

/** The head of the stair down from the great hall, for the map tool. */
export const UNDERCROFT_ENTRANCE = {
  x: UNDERCROFT.entrance.x,
  y: CASTLE_LEVEL,
  z: UNDERCROFT.entrance.z,
} as const;

/** True when (x, z) is inside the undercroft's footprint. */
export function inUndercroft(x: number, z: number): boolean {
  return x >= x1 && x <= x2 && z >= z1 && z <= z2;
}

/** Re-exported so callers do not have to reach into veil_castle for the axis. */
export const UNDERCROFT_AXIS = LANDMARKS.veilCastle.center;
