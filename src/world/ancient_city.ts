/**
 * The Sunken City and the Warden's Deep Dark.
 *
 * Two landmarks that fill the void ring east of the realm: a deepslate-brick
 * Ancient City grown into the dark, and beneath it the sculk-choked pit where
 * the Warden is meant to wake up.
 *
 * Both are *structures* - geometry, materials, atmosphere. That is deliberate.
 * The mobs that would inhabit them (warden, skeletons, the Soul Keeper
 * trader) are entity behaviour, not world data: they need a behaviour pack
 * with spawn rules, attributes, equipment and trade tables. This repo ships
 * `world_behavior_packs.json` as `[]` and is scoped map-only, so what is built
 * here is the *place* - the arena, the city, the sculk - ready for whatever
 * populates it. See docs/SESSION-NOTES.md.
 *
 * Ancient City vocabulary, in the palette this repo already validates:
 * deepslate bricks + cracked variants for the halls, deepslate tiles and
 * chiseled deepslate for the frames, polished deepslate for the dark accent
 * course, and sculk spreading out of the floor the way it does when a Warden
 * has been sitting on a spot too long.
 *
 * Note there is no "ominous dark" block in Bedrock - that trim is Java-only -
 * so the accent course is polished deepslate, which is the closest real
 * material and passes the palette validator.
 *
 * The glazing
 * -----------
 * The first pass at this built the city the way an Ancient City is built in
 * canon: deepslate, top to bottom, for 92x80 blocks. Loaded on a phone it read
 * as exactly what it is - a large grey slab in a map that is otherwise the most
 * colour-saturated thing in the Underworld. The fix is not to delete the
 * deepslate, it is to stop *facing* the world with it:
 *
 * - the plate's outer face is now a stained-glass foundation, mullioned like
 *   glazing rather than coursed like rock;
 * - the plaza is paved in diagonal glass inlay instead of plain cobble;
 * - the halls are glazed bands under glazed vaults, with a glass eye in the
 *   end wall of each, so daylight comes down through the roof;
 * - the spine corridor is a light-flooded avenue rather than a tunnel.
 *
 * What deliberately did *not* change is the Warden. The pit, the bowl, the
 * sculk, the shrieker, the sensors and the catalyst rim are exactly as dark as
 * they were - that is the one part of this city the glazing is not allowed to
 * touch, and the contrast is what makes the glass read as bright.
 */
import { AIR, P, type BlockState } from "./blocks.ts";
import { LANDMARKS, type RectRegion } from "./layout.ts";
import { hash2 } from "./noise.ts";
import {
  eyeWindow,
  glassMosaic,
  prismAt,
  prismPillar,
  seaLanternPost,
  SOUL_GREEN,
  VIVID_PRISM,
} from "./structures_glass.ts";
import type { World } from "./world.ts";

/** What the city's own glazing is cut from. Loud, because it is the one saturated thing out here. */
const CITY_GLAZING: BlockState[] = VIVID_PRISM;
/** The green the Soul Keepers put on structures, reserved for the pit's edge. */
const PIT_GLAZING: BlockState[] = SOUL_GREEN;

function rect(x1: number, z1: number, x2: number, z2: number): RectRegion {
  return { kind: "rect", x1, z1, x2, z2 };
}

/**
 * Glaze the outward face of a plate: the band of blocks you actually see when
 * you approach the city from the void ring.
 *
 * This is the single highest-value change in the file. The plate is solid rock
 * from y=0 to the city level, and 92x80 of it means the rim is a 44-block wall
 * of deepslate facing the player on every side. Mullion it every fourth block,
 * glaze the cells between, and the same wall now reads as a stained-glass
 * foundation holding the city up out of the dark.
 */
