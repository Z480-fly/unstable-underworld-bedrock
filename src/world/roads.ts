/**
 * The road network.
 *
 * Roads are painted *after* the terrain, follow the ground, and bridge whatever
 * they run into: chasms to the void get bridges (the broken one included), lava
 * gets causeways, and anything that is not land gets supported so the paths read
 * as deliberately built. Road corridors are protected so later terrain passes
 * cannot erase them.
 */

import { AIR, P, type BlockState } from "./blocks.ts";
import { CONFIG } from "./config.ts";
import { CHASMS } from "./terrain.ts";
import { ROADS, type RoadPath } from "./layout.ts";
import { BLACKSTONE_STYLE, bridge, lampPost } from "./structures.ts";
import type { World } from "./world.ts";

function roadSurface(style: RoadPath["style"]): { top: BlockState; edge: BlockState } {
  switch (style) {
    case "main":
      return { top: P.deepslateTiles, edge: P.polishedBlackstone };
    case "broken":
      return { top: P.crackedDeepslateBricks, edge: P.gravel };
    default:
      return { top: P.cobbledDeepslate, edge: P.gravel };
  }
}

function flattenPath(path: RoadPath): Array<{ x: number; z: number }> {
  const points = [path.from, ...(path.via ?? []), path.to];
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      out.push({ x: Math.round(a.x + (b.x - a.x) * t), z: Math.round(a.z + (b.z - a.z) * t) });
    }
  }
  return out;
}

function isNearChasm(x: number, z: number, margin = 3): boolean {
  for (const chasm of CHASMS) {
    for (let i = 0; i < chasm.points.length - 1; i++) {
      const a = chasm.points[i]!;
      const b = chasm.points[i + 1]!;
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const wx = x - a.x;
      const wz = z - a.z;
      const len2 = vx * vx + vz * vz;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wz * vz) / len2));
      const dx = x - (a.x + vx * t);
      const dz = z - (a.z + vz * t);
      if (Math.hypot(dx, dz) <= chasm.width + margin) return true;
    }
  }
  return false;
}

/** Paints one road, building supports/bridges wherever there is no ground. */
export function paintRoad(world: World, path: RoadPath): void {
  const { top, edge } = roadSurface(path.style);
  const line = flattenPath(path);
  let lastLamp = 0;

  for (let i = 0; i < line.length; i++) {
    const { x, z } = line[i]!;
    // Roads never pave the void. Where a road meets a chasm or the western gulf
    // it simply stops; the crossings are real bridges (see buildRoadBridges)
    // and the glass bridges of the void-castle chain.
    if (!world.isLand(x, z)) continue;
    const overChasm = isNearChasm(x, z);
    const ground = world.surfaceAt(x, z);
    const deckY = overChasm ? ground + 3 : ground;
    const broken = path.style === "broken";

    for (let w = -path.width; w <= path.width; w++) {
      const px = x + (path.style === "main" ? w : w);
      const pz = z;
      // widen perpendicular to the direction of travel
      const prev = line[Math.max(0, i - 1)]!;
      const dirX = x - prev.x;
      const dirZ = z - prev.z;
      const perpendicular = Math.abs(dirX) >= Math.abs(dirZ);
      const tx = perpendicular ? px : x;
      const tz = perpendicular ? z : z + w;

      if (broken && ((tx * 7 + tz * 13) % 23 === 0)) continue; // missing paving
      world.set(tx, deckY, tz, Math.abs(w) === path.width ? edge : top);
      if (Math.abs(w) < path.width) world.set(tx, deckY + 1, tz, AIR);
      world.protect(tx, tz, 1);

      // Support the paving where the ground has dropped away under it.
      const surfaceUnder = world.surfaceAt(tx, tz);
      if (deckY > surfaceUnder + 1 && world.isLand(tx, tz)) {
        const bottom = Math.max(0, surfaceUnder);
        if (i % 4 === 0 && Math.abs(w) === path.width) {
          for (let y = bottom; y < deckY; y++) world.set(tx, y, tz, P.deepslateBricks);
        }
      }
    }

    // lamp posts along the road
    if (path.style === "main" && i - lastLamp > 14) {
      lastLamp = i;
      const prev = line[Math.max(0, i - 1)]!;
      const perpendicular = Math.abs(x - prev.x) >= Math.abs(z - prev.z);
      const lx = perpendicular ? x + path.width + 1 : x;
      const lz = perpendicular ? z : z + path.width + 1;
      if (world.isLand(lx, lz)) lampPost(world, lx, lz, Math.max(deckY, ground), P.soulLantern, 3);
    }
  }
}

/**
 * Automatically bridges every place a road crosses something that is not land
 * (the fractures and ravines). The western gulf is deliberately excluded: that
 * crossing belongs to the void-castle chain and its glass bridges.
 */
export function buildRoadBridges(world: World): void {
  const gulf = CONFIG.terrain.voidGulf;
  for (const road of ROADS) {
    const line = flattenPath(road);
    let runStart = -1;
    for (let i = 0; i <= line.length; i++) {
      const point = line[Math.min(i, line.length - 1)]!;
      const inGulf = point.x > gulf.minX - 8 && point.x < gulf.maxX + 8;
      const blocked = i < line.length && !world.isLand(point.x, point.z) && !inGulf;
      if (blocked) {
        if (runStart < 0) runStart = i;
        continue;
      }
      if (runStart >= 0) {
        const from = line[runStart]!;
        const to = line[Math.max(runStart, i - 1)]!;
        if (i - runStart >= 2) {
          const deck = Math.max(world.surfaceAt(from.x, from.z), world.surfaceAt(to.x, to.z)) + 3;
          bridge(world, from.x, from.z, to.x, to.z, deck, BLACKSTONE_STYLE, {
            broken: road.style === "broken",
            width: road.width,
          });
        }
        runStart = -1;
      }
    }
  }
}

export function buildRoadNetwork(world: World): void {
  for (const road of ROADS) paintRoad(world, road);
  buildRoadBridges(world);
}
