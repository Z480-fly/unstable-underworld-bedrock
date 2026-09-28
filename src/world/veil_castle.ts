/**
 * The Veil Castle.
 *
 * The one place in the Underworld that is *pale*. Every other landmark in this
 * map is built out of the canon palette - "almost everything is gray or black,
 * with really the only vibrant color being the green visible on some
 * structures" (Soul Keepers) - and the reference castle is the exception that
 * shows the canon line was a description of the ruins rather than a law: a
 * quartz and sandstone palace with blue and teal roofs, a facade hung with big
 * circular green-glass roundels, reached up a purple-carpeted causeway.
 *
 * Sited from the placement screenshot, `Position: -179, 46, 133`, which reads
 * as a broad paved plaza. So the plaza *is* the forecourt: the castle's great
 * gate faces west across it and the body runs east from there.
 *
 *     x -211..-199  the causeway west to the portal lobby, on its arches
 *     x -199..-179  the forecourt plaza   <- (-179, 133), the placement point
 *     x -179..-171  the gatehouse: two towers and the arch between them
 *     x -171..-131  the palace: curtain wall, great hall, dome, two wings
 *
 * The height budget matters more than the width. The build ceiling is y=127 and
 * the sky canopy hangs at y92-116, so the drum is carried to y84 and the dome
 * to y104: the dome deliberately pushes *into* the canopy band, because a
 * castle whose spires stop below the glass reads as a model of a castle rather
 * than as one.
 */
import { AIR, P, type BlockState } from "./blocks.ts";
import { hash2 } from "./noise.ts";
import { LANDMARKS } from "./layout.ts";
import { pad } from "./structures.ts";
import type { World } from "./world.ts";

/** The pale masonry the reference is built from. */
const PALE: BlockState = P.smoothQuartz;
const PALE_PLAIN: BlockState = P.quartz;
const PALE_TRIM: BlockState = P.chiseledQuartz;
const WARM: BlockState = P.smoothSandstone;
const WARM_PLAIN: BlockState = P.sandstone;
const WARM_TRIM: BlockState = P.chiseledSandstone;
/** Roofs: a deep blue, a paler blue on the small spires, green on the dome. */
const ROOF: BlockState = P.blueConcrete;
const ROOF_LIGHT: BlockState = P.lightBlueConcrete;
const ROOF_GREEN: BlockState = P.cyanConcrete;
/** The purple carpet of the approach, and the green of the roundels. */
const CARPET: BlockState = P.purpleConcrete;
const CARPET_EDGE: BlockState = P.magentaConcrete;
const ROUNDEL: BlockState[] = [P.greenGlass, P.limeGlass, P.cyanGlass, P.greenGlass];

/** Plaza level. Everything is measured up from here. */
const LEVEL = 46;

/** The forecourt centre, from the placement screenshot. */
export const VEIL_COURT = { x: -179, z: 133 } as const;

/**
 * The causeway west to the portal lobby, and the gate line.
 *
 * `CAUSEWAY_X1` is the lobby's own east wall, so the deck starts at the door
 * rather than running through it; `CAUSEWAY_X2` is where the castle's `pad`
 * ramp begins, so the two surfaces meet on one block rather than leaving a
 * step in the middle of the approach.
 */
const CAUSEWAY_X1 = -211;
const CAUSEWAY_X2 = -199;
const GATE_X = -179;

/** The palace proper. */
const PALACE_X1 = -171;
const PALACE_X2 = -131;
const PALACE_Z1 = 98;
const PALACE_Z2 = 168;

/** The great hall, and the drum that carries the dome. */
const HALL_X1 = -169;
const HALL_X2 = -155;
const HALL_Z1 = 112;
const HALL_Z2 = 154;
const DRUM = { x: -146, z: 133, radius: 9 };
const DRUM_TOP = LEVEL + 38;
const DOME_TOP = LEVEL + 58;

/** Deterministic per-cell pick, so an iris is the same mural every build. */
function roundelCell(x: number, y: number, z: number, seed: number): BlockState {
  return ROUNDEL[Math.floor(hash2(x * 7 + z, y * 131 + seed, seed * 7 + 3) * ROUNDEL.length) % ROUNDEL.length]!;
}

/** Which way round an eye is drawn. `xz` is an eye laid flat in the floor. */
type EyePlane = "xy" | "zy" | "xz";

/** (u, v) in the eye's own plane to a world coordinate. */
function eyePoint(plane: EyePlane, cx: number, cy: number, cz: number, u: number, v: number): [number, number, number] {
  switch (plane) {
    case "xy":
      return [cx + u, cy + v, cz];
    case "zy":
      return [cx, cy + v, cz + u];
    case "xz":
      return [cx + u, cy, cz + v];
  }
}

/**
 * An eye.
 *
 * The reference castle is hung with big circular green medallions, and on a
 * closer look those are not medallions - they are eyes. That is the design
 * language the whole building runs on: a pale wall that is *watching* you, with
 * a round green iris set in a stone socket. Getting this wrong is the single
 * easiest way to build the wrong castle, so the shape is an **almond** and not
 * a disc: the lids have to meet in a point at each corner, because a circle in
 * a stone ring is a rose window and a circle with a pupil is a face.
 *
 * Three bands, outside in: the stone surround, the sclera, the iris with a
 * black pupil, and a lit catchlight up and to the left - which is what makes
 * it read as a *glance* rather than as a painting of one.
 *
 * It is drawn into whatever wall is already there rather than built as a
 * separate panel, so the same call works on the great hall's face, over the
 * gate, and flat on the plaza.
 */