function glazePlateRim(world: World, region: RectRegion, level: number, seed: number): void {
  const lo = level - 10;
  const onRim = (x: number, z: number): boolean =>
    (x === region.x1 || x === region.x2) && z >= region.z1 && z <= region.z2
      ? true
      : (z === region.z1 || z === region.z2) && x >= region.x1 && x <= region.x2;
  const run = (x: number, z: number): number => (z === region.z1 || z === region.z2 ? x : z);

  for (let z = region.z1; z <= region.z2; z++) {
    for (let x = region.x1; x <= region.x2; x++) {
      if (!onRim(x, z) || !world.inRealm(x, z)) continue;
      for (let y = lo; y <= level; y++) {
        // A cornice at the top and a plinth at the bottom, so the glazing is a
        // course in a frame rather than a stripe painted on rock.
        if (y === level) {
          world.set(x, y, z, P.polishedDeepslate);
          continue;
        }
        if (y === lo) {
          world.set(x, y, z, P.chiseledDeepslate);
          continue;
        }
        if (run(x, z) % 4 === 0) {
          world.set(x, y, z, P.chiseledDeepslate); // mullion
          continue;
        }
        world.set(x, y, z, prismAt(CITY_GLAZING, x, y, z, seed));
      }
      // A lamp every 12 blocks up the face, so the wall lights its own glazing
      // at night and the city is findable from across the void ring.
      if (run(x, z) % 12 === 0) {
        world.set(x, level - 5, z, P.seaLantern);
        world.set(x, level - 6, z, P.glowstone);
      }
    }
  }
}

/**
 * Paving inlay across the plate top: diagonal glass courses through cobble.
 *
 * Runs straight after `plate` and before the halls, so the halls and the pit
 * carve over the top of it and it only survives where the city is walkable.
 * Glass paving is deliberate - it is what makes the plaza read as the Soul
 * Keepers' floor rather than as a car park, and light from the pit glows up
 * through it.
 */
function glazePlaza(
  world: World,
  region: RectRegion,
  level: number,
  pitCx: number,
  pitCz: number,
  seed: number,
  /** Radius of the green ring round the pit's lip; 0 draws no ring. */
  ringRadius = 23,
): void {
  for (let z = region.z1; z <= region.z2; z++) {
    for (let x = region.x1; x <= region.x2; x++) {
      if (!world.inRealm(x, z)) continue;
      // Stop at the bowl's lip. Inside that radius the plate is not plaza at
      // all - it is the roof of the Warden's pit - and glazing stops there.
      if (Math.hypot(x - pitCx, z - pitCz) < 21) continue;
      if ((x + z) % 7 !== 0 && (x - z) % 7 !== 0) continue;
      world.set(x, level, z, prismAt(CITY_GLAZING, x, level, z, seed));
    }
  }
  // a green ring on the paving, one block out from the pit's lip
  if (ringRadius <= 0) return;
  for (let i = 0; i < 220; i++) {
    const a = (i / 220) * Math.PI * 2;
    const x = Math.round(pitCx + Math.cos(a) * ringRadius);
    const z = Math.round(pitCz + Math.sin(a) * ringRadius);
    if (!world.inRealm(x, z)) continue;
    if (hash2(x, z, seed) < 0.3) continue; // gaps, so the ring is not a solid line
    world.set(x, level, z, prismAt(PIT_GLAZING, x, level, z, seed + 3));
  }
}

/**
 * A glazed ring walk: the band you actually walk on, looking in over the lip.
 *
 * A plain stone ring around a black hole reads as a circle drawn on a slab.
 * Mullioned like the plate rim - a dark pier every fourth block, glazing
 * between - and it reads as a balustrade of lit glass, which is what makes the
 * drop behind it legible instead of just dark.
 */
function glazeRingWalk(
  world: World,
  cx: number,
  cz: number,
  outer: number,
  inner: number,
  level: number,
  glazing: BlockState[],
  seed: number,
): void {
  for (let radius = inner; radius <= outer; radius++) {
    const steps = Math.max(24, Math.round(radius * 8));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * radius);
      const z = Math.round(cz + Math.sin(a) * radius);
      if (!world.inRealm(x, z)) continue;
      // The kerb on the inside edge, so the lip of the pit is a line you can
      // see rather than an edge you can fall over. It has to sit *outside* the
      // bowl: `wardenPit` clears everything within its own radius up to the
      // rim, so a kerb drawn at the lip before the pit is sunk is erased by it.
      if (radius === inner) {
        world.set(x, level, z, P.chiseledDeepslate);
        world.set(x, level + 1, z, P.sculkCatalyst);
        continue;
      }
      // ...and the green line on the outside edge, so the walk has a far side.
      if (radius === outer) {
        world.set(x, level, z, prismAt(PIT_GLAZING, x, level, z, seed + 5));
        continue;
      }
      const mullion = i % 4 === 0;
      world.set(x, level, z, mullion ? P.chiseledDeepslate : prismAt(glazing, x, level, z, seed));
      if (i % 8 === 0) world.set(x, level + 1, z, P.seaLantern);
    }
  }
}

