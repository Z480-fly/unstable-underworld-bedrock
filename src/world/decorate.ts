/**
 * Detail pass. Runs last, after terrain, landmarks and roads, and only touches
 * columns that are not protected (so it never punches holes in a building or a
 * road). This is what keeps the wasteland from reading as bare noise: boulders,
 * dead trees, bones, soul fires, sculk, cairns -
 *
 * and, dominant over all of those, the two things the references describe as
 * defining the place: "an endless plain of broken structures", and ground that
 * is cracking apart ("cracks of void forming on the ground", "sometimes these
 * barren wastelands fracture to void"). So this file carries four passes:
 *
 *   1. `scatterRuins` - half-buried wall stubs, fallen columns, broken arches
 *      and gate frames spread across every piece of wilderness.
 *   2. `carveGroundFractures` - long, thin, wandering cracks in the plate. Half
 *      of them bottom out in magma and obsidian; the other half tear all the
 *      way through and open onto the void, which is what makes the plain read
 *      as a plate that is coming apart rather than as flat noise.
 *   3. `scatterPlateShards` - the same tearing seen from the void side: chunks
 *      of masonry drifting just clear of the rim, and teeth of obsidian hanging
 *      off the torn underside.
 *   4. the per-column scatter below (boulders, trees, bones, fires, cairns).
 */

import { AIR, P, type BlockState } from "./blocks.ts";
import { CONFIG, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z } from "./config.ts";
import { LANDMARKS } from "./layout.ts";
import { hash2, Rng } from "./noise.ts";
import { darkness } from "./terrain.ts";
import type { World } from "./world.ts";

/**
 * Masonry for ruins, darkening toward the west exactly like the terrain does.
 * The switch is probabilistic rather than a hard line at x=-60: a ruin this far
 * west is as likely to be black stone as the surrounding ground is dark, so the
 * change of material reads as a gradient and not as a seam.
 */
function ruinMasonry(x: number, z: number): BlockState[] {
  const n = hash2(x, z, CONFIG.seed + 920);
  const west = hash2(x, z, CONFIG.seed + 921) < darkness(x);
  if (west) {
    return n < 0.4
      ? [P.blackstoneBricks, P.crackedBlackstoneBricks]
      : n < 0.7
        ? [P.blackstone, P.polishedBlackstone]
        : [P.deepslateBricks, P.crackedDeepslateBricks];
  }
  return n < 0.45
    ? [P.deepslateBricks, P.crackedDeepslateBricks]
    : n < 0.7
      ? [P.cobbledDeepslate, P.deepslate]
      : [P.polishedDeepslate, P.deepslateTiles];
}

/**
 * Half-buried ruins: the plain is *covered* in collapsed masonry, not empty.
 * Only ever placed on solid, unprotected ground away from the landmarks, so it
 * can never cut a road or grow through a building.
 */