export function eyeMosaic(
  world: World,
  cx: number,
  cy: number,
  cz: number,
  halfW: number,
  halfH: number,
  plane: EyePlane,
  seed: number,
): void {
  for (let u = -halfW - 2; u <= halfW + 2; u++) {
    for (let v = -halfH - 2; v <= halfH + 2; v++) {
      const t = Math.abs(u) / halfW;
      // The lid line. `1 - t^1.8` meets the axis at the corners instead of
      // curving round them, which is the whole difference between an eye and
      // a porthole.
      const lid = halfH * (1 - Math.pow(t, 1.8));
      let block: BlockState | null = null;
      if (Math.abs(v) <= lid) {
        // The iris is a circle in a wide almond, so it reads as a lens seen
        // from the front rather than as a scaled-down copy of the lid.
        const r = Math.hypot(u * 0.52, v);
        if (r < halfH * 0.3) block = P.blackGlass;
        else if (r < halfH * 0.52) block = roundelCell(...eyePoint(plane, cx, cy, cz, u, v), seed);
        else block = P.whiteGlass;
        // The catchlight: a sea lantern, so the eye catches light at night
        // instead of going dark with the rest of the facade.
        if (u < -halfW * 0.3 && u > -halfW * 0.62 && v < -halfH * 0.18 && v > -halfH * 0.5) {
          block = P.seaLantern;
        }
      } else if (Math.hypot(u / (halfW + 1.6), v / (halfH + 1.6)) <= 1) {
        block = WARM_TRIM; // the stone socket the eye sits in
      }
      if (!block) continue;
      const [x, y, z] = eyePoint(plane, cx, cy, cz, u, v);
      world.set(x, y, z, block);
    }
  }
}

/**
 * A chandelier: a chain down from the vault, a netherite ring with sea lanterns
 * on its corners and a glowstone in the middle.
 *
 * Every room in the castle is lit by these. The facade glazing is decorative -
 * it is a landmark on a closed map and there is no sky above it - so without
 * them the inside of the Veil Castle is a dark box with a green floor.
 */
function chandelier(world: World, x: number, z: number, topY: number, drop: number): void {
  // The chain runs *down* from the vault, and the ring hangs at the bottom of
  // it. `drop` is the number of chain courses, so the lowest chain block is one
  // above the ring.
  const ringY = topY - drop;
  for (let y = topY; y > ringY; y--) world.set(x, y, z, P.chain);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const corner = Math.abs(dx) + Math.abs(dz) === 2;
      world.set(x + dx, ringY, z + dz, corner ? P.seaLantern : P.netheriteBlock);
    }
  }
  world.set(x, ringY - 1, z, P.glowstone);
}

/**
 * A palace spire: a square quartz shaft, a banded cornice, a stepped-in blue
 * roof and a light on the point. The reference has dozens of these at three
 * sizes, and they are most of what makes the silhouette read.
 */
function spire(world: World, cx: number, cz: number, baseY: number, height: number, roof: BlockState = ROOF): void {
  const shaft = height > 26 ? 3 : height > 16 ? 2 : 1;
  const top = baseY + height;
  for (let y = baseY; y <= top; y++) {
    const r = Math.max(0, shaft - (y > baseY + height * 0.72 ? 1 : 0));
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r) continue; // chamfer
        world.set(cx + dx, y, cz + dz, (y - baseY) % 9 === 0 ? WARM_TRIM : y % 2 === 0 ? PALE : PALE_PLAIN);
      }
    }
  }
  const roofBase = top + 1;
  const roofHeight = Math.max(3, height >> 2);
  for (let y = roofBase; y <= roofBase + roofHeight; y++) {
    const r = Math.max(0, shaft - Math.floor((y - roofBase) / 2));
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        world.set(cx + dx, y, cz + dz, y === roofBase + 1 ? ROOF_LIGHT : roof);
      }
    }
  }
  world.set(cx, roofBase + roofHeight + 1, cz, height > 20 ? P.glowstone : P.seaLantern);
}

/**
 * An arcade: a run of pale piers along Z with glazed round-headed arches
 * between them - the ground floor of every wing in the reference.
 *
 * Built as a wall with holes in it rather than as separate piers, so the shell
 * is closed. The openings are filled with pale blue glass rather than left as
 * air: the reference's arcades are glazed, and that glass is what lights the
 * walk behind them.
 */
function arcade(world: World, x: number, z1: number, z2: number, baseY: number, height: number): void {
  const top = baseY + height;
  for (let z = z1; z <= z2; z++) {
    for (let y = baseY; y <= top; y++) {
      const bay = ((z - z1) % 5 + 5) % 5;
      const inBay = bay < 3;
      // The arch head: the middle two blocks of a bay only open below the top
      // two courses, so the opening is round-headed rather than a square hole.
      const headroom = y <= top - 2 ? 2 : 1;
      const open = inBay && bay >= headroom - 1 && bay <= 3 - headroom + 1 && headroom === 2;
      let block: BlockState;
      if (y === top) block = WARM_TRIM;
      else if (y === baseY) block = PALE_PLAIN; // plinth
      else if (open) block = y === top - 1 ? WARM : ROOF_LIGHT;
      else block = (y - baseY) % 4 === 0 ? WARM : PALE;
      world.set(x, y, z, block);
    }
  }
  world.protect(x, Math.round((z1 + z2) / 2), Math.ceil((z2 - z1) / 2) + 2);
}

/**
 * The causeway west from the gate to the portal lobby: a raised sandstone deck
 * with a balustrade either side, purple carpet down the middle, and a run of
 * arches under it.
 *
 * The reference's approach is a long low bridge with the carpet running its
 * whole length, and it is the strongest single piece of composition in the
 * photographs - the thing that makes the castle read as *approached* rather
 * than as *present*.
 */