/**
 * Flatten a rectangle to a level and stamp land under it, so a structure can
 * be dropped into the void ring and still have ground to stand on.
 *
 * `pad()` in structures.ts does the same thing but ramps to an existing
 * surface; out here there is no surface, it is all void, so this one builds
 * the plate from y=0 up. The plate is `depth` thick and the sides are left as
 * raw deepslate, which is what makes the city read as a fragment that broke
 * off the mainland rather than a building on a lawn.
 */
function plate(
  world: World,
  region: RectRegion,
  level: number,
  top: BlockState,
  fill: BlockState,
  depth: number,
): void {
  for (let z = region.z1; z <= region.z2; z++) {
    for (let x = region.x1; x <= region.x2; x++) {
      if (!world.inRealm(x, z)) continue;
      const floor = level - depth;
      for (let y = 0; y <= floor; y++) world.set(x, y, z, P.deepslate);
      for (let y = floor + 1; y < level; y++) world.set(x, y, z, fill);
      world.set(x, level, z, top);
      world.setSurface(x, z, level);
      world.setLand(x, z, true);
      world.protect(x, z);
    }
  }
}

/**
 * Scatter a patch of sculk across a floor, thicker toward its centre.
 *
 * Sculk is laid on each column's *own* surface rather than at a fixed y. That
 * matters in the bowl, whose floor is a parabola: a fixed y buries the sculk
 * under the slope everywhere but the very middle, so the growth you can
 * actually see is only a small disc in the deepest part.
 */
function sculkPatch(
  world: World,
  cx: number,
  cz: number,
  radius: number,
  seed: number,
  density = 0.55,
): void {
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      // falloff so the patch has a soft rim instead of a hard disc edge
      const falloff = 1 - d / (radius + 1);
      if (hash2(cx + dx, cz + dz, seed) > density * falloff + 0.06) continue;
      const y = world.surfaceAt(cx + dx, cz + dz);
      if (y <= 0) continue;
      const existing = world.get(cx + dx, y, cz + dz);
      if (!existing || existing.name === "minecraft:air") continue;
      world.set(cx + dx, y, cz + dz, P.sculk);
    }
  }
}

/**
 * A single Ancient City corridor: deepslate brick floor, a chiseled frame at
 * the mouth, and the dark "ominous" trim the real structure uses to frame its
 * doorways. Returns nothing; writes straight into the world.
 *
 * The roof is glazed and the top wall course is a window band, so the spine
 * reads as a light-flooded avenue running the length of the city rather than
 * the 80-block tunnel it used to be. Everything at eye level is untouched
 * deepslate, which is what keeps it reading as Ancient City and not as a
 * Glassworks aisle.
 */