function scatterRuins(world: World): void {
  for (let z = WORLD_MIN_Z; z <= WORLD_MAX_Z; z += 3) {
    for (let x = WORLD_MIN_X; x <= WORLD_MAX_X; x += 3) {
      if (!world.inRealm(x, z) || !world.isLand(x, z) || world.isProtected(x, z)) continue;
      if (hash2(x, z, CONFIG.seed + 930) > 0.2) continue;
      // The landmark *footprints* are already off limits, and their pads are
      // protected; this only keeps masonry from sprouting against a wall.
      if (nearLandmark(x, z, 3)) continue;
      const variant = hash2(x, z, CONFIG.seed + 931);
      const masonry = ruinMasonry(x, z);
      const wall = masonry[0]!;
      const broken = masonry[1]!;

      if (variant < 0.3) {
        // Wall stub: half-buried, eroded to nothing at both ends, gaps knocked
        // out. The bottom course sits *in* the ground so it reads as old.
        const alongX = hash2(x, z, CONFIG.seed + 932) < 0.5;
        const length = 5 + Math.floor(hash2(x, z, CONFIG.seed + 933) * 8);
        const peak = 2 + Math.floor(hash2(x, z, CONFIG.seed + 934) * 4);
        for (let i = 0; i < length; i++) {
          const px = alongX ? x + i : x;
          const pz = alongX ? z : z + i;
          if (!world.inRealm(px, pz) || !world.isLand(px, pz)) break;
          const t = i / (length - 1);
          const height = Math.round(peak * (1 - Math.abs(t * 2 - 1)));
          const base = world.surfaceAt(px, pz);
          for (let h = 0; h <= height; h++) {
            if (h > 0 && hash2(px, pz + h, CONFIG.seed + 935) < 0.18) continue; // knocked out
            if (h === 0) world.set(px, base, pz, wall);
            else world.setIfAir(px, base + h, pz, h === height ? broken : wall);
          }
        }
      } else if (variant < 0.48) {
        // Ruined tower stump: a ragged ring of masonry, tall on one side and
        // collapsed on the other. This is the silhouette that reads from far
        // away on the plain.
        const radius = 1 + Math.floor(hash2(x, z, CONFIG.seed + 945) * 2);
        const height = 4 + Math.floor(hash2(x, z, CONFIG.seed + 946) * 6);
        const thinAt = hash2(x, z, CONFIG.seed + 947) * Math.PI * 2;
        for (let dz = -radius; dz <= radius; dz++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const d = Math.hypot(dx, dz);
            if (d > radius + 0.35 || d < radius - 0.75) continue;
            const px = x + dx;
            const pz = z + dz;
            if (!world.inRealm(px, pz) || !world.isLand(px, pz)) continue;
            const angle = Math.atan2(dz, dx);
            const erode = Math.round((Math.cos(angle - thinAt) + 1) * 1.6);
            const top = Math.max(1, height - erode);
            for (let h = 0; h <= top; h++) {
              if (h > 0 && hash2(px, pz + h, CONFIG.seed + 948) < 0.12) continue;
              world.setIfAir(px, world.surfaceAt(px, pz) + h, pz, h === top ? broken : wall);
            }
          }
        }
      } else if (variant < 0.68) {
        // Fallen column lying on the ground, plus its snapped stump.
        const alongX = hash2(x, z, CONFIG.seed + 936) < 0.5;
        const length = 4 + Math.floor(hash2(x, z, CONFIG.seed + 937) * 5);
        for (let i = 0; i < length; i++) {
          const px = alongX ? x + i : x;
          const pz = alongX ? z : z + i;
          if (!world.inRealm(px, pz) || !world.isLand(px, pz)) break;
          world.setIfAir(px, world.surfaceAt(px, pz) + 1, pz, P.polishedDeepslate);
        }
        const base = world.surfaceAt(x, z);
        world.column(x, z, base + 1, base + 2, P.polishedDeepslate);
        world.set(x, base + 3, z, P.chiseledDeepslate);
      } else if (variant < 0.87) {
        // Rubble field: a low, uneven spread of broken masonry.
        const spread = hash2(x, z, CONFIG.seed + 949) < 0.35 ? 2 : 1;
        for (let dz = -spread; dz <= spread; dz++) {
          for (let dx = -spread; dx <= spread; dx++) {
            const px = x + dx;
            const pz = z + dz;
            if (!world.inRealm(px, pz) || !world.isLand(px, pz)) continue;
            if (hash2(px, pz, CONFIG.seed + 938) < 0.25) continue;
            const h = 1 + (hash2(px, pz, CONFIG.seed + 939) < 0.4 ? 1 : 0);
            for (let k = 0; k <= h; k++) {
              world.setIfAir(px, world.surfaceAt(px, pz) + k, pz, k === h ? broken : wall);
            }
          }
        }
      } else {
        // Broken gate frame: two piers with a lintel that only partly survived.
        const alongX = hash2(x, z, CONFIG.seed + 941) < 0.5;
        const span = 4 + Math.floor(hash2(x, z, CONFIG.seed + 942) * 3);
        const pierHeight = 3 + Math.floor(hash2(x, z, CONFIG.seed + 943) * 4);
        for (const end of [0, span]) {
          const px = alongX ? x + end : x;
          const pz = alongX ? z : z + end;
          if (!world.inRealm(px, pz) || !world.isLand(px, pz)) continue;
          const base = world.surfaceAt(px, pz);
          const height = end === 0 ? pierHeight : Math.max(1, pierHeight - 1);
          for (let h = 0; h <= height; h++) {
            world.setIfAir(px, base + h, pz, h === height ? broken : wall);
          }
        }
        for (let i = 1; i < span; i++) {
          if (hash2(x + i, z, CONFIG.seed + 944) < 0.45) continue; // the span fell in
          const px = alongX ? x + i : x;
          const pz = alongX ? z : z + i;
          if (!world.inRealm(px, pz) || !world.isLand(px, pz)) continue;
          world.setIfAir(px, world.surfaceAt(px, pz) + pierHeight, pz, broken);
        }
      }
    }
  }
}