function causeway(world: World, z1: number, z2: number): void {
  const mid = Math.round((z1 + z2) / 2);
  for (let x = CAUSEWAY_X1; x <= CAUSEWAY_X2; x++) {
    for (let z = z1; z <= z2; z++) {
      // The balustrade: a sandstone rail on posts, one block in from each edge.
      const rail = z === z1 || z === z2 || z === z1 + 1 || z === z2 - 1;
      const post = rail && (x % 4 === 0 || z === z1 || z === z2);
      if (rail) {
        world.set(x, LEVEL, z, post ? WARM_PLAIN : WARM);
        world.set(x, LEVEL + 1, z, post ? WARM_TRIM : WARM_TRIM);
        world.setSurface(x, z, LEVEL + 1);
        world.setLand(x, z, true);
        continue;
      }
      // Carpet down the spine, pale stone either side of it.
      const d = Math.abs(z - mid);
      world.set(x, LEVEL, z, d <= 2 ? (d === 2 ? CARPET_EDGE : CARPET) : d === 3 ? CARPET_EDGE : P.smoothStone);
      world.setSurface(x, z, LEVEL);
      world.setLand(x, z, true);
    }
    // An arch under the deck every eight blocks, springing from the ground: the
    // causeway is a bridge even where the ground happens to be near enough to
    // hide that, and the arches are what you see from the portal lobby.
    if (x % 8 === 0 && x !== CAUSEWAY_X2) {
      for (let z = z1 + 2; z <= z2 - 2; z++) {
        const ground = Math.max(0, world.surfaceAt(x, z));
        for (let y = ground + 1; y <= LEVEL - 1; y++) {
          const ring = z === z1 + 2 || z === z2 - 2;
          world.set(x, y, z, ring ? WARM_TRIM : WARM);
        }
      }
    }
  }
  world.protect(Math.round((CAUSEWAY_X1 + CAUSEWAY_X2) / 2), mid, 24);
}

/**
 * The forecourt: the plaza in the placement screenshot, kept as the one piece
 * of ground the player recognises. Pale stone laid in courses, a purple carpet
 * running east into the gate, and a great green roundel set flat into the
 * paving on axis with it.
 */
function forecourt(world: World, z1: number, z2: number): void {
  const mid = Math.round((z1 + z2) / 2);
  // The roundel first, then the carpet over it. Drawn the other way round - the
  // obvious order - a 17-block medallion sits on top of the axis and cuts the
  // approach into two pieces with a hole where the gate is. The reference runs
  // the carpet straight through the middle of every medallion it passes, so
  // that is what has to happen here: the ring goes down, the carpet goes over.
  for (let dz = -8; dz <= 8; dz++) {
    // The ring starts where the forecourt's own paving starts. Drawn 8 blocks
    // further west it would sit on the causeway, where nothing is laid over it,
    // and the one gap in an otherwise unbroken 30-block purple approach would be
    // two sandstone blocks wide in the middle of a bridge.
    for (let dx = -6; dx <= 8; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > 8.5 || d < 4.5) continue;
      const x = GATE_X - 14 + dx;
      const z = mid + dz;
      let block: BlockState;
      if (d > 7.5) block = WARM_TRIM;
      else if (d > 6) block = WARM;
      else block = roundelCell(x, LEVEL, z, 0x5e11);
      world.set(x, LEVEL, z, block);
    }
  }
  for (let z = z1; z <= z2; z++) {
    for (let x = CAUSEWAY_X2; x <= GATE_X; x++) {
      const d = Math.abs(z - mid);
      // The carpet axis, five wide with a magenta border, running unbroken
      // from the causeway into the gate.
      world.set(x, LEVEL, z, d <= 2 ? (d === 2 ? CARPET_EDGE : CARPET) : d === 3 ? CARPET_EDGE : PALE_PLAIN);
      // A laid-stone pattern: a course line every fourth row, so the plaza has
      // a grain at walking scale rather than reading as one flat sheet.
      if (d > 3 && (x + z) % 4 !== 0) world.set(x, LEVEL, z, P.smoothStone);
    }
  }
  // A second eye, laid flat in the paving north of the axis. It has to be off
  // the carpet: an eye with a purple road run through the middle of it is an
  // eye with a bar across it, and the ring above is a ring, not an eye.
  eyeMosaic(world, GATE_X - 10, LEVEL, mid + 9, 6, 4, "xz", 0x5e71);
  world.protect(GATE_X - 7, mid, 12);
}

/** The gatehouse: two towers and the arch between them, on the castle's axis. */
function gatehouse(world: World, z1: number, z2: number): void {
  const mid = Math.round((z1 + z2) / 2);
  const top = LEVEL + 26;
  for (const tz of [z1 + 2, z2 - 2]) {
    spire(world, GATE_X - 2, tz, LEVEL, 26);
  }
  // The arch: a wall across the axis with a round-headed opening punched in it.
  for (let z = z1; z <= z2; z++) {
    for (let y = LEVEL + 1; y <= top; y++) {
      const inOpening = z >= mid - 3 && z <= mid + 3 && y <= LEVEL + 11;
      if (inOpening) {
        world.set(GATE_X - 2, y, z, AIR);
        continue;
      }
      const archRing = z >= mid - 4 && z <= mid + 4 && y <= LEVEL + 13 && (y - LEVEL) % 3 === 0;
      world.set(GATE_X - 2, y, z, y === top ? WARM_TRIM : archRing ? WARM_TRIM : y % 2 === 0 ? PALE : PALE_PLAIN);
    }
    // A machicolation: the gallery that overhangs the gate.
    world.set(GATE_X - 3, top + 1, z, WARM_TRIM);
    world.set(GATE_X - 2, top + 2, z, z % 3 === 0 ? WARM_PLAIN : AIR);
  }
  // Lamps flanking the opening, so the arch is lit from inside the wall.
  for (const dz of [-4, 4]) {
    world.set(GATE_X - 2, LEVEL + 12, mid + dz, P.seaLantern);
    world.set(GATE_X - 2, LEVEL + 13, mid + dz, P.glowstone);
  }
  // An eye in the face of the gatehouse, over the arch, looking down the
  // causeway at everyone who comes up it. Drawn *here*, after the wall: drawn
  // in `forecourt`, which runs first, the gatehouse simply walls over it.
  eyeMosaic(world, GATE_X - 2, LEVEL + 18, mid, 6, 4, "zy", 0x5e61);
  world.protect(GATE_X - 2, mid, 14);
}