function corridor(
  world: World,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  floorY: number,
  height: number,
  seed: number,
): void {
  const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  const lo = alongX ? Math.min(x1, x2) : Math.min(z1, z2);
  const hi = alongX ? Math.max(x1, x2) : Math.max(z1, z2);

  // hollow the interior, then shell it
  for (let t = lo; t <= hi; t++) {
    for (let y = floorY + 1; y < floorY + height; y++) {
      for (let w = 0; w < 3; w++) {
        const a = alongX ? { x: t, z: (alongX ? z1 : t) + w } : { x: (alongX ? x1 : t) + w, z: t };
        world.set(a.x, y, a.z, AIR);
      }
    }
  }
  for (let t = lo; t <= hi; t++) {
    for (let w = 0; w < 3; w++) {
      const bx = alongX ? t : (alongX ? x1 : t) + w;
      const bz = alongX ? (alongX ? z1 : t) + w : t;
      world.set(bx, floorY, bz, P.crackedDeepslateBricks);
      // glazed vault: a deepslate mullion every fourth bay, glass between, and
      // a lamp every eighth so the avenue is lit along its whole length
      world.set(
        bx,
        floorY + height,
        bz,
        t % 4 === 0 ? P.deepslateBricks : prismAt(CITY_GLAZING, bx, floorY + height, bz, seed),
      );
      if (t % 8 === 0 && w === 1) world.set(bx, floorY + height - 1, bz, P.seaLantern);
      for (let y = floorY + 1; y < floorY + height; y++) {
        // dado in deepslate, a glazed band at the top, air between
        const band = y === floorY + height - 1;
        world.set(
          bx,
          y,
          bz,
          y === floorY + 1
            ? P.deepslateBricks
            : band && w !== 1
              ? prismAt(CITY_GLAZING, bx, y, bz, seed + 1)
              : AIR,
        );
      }
    }
  }

  // chiseled frame + dark trim at both mouths
  for (const end of [lo, hi]) {
    for (let w = 0; w < 3; w++) {
      const bx = alongX ? end : (alongX ? x1 : end) + w;
      const bz = alongX ? (alongX ? z1 : end) + w : end;
      for (let y = floorY + 1; y <= floorY + height; y++) {
        const edge = w === 0 || w === 2;
        if (edge) world.set(bx, y, bz, P.chiseledDeepslate);
      }
      world.set(bx, floorY + height + 1, bz, P.polishedDeepslate);
      world.set(bx, floorY + 2, bz, P.polishedDeepslate);
    }
  }

  // a little ruin so it is not a clean box
  for (let t = lo; t <= hi; t++) {
    if (hash2(t, alongX ? z1 : x1, seed) < 0.12) {
      const bx = alongX ? t : x1 + 1;
      const bz = alongX ? z1 + 1 : t;
      for (let y = floorY + 1; y < floorY + height; y++) world.set(bx, y, bz, AIR);
    }
  }
}

/**
 * The Warden's pit: a sculk bowl hung under the city, with a shrieker at the
 * bottom and the darkness pooling in the middle.
 *
 * The shrieker is placed with `can_summon: false` in the palette, so opening
 * this world will NOT accidentally spawn a Warden before the player walks in.
 * That is intentional - a world that spawns a boss on load is unpleasant, and
 * the arena is here for the player to find on their own terms.
 */