/**
 * Ground fractures: long, thin cracks wandering across the plate.
 *
 * Half of them are shallow seams floored with magma and obsidian; the other
 * half tear clean through the plate and open onto the void, which is the
 * "sometimes these barren wastelands fracture to void" of the references. They
 * are 1-2 blocks across, never cut a road, never run through a landmark, and
 * whatever they open is marked void + protected so no later pass tries to build
 * on thin air.
 */
function carveGroundFractures(world: World): void {
  const rng = new Rng(CONFIG.seed ^ 0xc7a4);
  const clear = (px: number, pz: number): boolean =>
    world.inRealm(px, pz) &&
    world.isLand(px, pz) &&
    !world.isProtected(px, pz) &&
    !nearLandmark(px, pz, 2);

  for (let crack = 0; crack < 12; crack++) {
    // The crack is *walked* first and carved afterwards, for two reasons: a
    // through-crack turns its own columns into void (which would abort a
    // step-by-step walk), and the walk has to cross a whole plate that is mostly
    // covered by landmarks and roads. A crack that stopped at the first
    // protected cell would never carve anything at all, so instead it runs its
    // full length and simply *skips* the cells it must not cut - which is also
    // what a real crack does when it hits a paved road.
    const path: Array<{ x: number; z: number; dirX: number; dirZ: number }> = [];
    let x = rng.int(WORLD_MIN_X + 12, WORLD_MAX_X - 12);
    let z = rng.int(WORLD_MIN_Z + 12, WORLD_MAX_Z - 12);
    let angle = rng.next() * Math.PI * 2;
    const length = rng.int(34, 78);
    const breakthrough = rng.next() < 0.5;
    for (let step = 0; step < length; step++) {
      angle += (rng.next() - 0.5) * 0.5;
      const dirX = Math.cos(angle) > 0 ? 1 : -1;
      const dirZ = Math.sin(angle) > 0 ? 1 : -1;
      x += dirX;
      z += dirZ;
      if (!world.inRealm(x, z)) break;
      path.push({ x, z, dirX, dirZ });
    }

    for (let i = 0; i < path.length; i++) {
      const cell = path[i]!;
      if (!clear(cell.x, cell.z)) continue;
      // The middle stretch of a breakthrough crack is open to the void; every
      // other cell, and every other crack, bottoms out in magma and obsidian.
      // `t` is measured against the path that was actually walked, not the
      // planned length: a crack that leaves the plate half way through would
      // otherwise never reach the window and would open nothing at all.
      const t = path.length === 1 ? 0.5 : i / (path.length - 1);
      const through = breakthrough && t > 0.35 && t < 0.65;
      const surface = world.surfaceAt(cell.x, cell.z);
      // A through-crack is cleared from the surface right down to the bottom of
      // the plate; a seam stops a few blocks down.
      const depth = through ? surface + 1 : 3 + rng.int(0, 3);
      for (let y = surface; y > surface - depth; y--) world.set(cell.x, y, cell.z, AIR);

      if (through) {
        // Torn clean through: the column is void now, and the decoration passes
        // must stop treating its old surface as ground.
        world.setLand(cell.x, cell.z, false);
        world.setSurface(cell.x, cell.z, 0);
        // Harden the walls of the slit so it reads as torn rock instead of as a
        // clean cut, exactly like `carveChasmWalls` does for the chasms.
        for (const [ox, oz] of [
          [cell.dirZ, cell.dirX],
          [-cell.dirZ, -cell.dirX],
        ] as const) {
          const nx = cell.x + ox;
          const nz = cell.z + oz;
          if (!clear(nx, nz)) continue;
          const ny = world.surfaceAt(nx, nz);
          world.set(nx, ny, nz, P.cobbledDeepslate);
          world.set(nx, ny - 1, nz, P.deepslate);
        }
      } else {
        world.set(cell.x, surface - depth, cell.z, rng.chance(0.35) ? P.magma : P.obsidian);
        if (rng.chance(0.2)) world.set(cell.x, surface - depth + 1, cell.z, P.cryingObsidian);
        world.setSurface(cell.x, cell.z, surface - depth);
      }
      // Nothing may grow inside a crack - not ruins, not scatter, nothing.
      world.protect(cell.x, cell.z);

      // Occasionally tear the slit wider, so a crack is 1-2 blocks across and
      // reads on a phone screen instead of as a hairline.
      if (!through || !rng.chance(0.3)) continue;
      const side = rng.chance(0.5) ? 1 : -1;
      const nx = cell.x + cell.dirZ * side;
      const nz = cell.z + cell.dirX * side;
      if (!clear(nx, nz)) continue;
      for (let y = world.surfaceAt(nx, nz); y >= 0; y--) world.set(nx, y, nz, AIR);
      world.setLand(nx, nz, false);
      world.setSurface(nx, nz, 0);
      world.protect(nx, nz);
    }
  }
}

