/**
 * Reusable builders. Every landmark in `areas.ts` is assembled from these, which
 * keeps the reconstruction readable: the Citadel, the Withered Castle and the
 * void castles all use the same tower/wall/gate primitives, just at different
 * scales and with different materials.
 *
 * All builders take *world* coordinates and ask the terrain for the local ground
 * height, so nothing floats.
 */

import { AIR, P, slab, stairs, wall, type BlockState } from "./blocks.ts";
import type { World } from "./world.ts";
import { Rng } from "./noise.ts";
import type { RectRegion } from "./layout.ts";

export interface BuildStyle {
  wall: BlockState;
  accent: BlockState;
  trim: BlockState;
  roof: BlockState;
  floor: BlockState;
  light: BlockState;
  fence?: BlockState;
}

export const DEEPSLATE_STYLE: BuildStyle = {
  wall: P.deepslateBricks,
  accent: P.polishedDeepslate,
  trim: P.chiseledDeepslate,
  roof: P.deepslateTiles,
  floor: P.polishedDeepslate,
  light: P.soulLantern,
  fence: P.darkOakFence,
};

export const BLACKSTONE_STYLE: BuildStyle = {
  wall: P.blackstoneBricks,
  accent: P.chiseledBlackstone,
  trim: P.gildedBlackstone,
  roof: P.crackedBlackstoneBricks,
  floor: P.polishedBlackstone,
  light: P.soulLantern,
  fence: P.spruceFence,
};

export const STONE_STYLE: BuildStyle = {
  wall: P.stoneBrick,
  accent: P.chiseledStoneBrick,
  trim: P.mossyStoneBrick,
  roof: P.crackedStoneBrick,
  floor: P.stoneBrick,
  light: P.lantern,
  fence: P.darkOakFence,
};

export function groundY(world: World, x: number, z: number): number {
  return world.surfaceAt(x, z);
}

/** Average ground height over an area, used as the build level for a structure. */
export function areaGround(world: World, rect: RectRegion): number {
  let sum = 0;
  let count = 0;
  for (let z = rect.z1; z <= rect.z2; z += 3) {
    for (let x = rect.x1; x <= rect.x2; x += 3) {
      sum += world.surfaceAt(x, z);
      count++;
    }
  }
  return Math.round(sum / Math.max(1, count));
}

/**
 * Levels an area to `level`: fills hollows and cuts high ground, then lays a
 * paved top. Buildings are always placed on a levelled pad so they read as
 * deliberate constructions on the wasteland.
 */
export function pad(
  world: World,
  rect: RectRegion,
  level: number,
  top: BlockState,
  fill: BlockState = P.cobbledDeepslate,
  edgeRamp = true,
): void {
  // Always force a solid foundation under landmarks so nothing floats or sinks
  // into the void even if terrain carving was aggressive.
  for (let z = rect.z1 - (edgeRamp ? 4 : 0); z <= rect.z2 + (edgeRamp ? 4 : 0); z++) {
    for (let x = rect.x1 - (edgeRamp ? 4 : 0); x <= rect.x2 + (edgeRamp ? 4 : 0); x++) {
      if (!world.inRealm(x, z)) continue;
      const inside = x >= rect.x1 && x <= rect.x2 && z >= rect.z1 && z <= rect.z2;
      let surface = world.surfaceAt(x, z);

      // If the column was previously void, create a solid pillar up to the pad.
      if (!world.isLand(x, z) || surface < 8) {
        surface = Math.max(8, level - 12);
        for (let y = 0; y <= surface; y++) {
          world.set(x, y, z, y <= 2 ? P.deepslate : fill);
        }
        world.setLand(x, z, true);
        world.setSurface(x, z, surface);
      }

      if (!inside) {
        if (surface < level) {
          for (let y = surface + 1; y <= Math.min(level - 1, surface + 4); y++) world.set(x, y, z, fill);
          world.setSurface(x, z, Math.min(level - 1, surface + 4));
        }
        continue;
      }
      if (surface < level) {
        for (let y = surface + 1; y <= level; y++) world.set(x, y, z, y === level ? top : fill);
      } else if (surface > level) {
        for (let y = level + 1; y <= surface; y++) world.set(x, y, z, AIR);
        world.set(x, level, z, top);
      } else {
        world.set(x, level, z, top);
      }
      for (let y = level - 1; y >= Math.max(0, level - 10); y--) {
        if (!world.get(x, y, z) || world.get(x, y, z)!.name === "minecraft:air") {
          world.set(x, y, z, fill);
        }
      }
      world.setSurface(x, z, level);
      world.setLand(x, z, true);
      world.protect(x, z);
    }
  }
}
