/**
 * Detail pass. Runs last, after terrain, landmarks and roads, and only touches
 * columns that are not protected (so it never punches holes in a building or a
 * road). This is what keeps the wasteland from reading as bare noise: boulders,
 * dead trees, bones, soul fires, sculk, cairns.
 */

import { P } from "./blocks.ts";
import { CONFIG } from "./config.ts";
import { LANDMARKS } from "./layout.ts";
import { hash2, Rng } from "./noise.ts";
import type { World } from "./world.ts";

function isAir(world: World, x: number, y: number, z: number): boolean {
  const block = world.get(x, y, z);
  return block === undefined || block.name === "minecraft:air";
}

export function decorate(world: World): void {
  const rng = new Rng(CONFIG.seed ^ 0x5eed);

  for (let z = -190; z <= 190; z += 2) {
    for (let x = -190; x <= 190; x += 2) {
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
    "minecraft:gravel": [124, 118, 114],
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
    "minecraft:stonebrick": [122, 122, 122],
  };
  return table[name] ?? [60, 60, 66];
}