/** Height of the nearest surviving land column, or undefined if there is none nearby. */
function plateHeightNear(world: World, x: number, z: number, radius: number): number | undefined {
  let best: number | undefined;
  let bestD = radius * radius + 1;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = dx * dx + dz * dz;
      if (d >= bestD) continue;
      const nx = x + dx;
      const nz = z + dz;
      if (!world.inRealm(nx, nz) || !world.isLand(nx, nz)) continue;
      bestD = d;
      best = world.surfaceAt(nx, nz);
    }
  }
  return best;
}

/**
 * Material for a torn-off chunk of the plate - the same rock the plate is made
 * of, plus the occasional pane of Soul Keeper glazing torn off with it: glass
 * drifting in the void is the same "broken structures" story the ruins tell
 * on the ground, seen from the outside.
 */
function shardBlock(n: number): BlockState {
  if (n < 0.28) return P.deepslate;
  if (n < 0.52) return P.cobbledDeepslate;
  if (n < 0.74) return P.tuff;
  if (n < 0.88) return P.blackstone;
  if (n < 0.94) return P.deepslateBricks;
  if (n < 0.97) return P.grayGlass;
  return P.greenGlass;
}

/**
 * The rim of the plate from the void side.
 *
 * The wasteland does not end in a clean cut: it sheds. Small torn chunks of the
 * same rock drift just clear of the edge, and teeth of obsidian (with the odd
 * crying-obsidian tip) hang off the underside. This is the "fracture to void"
 * of the references seen from outside, and it is what stops the realm from
 * reading as a floating rectangle with a tidy border.
 *
 * Only ever writes into void columns, so it can never punch through the plate,
 * and it hugs the edge (the expensive neighbour lookup runs only after the
 * cheap hash rejection).
 */
function scatterPlateShards(world: World): void {
  for (let z = WORLD_MIN_Z; z <= WORLD_MAX_Z; z += 2) {
    for (let x = WORLD_MIN_X; x <= WORLD_MAX_X; x += 2) {
      if (!world.inRealm(x, z) || world.isLand(x, z)) continue;
      if (hash2(x, z, CONFIG.seed + 960) > 0.06) continue;
      const height = plateHeightNear(world, x, z, 5);
      if (height === undefined) continue;
      const variant = hash2(x, z, CONFIG.seed + 961);

      if (variant < 0.3) {
        // Obsidian tooth hanging off the torn underside.
        const drop = 1 + Math.floor(hash2(x, z, CONFIG.seed + 962) * 6);
        if (height - drop < 2) continue;
        for (let y = height - 1; y >= height - drop; y--) {
          world.set(x, y, z, y === height - drop ? P.cryingObsidian : P.obsidian);
        }
      } else {
        // A chunk of the plate that has torn free and is drifting clear.
        const y = height - 2 - Math.floor(hash2(x, z, CONFIG.seed + 963) * 12);
        if (y < 3) continue;
        const spread = hash2(x, z, CONFIG.seed + 964) < 0.35 ? 2 : 1;
        for (let dz = -spread; dz <= spread; dz++) {
          for (let dx = -spread; dx <= spread; dx++) {
            const nx = x + dx;
            const nz = z + dz;
            // Never write back into the plate itself.
            if (!world.inRealm(nx, nz) || world.isLand(nx, nz)) continue;
            const n = hash2(nx, nz, CONFIG.seed + 965);
            if (n < 0.35) continue;
            const py = y - (hash2(nx, nz, CONFIG.seed + 966) < 0.4 ? 1 : 0);
            world.set(nx, py, nz, shardBlock(n));
          }
        }
      }
    }
  }
}