/** The great hall: the tall block immediately behind the gate. */
function greatHall(world: World): void {
  const top = LEVEL + 18;
  // Floor and shell.
  world.fill(HALL_X1, LEVEL, HALL_Z1, HALL_X2, LEVEL, HALL_Z2, P.smoothStone);
  world.fill(HALL_X1 + 1, LEVEL + 1, HALL_Z1 + 1, HALL_X2 - 1, top, HALL_Z2 - 1, AIR);
  for (let z = HALL_Z1; z <= HALL_Z2; z++) {
    for (let y = LEVEL + 1; y <= top; y++) {
      // A tall glazed band between two stone courses: the reference's great
      // windows, and the only daylight this building gets.
      const band = y >= LEVEL + 7 && y <= top - 3;
      const mullion = (y - LEVEL) % 3 === 0 || (z - HALL_Z1) % 4 === 0;
      for (const x of [HALL_X1, HALL_X2]) {
        world.set(x, y, z, y === top ? WARM_TRIM : band && !mullion ? ROOF_LIGHT : PALE);
      }
    }
  }
  for (let x = HALL_X1; x <= HALL_X2; x++) {
    for (let y = LEVEL + 1; y <= top; y++) {
      const band = y >= LEVEL + 7 && y <= top - 3;
      const mullion = (y - LEVEL) % 3 === 0 || (x - HALL_X1) % 4 === 0;
      for (const z of [HALL_Z1, HALL_Z2]) {
        world.set(x, y, z, y === top ? WARM_TRIM : band && !mullion ? ROOF_LIGHT : PALE);
      }
    }
  }
  // A hipped roof, glazed between the rafters, so the hall glows from above.
  for (let z = HALL_Z1; z <= HALL_Z2; z++) {
    for (let x = HALL_X1; x <= HALL_X2; x++) {
      const inset = Math.min(x - HALL_X1, HALL_X2 - x, z - HALL_Z1, HALL_Z2 - z);
      const rise = Math.max(0, 6 - inset);
      for (let y = top + 1; y <= top + 1 + rise; y++) {
        const rafter = inset === 0 || (x + z) % 3 === 0;
        world.set(x, y, z, rafter ? WARM : ROOF_LIGHT);
      }
    }
  }
  // The eyes on the west face, over the axis: the reference hangs them either
  // side of the gate and again on the upper storeys, and they are what makes
  // the approach feel like it is being watched.
  for (const [dz, y, w, h] of [
    // Fourteen either side, not nine: at nine the outer two eyes overlap the
    // great one in the middle and the three of them fight over the same blocks.
    // The hall is 43 long and each eye is 13 wide, so this is the only spacing
    // that fits all three without them touching.
    [-14, LEVEL + 10, 5, 4],
    [0, LEVEL + 14, 6, 5],
    [14, LEVEL + 10, 5, 4],
  ] as const) {
    eyeMosaic(world, HALL_X1, y, HALL_Z1 + 21 + dz, w, h, "zy", 0x5e21 + dz);
  }
  // The doorway, on the axis, tall enough to walk a horse through - and the
  // carpet carried through it and away down the hall, because a purple road
  // that stops at the threshold is not a road.
  for (let y = LEVEL + 1; y <= LEVEL + 5; y++) world.set(HALL_X1, y, HALL_Z1 + 21, AIR);
  world.set(HALL_X1, LEVEL + 6, HALL_Z1 + 21, PALE_TRIM);
  for (let x = HALL_X1; x <= HALL_X2; x++) {
    for (let dz = -2; dz <= 2; dz++) {
      world.set(x, LEVEL, HALL_Z1 + 21 + dz, Math.abs(dz) === 2 ? CARPET_EDGE : CARPET);
    }
  }
  // The dais, the throne and the pews are `furnishHall`'s job, below.
  furnishHall(world);
  world.protect(Math.round((HALL_X1 + HALL_X2) / 2), HALL_Z1 + 21, 24);
}

/**
 * Inside the great hall.
 *
 * The hall is the room a player stands in longest - the carpet runs the whole
 * length of it - so it is the one room that cannot be an empty box: a colonnade
 * down both sides, pews in rows, a dais and a throne at the head, banners
 * between the piers, and three chandeliers on chains. All of it in dark oak
 * against the pale masonry, because that is the contrast the reference is built
 * on and a hall with no furniture in it reads as a corridor with a roof.
 */