function wardenPit(world: World, cx: number, cz: number, rimY: number, seed: number): void {
  const radius = 21;
  const depth = 26;
  const floorY = rimY - depth;

  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const x = cx + dx;
      const z = cz + dz;
      if (!world.inRealm(x, z)) continue;

      // bowl profile: parabolic, so the middle is deepest
      const t = d / radius;
      const y = Math.round(rimY - depth * (1 - t * t) - (d > radius - 3 ? 3 : 0));
      if (y < 3) continue;

      // Fill the rock under the floor, then *carve the void above it*.
      //
      // The carve is the part that is easy to leave out. `plate()` runs first
      // and fills this whole footprint solid from y=3 to the arena level, so
      // without an explicit clear the bowl is bricked in: the surface map says
      // the floor is at y18 while 27 blocks of deepslate sit on top of it, and
      // the player walks over a flat plate with the pit sealed underneath.
      for (let yy = 3; yy <= y; yy++) world.set(x, yy, z, P.deepslate);
      world.set(x, y, z, t < 0.35 ? P.sculk : P.cobbledDeepslate);
      // clear everything from just above the floor up past the rim
      for (let yy = y + 1; yy <= rimY + 2; yy++) world.set(x, yy, z, AIR);
      world.setSurface(x, z, y);
      world.setLand(x, z, true);
      world.protect(x, z);
    }
  }

  // sculk eating outward from the floor
  sculkPatch(world, cx, cz, radius, seed, 0.85);
  sculkPatch(world, cx + 6, cz - 5, 9, seed + 1, 0.5);
  sculkPatch(world, cx - 7, cz + 6, 8, seed + 2, 0.45);

  // Glass and light, which is what this arena was missing.
  //
  // The screenshot came back as a black hole: the bowl is 26 deep, the floor is
  // sculk, and the only lamps in the whole build are eight posts on the rim
  // walk and a sculk sensor every fourth step. Nothing about that is a lighting
  // decision, it is an absence of one - and "the arena is meant to be dark" is
  // not the same as "the player cannot see the arena".
  //
  // So the *slope* is glazed, in terraces, and lit. The bowl's own profile is a
  // parabola, so each ring of the slope sits at its own y and the glazing has to
  // be laid per column rather than at a fixed height - a fixed y would put half
  // the panes inside the rock and half of them hanging in the air above the
  // floor. The middle is deliberately left alone: the dark centre is the whole
  // point of the arena, and glazing it would turn the Warden's pit into a
  // lantern.
  glazeArenaSlope(world, cx, cz, rimY, radius, seed);

  // the shrieker, ringed so it reads as the focal point. It is two blocks
  // tall, so the space above it is cleared too - a shrieker with rock on top
  // is a block the player can see but never activate.
  const floor = world.surfaceAt(cx, cz);
  world.set(cx, floor, cz, P.sculkShrieker);
  world.set(cx, floor + 1, cz, AIR);
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== 3) continue;
      world.set(cx + dx, floor, cz + dz, P.sculkVein);
    }
  }

  // sensors half-buried in the slope, the way they are in a real deep dark
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = 11 + hash2(i, 7, seed) * 6;
    const x = Math.round(cx + Math.cos(a) * r);
    const z = Math.round(cz + Math.sin(a) * r);
    const s = world.surfaceAt(x, z);
    if (s > 0) world.set(x, s + 1, z, P.sculkSensor);
  }

  // a lit rim so the player can find the edge of a very dark hole
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * (radius - 1));
    const z = Math.round(cz + Math.sin(a) * (radius - 1));
    const s = world.surfaceAt(x, z);
    if (s > 0) world.set(x, s + 1, z, P.sculkCatalyst);
  }
}

/**
 * Glaze and light the arena's slope, in terraces, leaving the floor dark.
 *
 * The bowl is a parabola 26 deep, so "the wall of the pit" is not one y - it is
 * a slope, and the only honest way to glaze a slope is column by column. The
 * inner fifth is left as bare sculk: that is the Warden's ground, and it is
 * supposed to be the darkest thing in the build.
 *
 * Each terrace is a run of glass in the arena's cyan/green with a mullion every
 * fourth block and a sea lantern every eighth, so the slope reads as a lit
 * colonnade you are looking down into rather than as a grey funnel.
 */
function glazeArenaSlope(world: World, cx: number, cz: number, rimY: number, radius: number, seed: number): void {
  const inner = radius * 0.28;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dz);
      // The dark centre: no glazing, no lamps, nothing.
      if (d < inner || d > radius - 2) continue;
      const x = cx + dx;
      const z = cz + dz;
      if (!world.inRealm(x, z)) continue;
      const s = world.surfaceAt(x, z);
      if (s <= 0) continue;
      // Sculk is not a floor that gets paved over. The Warden's ground is the
      // one surface in this build that is meant to stay dark, and the inner
      // skip below is only a *radius* - the bowl is a parabola, so the sculk
      // disc runs a block or two past it in places, and glazing those blocks
      // put bright glass in the middle of the dark centre and ate 60 of the
      // floor's sculk on the way past.
      if (world.get(x, s, z)?.name === P.sculk.name) continue;
      // Terrace banding: every course of the slope is its own band of colour,
      // and the band steps as the parabola does, so the slope is legible as
      // steps from the rim walk even before you are in it.
      const band = Math.floor((rimY - s) / 4) % 3;
      const glass = band === 0 ? P.cyanGlass : band === 1 ? P.greenGlass : P.limeGlass;
      const mullion = (Math.round(dx) + Math.round(dz)) % 4 === 0;
      world.set(x, s, z, mullion ? P.chiseledDeepslate : prismAt(CITY_GLAZING, x, s, z, seed));
      // A pane standing on the terrace, so the slope is glazed in the vertical
      // as well as the horizontal - from the rim you see a wall of light.
      if (!mullion && (Math.round(dx) * 3 + Math.round(dz) * 5) % 7 === 0) {
        world.set(x, s + 1, z, glass);
      }
    }
  }
  // Lamps down the slope on the eight cardinal and diagonal lines, one course
  // above each terrace floor. Bright enough to navigate by, spaced far enough
  // apart that the middle of the bowl is still the dark part.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (let r = inner + 2; r < radius - 3; r += 4) {
      const x = Math.round(cx + Math.cos(a) * r);
      const z = Math.round(cz + Math.sin(a) * r);
      const s = world.surfaceAt(x, z);
      if (s > 0) world.set(x, s + 1, z, P.seaLantern);
    }
  }
}

