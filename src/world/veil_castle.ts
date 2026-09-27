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

/** Deterministic per-cell pick, so a roundel is the same mural every build. */
function roundelCell(x: number, y: number, z: number, seed: number): BlockState {
  return ROUNDEL[Math.floor(hash2(x * 7 + z, y * 131 + seed, seed * 7 + 3) * ROUNDEL.length) % ROUNDEL.length]!;
}

/**
 * A roundel: the reference's signature facade motif - a big circular green-glass
 * window set in a sandstone ring, with a dark pupil and a lit catchlight.
 *
 * Deliberately *not* `eyeWindow` from structures_glass.ts. That one draws the
 * Soul Keepers' eye: an almond outline, black pupil, prism iris, and it belongs
 * to the ruins. This is a disc of green in a pale wall - a rose window on a
 * cathedral, not an eye staring out of a ruin. Same motif, different icon.
 */
function roundel(
  world: World,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  alongX: boolean,
  seed: number,
): void {
  for (let u = -radius; u <= radius; u++) {
    for (let v = -radius; v <= radius; v++) {
      const x = alongX ? cx + u : cx;
      const z = alongX ? cz : cz + u;
      const d = Math.hypot(u, v);
      let block: BlockState;
      if (d > radius - 0.5) block = WARM_TRIM; // the stone ring
      else if (d > radius - 2.5) block = WARM; // a chamfer inside the ring
      else if (d < radius * 0.22) block = P.blackGlass; // the pupil
      else if (d < radius * 0.46) block = P.whiteGlass; // the catchlight
      else block = roundelCell(x, cy + v, z, seed);
      world.set(x, cy + v, z, block);
    }
  }
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
  // The three roundels on the west face, over the axis: the reference hangs
  // them either side of the gate and again on the upper storeys.
  for (const [dz, y, r] of [
    [-9, LEVEL + 10, 4],
    [0, LEVEL + 14, 5],
    [9, LEVEL + 10, 4],
  ] as const) {
    roundel(world, HALL_X1, y, HALL_Z1 + 21 + dz, r, false, 0x5e21 + dz);
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
  // A dais at the far end, so the hall has an end to walk to.
  for (let step = 0; step < 3; step++) {
    for (let dz = -6; dz <= 6; dz++) {
      world.set(HALL_X2 - 1, LEVEL + 1 + step, HALL_Z1 + 21 + dz, step === 2 ? WARM_TRIM : PALE);
    }
  }
  for (const dz of [-4, 4]) {
    for (let y = LEVEL + 4; y <= LEVEL + 6; y++) world.set(HALL_X2 - 1, y, HALL_Z1 + 21 + dz, P.seaLantern);
  }
  world.protect(Math.round((HALL_X1 + HALL_X2) / 2), HALL_Z1 + 21, 24);
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
  roundel(world, PALACE_X2, LEVEL + 10, mid, 4, false, 0x5e31);
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