function furnishHall(world: World): void {
  const mid = HALL_Z1 + 21;

  // The floor, laid: a stone field, a border course, and the carpet axis that
  // `buildVeilCastle` runs in from the gate.
  for (let z = HALL_Z1 + 1; z <= HALL_Z2 - 1; z++) {
    for (let x = HALL_X1 + 1; x <= HALL_X2 - 1; x++) {
      const edge = x === HALL_X1 + 1 || x === HALL_X2 - 1 || z === HALL_Z1 + 1 || z === HALL_Z2 - 1;
      const d = Math.abs(z - mid);
      world.set(
        x,
        LEVEL,
        z,
        edge ? WARM_TRIM : d <= 2 ? CARPET : d === 3 ? CARPET_EDGE : (x + z) % 2 === 0 ? P.smoothStone : P.quartz,
      );
    }
  }

  // The dais: three courses stepping up to the east end, so the hall has an
  // end to walk to. Two of the three are full blocks - a one-block-wide set of
  // steps is a stair, not a dais.
  for (let step = 0; step < 3; step++) {
    const y = LEVEL + 1 + step;
    const r = 4 - Math.floor(step / 2);
    for (let dz = -r - 1; dz <= r + 1; dz++) {
      for (let dx = -(4 - step); dx <= 0; dx++) {
        world.set(HALL_X2 - 1 + dx, y, mid + dz, step === 2 ? WARM_TRIM : y === LEVEL + 3 ? WARM : PALE);
      }
    }
  }
  // The throne on it, and a lectern at the foot of the steps.
  const tx = HALL_X2 - 2;
  world.set(tx, LEVEL + 4, mid, P.darkOakPlanks);
  world.set(tx, LEVEL + 5, mid, P.darkOakPlanks);
  world.set(tx, LEVEL + 6, mid, P.darkOakPlanks);
  for (const dz of [-1, 1]) {
    world.set(tx, LEVEL + 5, mid + dz, P.darkOakFence);
    world.set(tx - 1, LEVEL + 4, mid + dz, P.darkOakPlanks);
  }
  world.set(tx, LEVEL + 7, mid, P.glowstone);
  world.set(HALL_X2 - 6, LEVEL + 1, mid, P.lectern);

  // The colonnade: quartz piers either side of the aisle, a sandstone base and
  // capital, and a sea lantern set into each capital so the room lights itself.
  for (const x of [HALL_X1 + 3, HALL_X2 - 3]) {
    for (let z = HALL_Z1 + 6; z <= HALL_Z2 - 6; z += 8) {
      for (let y = LEVEL + 1; y <= LEVEL + 14; y++) {
        world.set(x, y, z, y === LEVEL + 1 || y === LEVEL + 14 ? WARM_TRIM : y % 5 === 0 ? WARM : PALE);
      }
      world.set(x, LEVEL + 14, z, P.seaLantern);
    }
  }

  // Pews: benches in rows either side of the aisle, back to the wall, with a
  // clear block between rows so you can walk them. The dais end is left clear.
  for (let z = HALL_Z1 + 5; z <= HALL_Z2 - 5; z += 3) {
    if (Math.abs(z - mid) <= 4) continue;
    const nearDais = z > mid - 9 && z < mid + 9;
    for (const [x1, x2, backX] of [
      [HALL_X1 + 2, HALL_X1 + 4, HALL_X1 + 2],
      // Two wide, not three: the third column is the aisle, and a bench across
      // the aisle is a bench between the door and the rest of the hall.
      [HALL_X2 - 4, HALL_X2 - 3, HALL_X2 - 3],
    ] as const) {
      if (nearDais && x1 > HALL_X2 - 5) continue;
      for (let x = x1; x <= x2; x++) world.set(x, LEVEL + 1, z, P.darkOakPlanks);
      world.set(backX, LEVEL + 2, z, P.darkOakFence);
    }
  }

  // Banners between the window piers, and three chandeliers down the centre.
  // The bays either side of the axis are left out: that is where the doors to
  // the rotunda and the wings are, and a banner across a doorway is a banner
  // nobody can get past.
  for (const x of [HALL_X1 + 1, HALL_X2 - 1]) {
    for (const z of [HALL_Z1 + 8, HALL_Z1 + 16, HALL_Z1 + 28, HALL_Z2 - 8]) {
      for (let y = LEVEL + 6; y <= LEVEL + 13; y++) {
        world.set(x, y, z, y === LEVEL + 13 ? WARM_TRIM : y % 4 === 0 ? CARPET_EDGE : CARPET);
      }
    }
  }
  for (const z of [HALL_Z1 + 7, mid, HALL_Z2 - 7]) {
    chandelier(world, HALL_X1 + 7, z, LEVEL + 18, 5);
  }
}

/**
 * Inside a wing: a long gallery, library on both sides.
 *
 * The wings are the widest rooms in the castle and the reference gives them
 * arcaded walls and a long glazed run, so the inside gets the thing a long
 * room actually wants - a carpet down the middle, cases against the walls, and
 * refectory tables either side of the runner with something to sit on.
 */
function furnishWing(world: World, z1: number, z2: number): void {
  const x1 = DRUM.x - DRUM.radius + 1;
  const x2 = DRUM.x + DRUM.radius - 1;

  for (let z = z1 + 1; z <= z2 - 1; z++) {
    for (let x = x1; x <= x2; x++) {
      const d = Math.abs(x - DRUM.x);
      world.set(
        x,
        LEVEL,
        z,
        d === 0 ? CARPET : d === 1 ? CARPET_EDGE : d === 2 ? WARM : (x + z) % 2 === 0 ? P.smoothStone : P.quartz,
      );
    }
  }

  // Bookcases along both walls, in bays of two with a pier between them, and a
  // lamp over every other bay.
  for (let z = z1 + 2; z <= z2 - 3; z += 4) {
    for (const x of [x1, x2]) {
      for (let y = LEVEL + 1; y <= LEVEL + 3; y++) {
        world.set(x, y, z, P.bookshelf);
        world.set(x, y, z + 1, P.bookshelf);
        world.set(x, y + 4, z, PALE);
      }
    }
    if ((z - z1) % 8 === 2) {
      world.set(DRUM.x, LEVEL + 9, z, P.hangingLantern);
    }
  }

  // Two refectory tables down the gallery, with stools.
  const mid = Math.round((z1 + z2) / 2);
  for (const tz of [mid - 6, mid + 6]) {
    for (let z = tz - 2; z <= tz + 2; z++) {
      for (const x of [DRUM.x - 5, DRUM.x - 4, DRUM.x + 4, DRUM.x + 5]) {
        world.set(x, LEVEL + 2, z, P.darkOakPlanks);
        world.set(x, LEVEL + 1, z, P.darkOakFence);
        world.set(x, LEVEL + 2, z + (z === tz - 2 ? 2 : z === tz + 2 ? -2 : 0), P.darkOakFence);
      }
    }
    for (const sx of [DRUM.x - 6, DRUM.x - 3, DRUM.x + 3, DRUM.x + 6]) {
      for (const sz of [tz - 1, tz + 1]) {
        world.set(sx, LEVEL + 1, sz, P.darkOakSlab);
      }
    }
    world.set(DRUM.x, LEVEL + 3, tz, P.seaLantern);
  }
}