export function decorate(world: World): void {
  const rng = new Rng(CONFIG.seed ^ 0x5eed);

  carveGroundFractures(world);
  scatterRuins(world);
  scatterPlateShards(world);

  for (let z = WORLD_MIN_Z; z <= WORLD_MAX_Z; z += 2) {
    for (let x = WORLD_MIN_X; x <= WORLD_MAX_X; x += 2) {
      if (!world.inRealm(x, z) || !world.isLand(x, z) || world.isProtected(x, z)) continue;
      const surface = world.surfaceAt(x, z);
      const r = hash2(x, z, CONFIG.seed + 900);
      const jitterX = x + (r < 0.5 ? 1 : 0);
      const jitterZ = z + (hash2(z, x, CONFIG.seed + 901) < 0.5 ? 1 : 0);

      // Boulders and outcrops.
      if (r < 0.035) {
        const h = 1 + Math.floor(hash2(x, z, 902) * 3);
        for (let dy = 0; dy < h; dy++) {
          world.set(jitterX, surface + 1 + dy, jitterZ, r < 0.015 ? P.tuff : P.cobbledDeepslate);
        }
        if (r < 0.008) world.set(jitterX, surface + h + 1, jitterZ, P.chiseledDeepslate);
        continue;
      }

      // Dead trees: dark, leafless, the only vertical life left.
      if (r > 0.988 && !nearLandmark(x, z, 40)) {
        const h = 5 + Math.floor(hash2(x, z, 903) * 7);
        for (let dy = 1; dy <= h; dy++) world.set(jitterX, surface + dy, jitterZ, P.darkOakLog);
        const branches = 2 + Math.floor(hash2(x, z, 904) * 3);
        for (let b = 0; b < branches; b++) {
          const dir = Math.floor(hash2(x + b, z, 905) * 4);
          const dx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
          const dz = dir === 2 ? 1 : dir === 3 ? -1 : 0;
          const by = surface + h - 1 - b;
          world.set(jitterX + dx, by, jitterZ + dz, P.darkOakLog);
          world.set(jitterX + dx * 2, by + 1, jitterZ + dz * 2, P.darkOakLog);
        }
        continue;
      }

      // Bones and debris on the soul flats.
      if (r > 0.955 && r <= 0.965) {
        const onSoul = world.get(x, surface, z)?.name?.includes("soul") ?? false;
        world.set(jitterX, surface + 1, jitterZ, onSoul ? P.bone : P.gravel);
        continue;
      }

      // Soul fires: the map's only warm light, sparse and deliberate.
      if (r > 0.978 && r <= 0.983) {
        world.set(jitterX, surface + 1, jitterZ, P.soulSoil);
        world.set(jitterX, surface + 2, jitterZ, P.soulCampfire);
        continue;
      }

      // Sculk creep in the shadow of the tomb.
      if (r > 0.968 && r <= 0.978) {
        const d = Math.hypot(x - LANDMARKS.tomb.center.x, z - LANDMARKS.tomb.center.z);
        if (d < 90) world.set(jitterX, surface + 1, jitterZ, P.sculkVein);
        continue;
      }

      // Cairns along the rim of the void so the edge is readable.
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge > 168 && r > 0.9) {
        world.set(jitterX, surface + 1, jitterZ, P.obsidian);
        if (r > 0.96) world.set(jitterX, surface + 2, jitterZ, P.cryingObsidian);
      }
    }
  }
}