/**
 * The Sunken City - the Ancient City, grown into the void ring.
 *
 * A spine corridor with three halls hung off it, a bridge out to the realm
 * side so it is actually reachable on foot, and the Warden's pit sunk under
 * its middle.
 */
export function buildAncientCity(world: World): void {
  const lm = LANDMARKS.ancientCity;
  const cx = lm.center.x;
  const cz = lm.center.z;
  const level = 44;

  // the plate the city stands on
  const plateRegion = rect(cx - 46, cz - 40, cx + 46, cz + 40);
  plate(world, plateRegion, level, P.cobbledDeepslate, P.deepslate, 14);

  // ...and the two passes that stop the city reading as a grey slab: the outer
  // face becomes glazing, the top becomes inlaid paving. Both run before the
  // halls are raised so the buildings simply sit on top of them.
  glazePlateRim(world, plateRegion, level, 0x5c17);
  glazePlaza(world, plateRegion, level, cx + 2, cz + 2, 0x5c19);

  // spine, running along X through the middle
  corridor(world, cx - 40, cz - 1, cx + 40, cz + 1, level + 1, 5, 11);

  // three halls off the spine
  const halls: Array<[number, number, number, number]> = [
    [cx - 34, cz - 30, cx - 12, cz - 6],
    [cx - 6, cz - 32, cx + 20, cz - 8],
    [cx - 28, cz + 8, cx + 4, cz + 30],
  ];
  halls.forEach(([x1, z1, x2, z2], hallIndex) => {
    // floor: deepslate brick, with a glass inlay panel down the middle so the
    // pit's light comes up through the floor of the room above it
    world.fill(x1, level + 1, z1, x2, level + 1, z2, P.crackedDeepslateBricks);
    for (let z = z1 + 2; z <= z2 - 2; z++) {
      for (let x = x1 + 2; x <= x2 - 2; x++) {
        const onPanel = (x - x1) % 4 === 0 && (z - z1) % 4 === 0;
        if (onPanel) world.set(x, level + 1, z, prismAt(CITY_GLAZING, x, level + 1, z, 0x5c21 + hallIndex));
      }
    }

    // hollow, then a glazed vault instead of a solid roof: mullioned every
    // fifth block, glass between, so daylight comes down into the hall
    world.fill(x1 + 1, level + 2, z1 + 1, x2 - 1, level + 6, z2 - 1, AIR);
    for (let z = z1; z <= z2; z++) {
      for (let x = x1; x <= x2; x++) {
        const rib = (x - x1) % 5 === 0 || (z - z1) % 5 === 0;
        world.set(x, level + 7, z, rib ? P.deepslateBricks : prismAt(CITY_GLAZING, x, level + 7, z, 0x5c23 + hallIndex));
      }
    }

    // walls: a deepslate dado to shoulder height, a glazed band above it.
    // Only the perimeter - the hall's interior was just hollowed out.
    for (let y = level + 2; y <= level + 6; y++) {
      const band = y >= level + 4;
      const mullion = (y - level) % 2 === 0;
      for (let x = x1; x <= x2; x++) {
        for (const z of [z1, z2]) {
          const rib = (x - x1) % 4 === 0;
          world.set(
            x,
            y,
            z,
            band && !mullion && !rib ? prismAt(CITY_GLAZING, x, y, z, 0x5c25 + hallIndex) : P.deepslateBricks,
          );
        }
      }
      for (let z = z1 + 1; z < z2; z++) {
        for (const x of [x1, x2]) {
          const rib = (z - z1) % 4 === 0;
          world.set(
            x,
            y,
            z,
            band && !mullion && !rib ? prismAt(CITY_GLAZING, x, y, z, 0x5c25 + hallIndex) : P.deepslateBricks,
          );
        }
      }
    }

    // doorways punched through the long walls
    const doorX = Math.round((x1 + x2) / 2);
    for (let y = level + 2; y <= level + 4; y++) {
      world.set(doorX, y, z1, AIR);
      world.set(doorX, y, z2, AIR);
    }
    // chiseled frame around the door
    world.set(doorX, level + 5, z1, P.chiseledDeepslate);
    world.set(doorX, level + 5, z2, P.chiseledDeepslate);

    // a pillar in each corner of the hall
    for (const [px, pz] of [
      [x1 + 1, z1 + 1],
      [x2 - 1, z1 + 1],
      [x1 + 1, z2 - 1],
      [x2 - 1, z2 - 1],
    ]) {
      for (let y = level + 2; y <= level + 6; y++) world.set(px, y, pz, P.chiseledDeepslate);
    }

    // The Soul Keepers' mark, on the end wall the doorways do not use: an eye
    // in glazing with a mosaic frieze over it. This is the one motif that makes
    // the city read as *theirs* rather than as a deepslate ruin.
    const midZ = Math.round((z1 + z2) / 2);
    const halfW = Math.max(3, Math.min(6, Math.floor((z2 - z1) / 2) - 1));
    eyeWindow(world, x1, level + 4, midZ, halfW, 1, false, P.chiseledDeepslate, 0x5c27 + hallIndex, CITY_GLAZING);
    glassMosaic(world, x1, level + 6, midZ, halfW, 0, false, CITY_GLAZING, P.chiseledDeepslate, 0x5c29 + hallIndex);

    // two prism pillars inside, so the hall is lit from within as well as above
    prismPillar(world, x1 + 3, z1 + 3, level + 2, 5, CITY_GLAZING, 0x5c2b + hallIndex);
    prismPillar(world, x2 - 3, z2 - 3, level + 2, 5, CITY_GLAZING, 0x5c2d + hallIndex);

    // sculk creeping in from one corner
    sculkPatch(world, x2 - 2, z2 - 2, 6, (x1 * 31 + z1) & 0xffff, 0.6);

    // dark accent course along the top
    for (let x = x1; x <= x2; x++) {
      world.set(x, level + 7, z1, P.polishedDeepslate);
      world.set(x, level + 7, z2, P.polishedDeepslate);
    }
  });

  // the pit, sunk under the middle of the city
  wardenPit(world, cx + 2, cz + 2, level - 6, 77);

  // the bridge back to the realm, so the city is walkable rather than an island
  const bridgeX = cx - 46;
  for (let x = bridgeX - 26; x <= bridgeX; x++) {
    let surface = world.surfaceAt(x, cz);
    if (surface <= 0) {
      for (let y = 0; y <= level - 1; y++) world.set(x, y, cz, P.deepslate);
      surface = level - 1;
    }
    for (let w = -1; w <= 1; w++) {
      for (let y = surface + 1; y <= level; y++) world.set(x, y, cz + w, P.deepslateTiles);
      world.setSurface(x, cz + w, level);
      world.setLand(x, cz + w, true);
    }
    // a low parapet so the walk reads as a bridge, not a stripe on the ground
    if (x % 4 !== 0) {
      world.set(x, level + 1, cz - 1, P.cobbledDeepslateWall);
      world.set(x, level + 1, cz + 1, P.cobbledDeepslateWall);
    }
  }

  // gate posts at the city end of the bridge
  for (const gz of [cz - 1, cz + 1]) {
    for (let y = level + 1; y <= level + 6; y++) world.set(bridgeX, y, gz, P.chiseledDeepslate);
    world.set(bridgeX, level + 7, gz, P.sculkCatalyst);
  }
  seaLanternPost(world, bridgeX - 3, cz, level, 5);

  world.protect(cx, cz, 6);
}