/**
 * Inside the drum, under the dome.
 *
 * The drum is hollow already - `drumAndDome` lays it as a ring - but it was
 * hollow and *empty*, which from the great hall is a nine-block-wide shaft with
 * a hole in the ceiling. So: a compass mosaic in the floor, eight piers round a
 * dais, a ring of lamps at gallery height, and the castle's largest eye laid
 * flat on the dais looking up into the dome.
 */
function furnishRotunda(world: World): void {
  const { x: cx, z: cz } = DRUM;
  // The floor is the top of the plinth, two courses above the palace paving.
  const floor = LEVEL + 2;

  // A compass rose in glass and stone: the carpet cross, a green ring, and
  // eight points on the diagonals.
  for (let dz = -7; dz <= 7; dz++) {
    for (let dx = -7; dx <= 7; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > 7.8) continue;
      let block: BlockState;
      if (d < 1.8) block = CARPET;
      else if (d < 3.4) block = P.greenGlass;
      else if (Math.abs(dx) <= 1 || Math.abs(dz) <= 1) block = WARM;
      else if (Math.abs(dx) - 1 === Math.abs(dz)) block = P.limeGlass;
      else block = d < 6.6 ? P.quartz : WARM_TRIM;
      world.set(cx + dx, floor, cz + dz, block);
    }
  }

  // Eight piers round the edge, each with a lamp in its capital.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = cx + Math.round(Math.cos(a) * 6);
    const pz = cz + Math.round(Math.sin(a) * 6);
    for (let y = floor + 1; y <= floor + 15; y++) {
      world.set(px, y, pz, y === floor + 1 || y === floor + 15 ? WARM_TRIM : P.quartzPillar);
    }
    world.set(px, floor + 16, pz, P.seaLantern);
  }

  // The dais, and the eye inlaid in it. One course, not two: a dais two
  // courses tall is a two-block wall, and the whole point of this room is that
  // a player can walk to the middle of it. The eye is 5 across on an 11 block
  // dais rather than 7 across on a 9 block one, because the stone socket around
  // an eye reaches nearly a full block past it, and an eye scaled up until its
  // own surround covers the dais leaves the middle of the room as the one place
  // in the castle you cannot stand in. A sea lantern goes *under* the pupil so
  // the black glass has something behind it.
  world.disc(cx, cz, 5, floor + 1, PALE);
  world.set(cx, floor + 1, cz, P.seaLantern);
  eyeMosaic(world, cx, floor + 2, cz, 2, 2, "xz", 0x5e41);

  // A ring of chandeliers on chains, hung from the springing of the dome.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(a) * 4);
    const pz = cz + Math.round(Math.sin(a) * 4);
    chandelier(world, px, pz, floor + 30, 6);
  }

  // The way in from the great hall.
  //
  // Three things have to be opened, and the arithmetic matters: the hall's
  // east wall, the drum's own ring wall one block further east, and the pier
  // above both of them - left in place it is a one-block column hanging over a
  // five-block doorway. The course at y48 is the *threshold* and is left in
  // place, because the plinth is what makes the rotunda floor two courses up
  // off the hall; without it there is nothing to step onto and the door is a
  // two-block step, which a player cannot climb.
  for (let y = LEVEL + 1; y <= LEVEL + 16; y++) {
    if (y === LEVEL + 2) continue;
    for (let dz = -2; dz <= 2; dz++) world.set(HALL_X2, y, cz + dz, AIR);
  }
  for (let y = LEVEL + 3; y <= LEVEL + 8; y++) {
    // Two columns, not one: the drum's ring wall is two blocks thick on its
    // axis (the shell is every cell between the inner and outer radius), so
    // opening only the outer face leaves a one-block wall across the doorway.
    for (const x of [HALL_X2 + 1, HALL_X2 + 2]) {
      for (let dz = -1; dz <= 1; dz++) world.set(x, y, cz + dz, AIR);
    }
  }
  // Jambs either side of the opening and a lintel over it - the frame, not the
  // hole.
  for (let y = LEVEL + 1; y <= LEVEL + 17; y++) {
    for (const dz of [-3, 3]) world.set(HALL_X2, y, cz + dz, PALE);
    for (let dz = -2; dz <= 2; dz++) world.set(HALL_X2, LEVEL + 17, cz + dz, WARM_TRIM);
  }
  // The tympanum: the first thing you see when you come through, and the
  // reason you keep walking.
  eyeMosaic(world, HALL_X2, LEVEL + 10, cz, 4, 3, "zy", 0x5e51);
}

/**
 * The doors from the great hall into the two wings.
 *
 * Cut after the wings are built, not before: `wings` fills its own body solid
 * and hollows it again, and a doorway cut into the hall's east wall before that
 * happens is simply paved over by the wing behind it.
 */
function wingDoors(world: World): void {
  const mid = HALL_Z1 + 21;
  for (const dz of [-13, 13]) {
    const z = mid + dz;
    // Two columns. The wings' arcade is built one block *inside* the hall's
    // east wall - it is the hall's east face for the whole length of each wing -
    // so a doorway cut through the wall alone opens onto a solid arcade.
    for (let y = LEVEL + 1; y <= LEVEL + 3; y++) {
      for (let zz = z - 1; zz <= z + 1; zz++) {
        world.set(HALL_X2, y, zz, AIR);
        world.set(HALL_X2 - 1, y, zz, AIR);
      }
    }
    for (let zz = z - 2; zz <= z + 2; zz++) {
      if (zz >= z - 1 && zz <= z + 1) continue;
      for (let y = LEVEL + 1; y <= LEVEL + 4; y++) {
        world.set(HALL_X2, y, zz, PALE);
        world.set(HALL_X2 - 1, y, zz, PALE);
      }
      world.set(HALL_X2, LEVEL + 4, zz, WARM_TRIM);
      world.set(HALL_X2 - 1, LEVEL + 4, zz, WARM_TRIM);
    }
  }
}