function nearLandmark(x: number, z: number, radius: number): boolean {
  for (const landmark of Object.values(LANDMARKS)) {
    const rect = landmark.footprint;
    if (
      x >= rect.x1 - radius &&
      x <= rect.x2 + radius &&
      z >= rect.z1 - radius &&
      z <= rect.z2 + radius
    ) {
      return true;
    }
  }
  return false;
}

/** Renders a top-down colour map of the realm - used for the world icon. */
export function colorAt(world: World, x: number, z: number): [number, number, number] {
  const surface = world.surfaceAt(x, z);
  let name = "minecraft:air";
  for (let y = Math.min(CONFIG.maxY, surface + 40); y >= 0; y--) {
    const block = world.get(x, y, z);
    if (block && block.name !== "minecraft:air") {
      name = block.name;
      break;
    }
  }
  const table: Record<string, [number, number, number]> = {
    "minecraft:deepslate": [72, 72, 78],
    "minecraft:cobbled_deepslate": [66, 66, 72],
    "minecraft:polished_deepslate": [80, 80, 88],
    "minecraft:deepslate_bricks": [74, 74, 82],
    "minecraft:deepslate_tiles": [62, 62, 70],
    "minecraft:blackstone": [42, 38, 42],
    "minecraft:polished_blackstone": [48, 42, 48],
    "minecraft:tuff": [90, 92, 88],
    // Green stained glass stands in for every gravity block in the palette
    // (gravel, sand, concrete powder) - see `stabilize` in blocks.ts.
    "minecraft:green_stained_glass": [86, 146, 72],
    "minecraft:soul_sand": [82, 66, 56],
    "minecraft:soul_soil": [70, 56, 48],
    "minecraft:sculk": [22, 42, 52],
    "minecraft:obsidian": [24, 18, 38],
    "minecraft:crying_obsidian": [42, 24, 76],
    "minecraft:lava": [226, 112, 26],
    "minecraft:magma": [140, 62, 30],
    "minecraft:netherrack": [104, 48, 48],
    "minecraft:snow_layer": [238, 244, 250],
    "minecraft:snow": [240, 246, 252],
    "minecraft:powder_snow": [232, 240, 248],
    "minecraft:ice": [160, 200, 232],
    "minecraft:packed_ice": [140, 186, 226],
    "minecraft:blue_ice": [120, 168, 226],
    "minecraft:farmland": [96, 68, 42],
    "minecraft:wheat": [186, 162, 74],
    "minecraft:hay_block": [166, 140, 56],
    "minecraft:gold_block": [246, 214, 74],
    "minecraft:gilded_blackstone": [70, 58, 46],
    "minecraft:glass": [190, 214, 226],
    "minecraft:gray_stained_glass": [110, 118, 124],
    "minecraft:black_concrete": [14, 14, 18],
    "minecraft:water": [58, 92, 160],
    "minecraft:bookshelf": [124, 100, 64],
    "minecraft:dark_oak_log": [62, 46, 28],
    "minecraft:spruce_log": [72, 54, 34],
    "minecraft:stone_bricks": [122, 122, 122],
    "minecraft:cracked_deepslate_bricks": [68, 68, 76],
    "minecraft:chiseled_deepslate": [86, 86, 94],
    "minecraft:polished_blackstone_bricks": [54, 48, 54],
    "minecraft:cracked_polished_blackstone_bricks": [46, 41, 46],
    "minecraft:chiseled_polished_blackstone": [58, 52, 58],
    "minecraft:mossy_stone_bricks": [110, 122, 104],
    "minecraft:spruce_planks": [110, 84, 50],
    "minecraft:dark_oak_planks": [66, 44, 24],
    "minecraft:iron_bars": [150, 150, 155],
    "minecraft:stone_pressure_plate": [130, 130, 130],
    "minecraft:copper_bulb": [186, 122, 90],
    "minecraft:lit_redstone_lamp": [206, 148, 84],
    "minecraft:bone_block": [228, 224, 200],
    "minecraft:portal": [108, 40, 168],
    "minecraft:polished_blackstone_brick_slab": [50, 45, 50],
    "minecraft:soul_lantern": [96, 168, 168],
    "minecraft:lantern": [222, 176, 108],
  };
  return table[name] ?? [60, 60, 66];
}