/**
 * The Warden's arena.
 *
 * The same treatment as the Sunken City, and for the same reason: 48x46 of
 * polished deepslate is a large grey slab, and this is the one place in the
 * realm where a player is *supposed* to feel how big and how dark the thing in
 * front of them is. So the plate's outer face is glazed, the walk around the lip
 * is glazed, the buttresses are glazed, and the stair down is glazed.
 *
 * What did not change is the Warden. `wardenPit` is called with the same
 * arguments it always was and the bowl, the sculk, the shrieker, the sensors
 * and the catalyst rim are exactly as dark as they were. The glazing is on the
 * *rim*; the dark is in the hole. That contrast is the whole point - a fully
 * glazed bowl would be a pretty pit with nothing in it, and a fully bare plate
 * would be a car park with a hole in it.
 */
export function buildWardenArena(world: World): void {
  const lm = LANDMARKS.wardenArena;
  const cx = lm.center.x;
  const cz = lm.center.z;
  const level = 46;
  const region = rect(cx - 25, cz - 25, cx + 25, cz + 25);

  plate(world, region, level, P.polishedDeepslate, P.deepslate, 10);
  // ...and the two passes that stop it reading as a grey slab, the same two the
  // Sunken City gets. The rim is the 46-block wall of rock you approach from the
  // void ring; the inlay is the ground you cross to get to the lip.
  glazePlateRim(world, region, level, 0x5c31);
  // No green ring here: the ring walk below draws its own, and at a radius that
  // is actually on the plate.
  glazePlaza(world, region, level, cx, cz, 0x5c33, 0);

  // the pit itself - this is the arena. It has to be sunk here, inside this
  // footprint, or the ring walk is just a circle on a plate with nothing to
  // look down into. It runs *before* the walk, because it clears every column
  // inside its own radius up to the rim: a walk drawn first and then sunk is a
  // walk with its inner two courses deleted.
  wardenPit(world, cx, cz, level - 2, 91);

  // the ring walk looking in over the lip, from radius 22 (just outside the
  // bowl) out to 25 (the plate edge).
  glazeRingWalk(world, cx, cz, 25, 22, level, CITY_GLAZING, 0x5c35);

  // buttresses: a glazed pier on a deepslate base, still capped with a
  // catalyst so the ring reads as the Warden's territory and not as a balcony.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * 24);
    const z = Math.round(cz + Math.sin(a) * 24);
    world.set(x, level + 1, z, P.chiseledDeepslate);
    for (let y = level + 2; y <= level + 5; y++) {
      world.set(x, y, z, y % 2 === 0 ? prismAt(CITY_GLAZING, x, y, z, 0x5c37 + i) : P.chiseledDeepslate);
    }
    world.set(x, level + 6, z, P.sculkCatalyst);
  }

  // lanterns on the ring, spaced so the walk is readable in the dark
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.round(cx + Math.cos(a) * 23);
    const z = Math.round(cz + Math.sin(a) * 23);
    seaLanternPost(world, x, z, level, 4);
  }

  // the descent: a switchback stair down toward the pit floor. It stays bare
  // polished deepslate on purpose. Everything *around* the bowl is glazing now,
  // and the one thing that must not be is the way down - the whole point of
  // the arena is that the last twenty blocks of it are unlit, and a lit
  // balustrade leading to the bottom would take that away. A lamp every fourth
  // step marks the route without lighting the destination.
  for (let i = 0; i < 26; i++) {
    const stepY = level - 1 - i;
    const dir = Math.floor(i / 13) % 2 === 0 ? 1 : -1;
    const along = i % 13;
    const x = Math.round(cx + (dir > 0 ? -21 + along : 21 - along));
    const z = cz + (dir > 0 ? -3 : 3);
    for (let w = -1; w <= 1; w++) {
      world.set(x, stepY, z + w, P.polishedDeepslate);
      world.setSurface(x, z + w, stepY);
      world.setLand(x, z + w, true);
    }
    if (i % 4 === 0) world.set(x, stepY + 2, z, P.sculkSensor);
  }

  world.protect(cx, cz, 8);
}