/** The drum and dome: the piece that actually reads from the far side of the map. */
function drumAndDome(world: World): void {
  const { x: cx, z: cz, radius } = DRUM;
  // A stepped plinth, so the drum does not sit straight on the paving.
  for (let step = 0; step < 3; step++) {
    world.disc(cx, cz, radius + 2 - step, LEVEL + step, step === 2 ? WARM_TRIM : PALE);
  }
  // The colonnade: piers every 30 degrees, glazed between them.
  const piers = 12;
  for (let i = 0; i < piers; i++) {
    const a = (i / piers) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(a) * radius);
    const pz = cz + Math.round(Math.sin(a) * radius);
    for (let y = LEVEL + 3; y <= DRUM_TOP; y++) {
      const cornice = (y - LEVEL) % 8 === 0;
      world.set(px, y, pz, cornice ? WARM_TRIM : PALE);
    }
    world.set(px, DRUM_TOP + 1, pz, P.quartzPillar);
    world.set(px, DRUM_TOP + 2, pz, P.quartzPillar);
  }
  for (let i = 0; i < piers; i++) {
    const a0 = (i / piers) * Math.PI * 2 + Math.PI / piers;
    const a1 = ((i + 1) / piers) * Math.PI * 2 - Math.PI / piers;
    for (let t = 0; t <= 8; t++) {
      const a = a0 + ((a1 - a0) * t) / 8;
      const px = cx + Math.round(Math.cos(a) * radius);
      const pz = cz + Math.round(Math.sin(a) * radius);
      for (let y = LEVEL + 5; y <= DRUM_TOP - 2; y++) {
        world.set(px, y, pz, (y - LEVEL) % 6 === 0 ? WARM : ROOF_LIGHT);
      }
    }
  }
  // The drum's own wall behind the colonnade, and its cap.
  for (let y = LEVEL + 3; y <= DRUM_TOP; y++) {
    world.cylinder(cx, cz, radius - 1, y, y, y === DRUM_TOP ? WARM_TRIM : PALE, true);
  }
  world.disc(cx, cz, radius + 1, DRUM_TOP + 3, WARM_TRIM);
  // The dome: a stepped hemisphere in blue, banded green like the roof of the
  // reference's central rotunda, with a lantern on the point.
  for (let layer = 0; layer < 20; layer++) {
    const t = layer / 19;
    const y = DRUM_TOP + 4 + layer;
    const r = Math.round(radius * Math.cos(t * Math.PI * 0.5));
    if (r <= 0) break;
    const band = layer % 4 === 3;
    world.disc(cx, cz, r, y, band ? ROOF_GREEN : ROOF);
    world.ring(cx, cz, r, y, band ? P.greenGlass : ROOF_LIGHT);
  }
  world.cylinder(cx, cz, 2, DOME_TOP + 1, DOME_TOP + 3, PALE_TRIM, false);
  world.set(cx, DOME_TOP + 4, cz, P.seaLantern);
  world.set(cx, DOME_TOP + 5, cz, P.glowstone);
  world.protect(cx, cz, radius + 6);
}

/** The curtain wall, its walkway, and the spires that stand on it. */
function curtainWall(world: World): void {
  const top = LEVEL + 5;
  world.rectWalls(PALACE_X1, PALACE_Z1, PALACE_X2, PALACE_Z2, LEVEL + 1, top, PALE);
  // A walkway inside the parapet, and a parapet on top of it.
  for (let x = PALACE_X1 + 1; x <= PALACE_X2 - 1; x++) {
    for (let z = PALACE_Z1 + 1; z <= PALACE_Z2 - 1; z++) {
      const onEdge = x === PALACE_X1 + 1 || x === PALACE_X2 - 1 || z === PALACE_Z1 + 1 || z === PALACE_Z2 - 1;
      if (!onEdge) continue;
      world.set(x, top, z, WARM);
      world.set(x, top + 1, z, (x + z) % 3 === 0 ? WARM_TRIM : PALE);
    }
  }
  // Merlons, so the skyline is not a smooth line.
  for (let x = PALACE_X1; x <= PALACE_X2; x += 3) {
    for (const z of [PALACE_Z1, PALACE_Z2]) world.set(x, top + 2, z, WARM_TRIM);
  }
  for (let z = PALACE_Z1; z <= PALACE_Z2; z += 3) {
    for (const x of [PALACE_X1, PALACE_X2]) world.set(x, top + 2, z, WARM_TRIM);
  }
  // Corner and mid spires. Two heights, so the four corners read as taller
  // than the middle - the reference's asymmetry is what stops it looking like
  // a wedding cake.
  const corners: Array<[number, number, number]> = [
    [PALACE_X1, PALACE_Z1, 34],
    [PALACE_X2, PALACE_Z1, 26],
    [PALACE_X1, PALACE_Z2, 26],
    [PALACE_X2, PALACE_Z2, 34],
    [PALACE_X1, Math.round((PALACE_Z1 + PALACE_Z2) / 2), 20],
    [PALACE_X2, Math.round((PALACE_Z1 + PALACE_Z2) / 2), 20],
    [Math.round((PALACE_X1 + PALACE_X2) / 2), PALACE_Z1, 20],
    [Math.round((PALACE_X1 + PALACE_X2) / 2), PALACE_Z2, 20],
  ];
  for (const [x, z, h] of corners) spire(world, x, z, top + 2, h);
  // Gate gaps in the west wall, on the axis, so the wall does not seal the court.
  const mid = Math.round((PALACE_Z1 + PALACE_Z2) / 2);
  for (let y = LEVEL + 1; y <= top; y++) {
    for (let z = mid - 3; z <= mid + 3; z++) world.set(PALACE_X1, y, z, AIR);
  }
  world.protect(Math.round((PALACE_X1 + PALACE_X2) / 2), Math.round((PALACE_Z1 + PALACE_Z2) / 2), 42);
}

