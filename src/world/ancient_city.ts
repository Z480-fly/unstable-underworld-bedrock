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
 */
import { AIR, P, type BlockState } from "./blocks.ts";
import { LANDMARKS, type RectRegion } from "./layout.ts";
import { hash2 } from "./noise.ts";
import { seaLanternPost } from "./structures_glass.ts";
import type { World } from "./world.ts";

function rect(x1: number, z1: number, x2: number, z2: number): RectRegion {
  return { kind: "rect", x1, z1, x2, z2 };
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
      world.set(bx, floorY + height, bz, P.deepslateBricks);
      for (let y = floorY + 1; y < floorY + height; y++) {
        world.set(bx, y, bz, y === floorY + 1 ? P.deepslateBricks : AIR);
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

      for (let yy = 3; yy <= y; yy++) world.set(x, yy, z, P.deepslate);
      world.set(x, y, z, t < 0.35 ? P.sculk : P.cobbledDeepslate);
      world.setSurface(x, z, y);
      world.setLand(x, z, true);
      world.protect(x, z);
    }
  }

  // sculk eating outward from the floor
  sculkPatch(world, cx, cz, radius, seed, 0.85);
  sculkPatch(world, cx + 6, cz - 5, 9, seed + 1, 0.5);
  sculkPatch(world, cx - 7, cz + 6, 8, seed + 2, 0.45);

  // the shrieker, ringed so it reads as the focal point
  const floor = world.surfaceAt(cx, cz);
  world.set(cx, floor, cz, P.sculkShrieker);
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
  plate(world, rect(cx - 46, cz - 40, cx + 46, cz + 40), level, P.cobbledDeepslate, P.deepslate, 14);

  // spine, running along X through the middle
  corridor(world, cx - 40, cz - 1, cx + 40, cz + 1, level + 1, 5, 11);

  // three halls off the spine
  const halls: Array<[number, number, number, number]> = [
    [cx - 34, cz - 30, cx - 12, cz - 6],
    [cx - 6, cz - 32, cx + 20, cz - 8],
    [cx - 28, cz + 8, cx + 4, cz + 30],
  ];
  for (const [x1, z1, x2, z2] of halls) {
    // floor + roof + walls as a hollow room
    world.fill(x1, level + 1, z1, x2, level + 1, z2, P.crackedDeepslateBricks);
    world.fill(x1, level + 7, z1, x2, level + 7, z2, P.deepslateBricks);
    world.rectWalls(x1, z1, x2, z2, level + 2, level + 6, P.deepslateBricks);
    world.fill(x1 + 1, level + 2, z1 + 1, x2 - 1, level + 6, z2 - 1, AIR);

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

    // sculk creeping in from one corner
    sculkPatch(world, x2 - 2, z2 - 2, 6, (x1 * 31 + z1) & 0xffff, 0.6);

    // dark accent course along the top
    for (let x = x1; x <= x2; x++) {
      world.set(x, level + 7, z1, P.polishedDeepslate);
      world.set(x, level + 7, z2, P.polishedDeepslate);
    }
  }

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
 * The landing shelf: a lit viewing platform on the rim of the pit, so the
 * player has somewhere to stand and look down into it before committing.
 */
export function buildWardenArena(world: World): void {
  const lm = LANDMARKS.wardenArena;
  const cx = lm.center.x;
  const cz = lm.center.z;
  const level = 46;

  plate(world, rect(cx - 24, cz - 20, cx + 24, cz + 20), level, P.polishedDeepslate, P.deepslate, 10);

  // a ring walk looking in over the pit
  world.ring(cx, cz, 22, level, P.deepslateTiles);
  world.ring(cx, cz, 19, level, P.cobbledDeepslate);

  // buttresses
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * 21);
    const z = Math.round(cz + Math.sin(a) * 21);
    for (let y = level + 1; y <= level + 4; y++) world.set(x, y, z, P.chiseledDeepslate);
    world.set(x, level + 5, z, P.sculkCatalyst);
  }

  // lanterns on the ring, spaced so the walk is readable in the dark
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.round(cx + Math.cos(a) * 20);
    const z = Math.round(cz + Math.sin(a) * 20);
    seaLanternPost(world, x, z, level, 4);
  }

  // the pit itself - this is the arena. It has to be sunk here, inside this
  // footprint, or the ring walk is just a circle on a plate with nothing to
  // look down into.
  wardenPit(world, cx, cz, level - 2, 91);

  // the descent: a switchback stair down toward the pit floor
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
  }

  world.protect(cx, cz, 8);
}