/** The two wings north and south of the drum, with their arcades. */
function wings(world: World): void {
  for (const [z1, z2] of [
    [PALACE_Z1 + 2, DRUM.z - DRUM.radius - 2],
    [DRUM.z + DRUM.radius + 2, PALACE_Z2 - 2],
  ] as const) {
    // The body: a solid pale block with a band of tall windows on both faces.
    world.fill(DRUM.x - DRUM.radius, LEVEL, z1, DRUM.x + DRUM.radius, LEVEL + 12, z2, PALE_PLAIN);
    world.fill(DRUM.x - DRUM.radius + 1, LEVEL + 1, z1, DRUM.x + DRUM.radius - 1, LEVEL + 11, z2 - 1, AIR);
    for (let x = DRUM.x - DRUM.radius; x <= DRUM.x + DRUM.radius; x++) {
      for (let y = LEVEL + 1; y <= LEVEL + 12; y++) {
        const band = y >= LEVEL + 5 && y <= LEVEL + 10;
        const mullion = (x - (DRUM.x - DRUM.radius)) % 3 === 0;
        for (const z of [z1, z2]) {
          world.set(x, y, z, y === LEVEL + 12 ? WARM_TRIM : band && !mullion ? ROOF_LIGHT : PALE);
        }
      }
    }
    // A hipped roof over the wing.
    for (let z = z1; z <= z2; z++) {
      for (let x = DRUM.x - DRUM.radius; x <= DRUM.x + DRUM.radius; x++) {
        const inset = Math.min(x - (DRUM.x - DRUM.radius), DRUM.x + DRUM.radius - x, z - z1, z2 - z);
        const rise = Math.max(0, 5 - inset);
        for (let y = LEVEL + 13; y <= LEVEL + 13 + rise; y++) {
          world.set(x, y, z, inset === 0 ? WARM : ROOF);
        }
      }
    }
    // The arcade along the wing's long face, facing the court.
    arcade(world, DRUM.x - DRUM.radius - 1, z1, z2, LEVEL, 9);
    furnishWing(world, z1, z2);
    world.protect(DRUM.x, Math.round((z1 + z2) / 2), 16);
  }
}

/** The east facade: a second, smaller gate and a roundel over it. */
function eastFacade(world: World): void {
  const mid = DRUM.z;
  for (let z = mid - 8; z <= mid + 8; z++) {
    for (let y = LEVEL + 1; y <= LEVEL + 16; y++) {
      const opening = Math.abs(z - mid) <= 2 && y <= LEVEL + 6;
      if (opening) {
        world.set(PALACE_X2, y, z, AIR);
        continue;
      }
      world.set(PALACE_X2, y, z, y === LEVEL + 16 ? WARM_TRIM : y % 4 === 0 ? WARM : PALE);
    }
  }
  eyeMosaic(world, PALACE_X2, LEVEL + 10, mid, 5, 4, "zy", 0x5e31);
  for (const dz of [-3, 3]) world.set(PALACE_X2, LEVEL + 7, mid + dz, P.seaLantern);
}

/**
 * Builds the castle.
 *
 * Order is load-bearing: the ground is padded first, then the causeway and the
 * forecourt (which are the parts the player walks on and would notice being
 * paved over), then the gate, then the palace mass, and the drum last because
 * it is the tallest thing on the site and everything else has to fit under it.
 */
export function buildVeilCastle(world: World): void {
  const lm = LANDMARKS.veilCastle;
  const mid = VEIL_COURT.z;

  // Ground. `pad` flattens and stamps land, so the castle is not built on a
  // 6-block roll; the veilShelf terrain region has already taken most of it out.
  pad(
    world,
    { kind: "rect", x1: lm.footprint.x1, z1: lm.footprint.z1, x2: lm.footprint.x2, z2: lm.footprint.z2 },
    LEVEL,
    P.smoothStone,
    P.sandstone,
  );

  causeway(world, mid - 5, mid + 5);
  forecourt(world, mid - 15, mid + 15);
  gatehouse(world, mid - 9, mid + 9);
  curtainWall(world);
  greatHall(world);
  wings(world);
  drumAndDome(world);
  eastFacade(world);
  // The doors last of all: the wings and the drum are both built as solid
  // masses and hollowed afterwards, so anything cut into a shared wall before
  // they run is paved over by the room behind it.
  wingDoors(world);
  furnishRotunda(world);

  // The last of the carpet. The forecourt stops at the gatehouse and the hall
  // starts eleven blocks further east, and the strip between them is the outer
  // court - which without this is the one place on the whole approach where the
  // carpet is not. Ten blocks of pale stone in the middle of a purple road.
  for (let x = GATE_X; x <= HALL_X1 + 1; x++) {
    for (let dz = -2; dz <= 2; dz++) {
      world.set(x, LEVEL, mid + dz, Math.abs(dz) === 2 ? CARPET_EDGE : CARPET);
    }
  }

  // Lamps down the forecourt, on the axis, so the approach is lit.
  for (let i = 0; i < 4; i++) {
    const x = CAUSEWAY_X2 + 2 + i * 4;
    for (const dz of [-6, 6]) {
      const z = mid + dz;
      for (let y = LEVEL + 1; y <= LEVEL + 4; y++) world.set(x, y, z, P.smoothSandstone);
      world.set(x, LEVEL + 5, z, P.seaLantern);
      world.set(x, LEVEL + 6, z, P.glowstone);
    }
  }
  // And a pair either side of the gate itself.
  for (const dz of [-6, 6]) {
    for (let y = LEVEL + 1; y <= LEVEL + 5; y++) world.set(GATE_X - 3, y, mid + dz, P.smoothSandstone);
    world.set(GATE_X - 3, LEVEL + 6, mid + dz, P.seaLantern);
  }

  world.protect(GATE_X - 10, mid, 26);
  world.protect(Math.round((PALACE_X1 + PALACE_X2) / 2), mid, 44);
}
