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
import { hash2 } from "./noise.ts";
import { CHASMS } from "./terrain.ts";
import { LANDMARKS, ROADS, type Landmark, type RoadPath } from "./layout.ts";
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
    if (!world.isLand(x, z)) continue;
    const overChasm = isNearChasm(x, z);
    const ground = world.surfaceAt(x, z);
    const deckY = overChasm ? ground + 3 : ground;
    const broken = path.style === "broken";

    for (let w = -path.width; w <= path.width; w++) {
      const px = x + (path.style === "main" ? w : w);
      const prev = line[Math.max(0, i - 1)]!;
      const dirX = x - prev.x;
      const dirZ = z - prev.z;
      const perpendicular = Math.abs(dirX) >= Math.abs(dirZ);
      const tx = perpendicular ? px : x;
      const tz = perpendicular ? z : z + w;

      if (broken && ((tx * 7 + tz * 13) % 23 === 0)) continue;
      world.set(tx, deckY, tz, Math.abs(w) === path.width ? edge : top);
      if (Math.abs(w) < path.width) {
        world.set(tx, deckY + 1, tz, AIR);
        world.set(tx, deckY + 2, tz, AIR);
      }
      world.protect(tx, tz, 2);

      const surfaceUnder = world.surfaceAt(tx, tz);
      if (deckY > surfaceUnder + 1 && world.isLand(tx, tz)) {
        const bottom = Math.max(0, surfaceUnder);
        if (i % 4 === 0 && Math.abs(w) === path.width) {
          for (let y = bottom; y < deckY; y++) world.set(tx, y, tz, P.deepslateBricks);
        }
      }
    }

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

const PATH_CENTRE: BlockState = P.greenGlass;
const PATH_BANDS: BlockState[] = [P.greenGlass, P.limeGlass, P.cyanGlass, P.greenGlass, P.limeGlass];
const PATH_KERB: BlockState = P.polishedDeepslate;

function pathGlass(tx: number, tz: number, w: number): BlockState {
  if (w === 0) return PATH_CENTRE;
  return PATH_BANDS[Math.floor(hash2(tx, tz, CONFIG.seed + 640) * PATH_BANDS.length) % PATH_BANDS.length]!;
}

function gatePoint(world: World, landmark: Landmark, toX: number, toZ: number): { x: number; z: number } {
  const f = landmark.footprint;
  const candidates: Array<{ x: number; z: number; d: number; land: boolean }> = [];
  for (let x = f.x1; x <= f.x2; x += 2) {
    candidates.push({ x, z: f.z1, d: (x - toX) ** 2 + (f.z1 - toZ) ** 2, land: world.isLand(x, f.z1) });
    candidates.push({ x, z: f.z2, d: (x - toX) ** 2 + (f.z2 - toZ) ** 2, land: world.isLand(x, f.z2) });
  }
  for (let z = f.z1; z <= f.z2; z += 2) {
    candidates.push({ x: f.x1, z, d: (f.x1 - toX) ** 2 + (z - toZ) ** 2, land: world.isLand(f.x1, z) });
    candidates.push({ x: f.x2, z, d: (f.x2 - toX) ** 2 + (z - toZ) ** 2, land: world.isLand(f.x2, z) });
  }
  let best = candidates[0]!;
  let bestLand = candidates.find((c) => c.land);
  for (const c of candidates) {
    if (!best.land && c.land) best = c;
    if (c.land) {
      if (!bestLand || c.d < bestLand.d) bestLand = c;
    }
  }
  return bestLand ? { x: bestLand.x, z: bestLand.z } : { x: best.x, z: best.z };
}

function nearestRoadPoint(world: World, x: number, z: number): { x: number; z: number; distance: number } | undefined {
  let best: { x: number; z: number; distance: number } | undefined;
  for (const road of ROADS) {
    for (const point of flattenPath(road)) {
      if (!world.isLand(point.x, point.z)) continue;
      const distance = (point.x - x) ** 2 + (point.z - z) ** 2;
      if (!best || distance < best.distance) best = { ...point, distance };
    }
  }
  return best;
}

function walkableFraction(world: World, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
  let land = 0;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const z = Math.round(a.z + (b.z - a.z) * t);
    if (world.isLand(x, z)) land++;
  }
  return land / (steps + 1);
}

function paintPath(
  world: World,
  from: { x: number; z: number },
  to: { x: number; z: number },
  opts: { width?: number; pylon?: boolean; causeway?: boolean } = {},
): number {
  const half = opts.width ?? 2;
  const steps = Math.max(2, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z)));
  let painted = 0;
  let lastLamp = -99;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const z = Math.round(from.z + (to.z - from.z) * t);
    if (!world.isLand(x, z) && !opts.causeway) continue;
    const prev = { x: Math.round(from.x + (to.x - from.x) * Math.max(0, t - 1 / steps)), z: Math.round(from.z + (to.z - from.z) * Math.max(0, t - 1 / steps)) };
    const alongX = Math.abs(x - prev.x) >= Math.abs(z - prev.z);
    for (let w = -half; w <= half; w++) {
      const tx = alongX ? x : x + w;
      const tz = alongX ? z + w : z;
      if (!world.isLand(tx, tz)) {
        if (!opts.causeway) continue;
        const surface = surfaceNear(world, tx, tz);
        for (let y = surface - 6; y < surface; y++) world.set(tx, y, tz, P.deepslate);
        world.set(tx, surface - 1, tz, P.glowstone);
        world.set(tx, surface, tz, pathGlass(tx, tz, w));
        world.set(tx, surface + 1, tz, AIR);
        world.set(tx, surface + 2, tz, AIR);
        world.setSurface(tx, tz, surface);
        world.setLand(tx, tz, true);
        world.protect(tx, tz, 2);
        painted++;
        continue;
      }
      const deck = world.surfaceAt(tx, tz);
      world.set(tx, deck + 1, tz, AIR);
      world.set(tx, deck + 2, tz, AIR);
      world.set(tx, deck - 1, tz, P.glowstone);
      world.set(tx, deck, tz, pathGlass(tx, tz, w));
      world.setSurface(tx, tz, deck);
      world.protect(tx, tz, 2);
      painted++;
    }
    for (const side of [-1, 1]) {
      const kx = alongX ? x : x + side * (half + 1);
      const kz = alongX ? z + side * (half + 1) : z;
      if (!world.isLand(kx, kz)) continue;
      const deck = world.surfaceAt(kx, kz);
      world.set(kx, deck, kz, PATH_KERB);
      world.set(kx, deck + 1, kz, AIR);
      if (s % (opts.pylon ? 2 : 3) === 0) {
        world.set(kx, deck + 1, kz, P.seaLantern);
        world.set(kx, deck + 2, kz, P.glowstone);
      }
      world.setSurface(kx, kz, deck);
      world.protect(kx, kz, 2);
    }
    if (s - lastLamp >= 8) {
      lastLamp = s;
      const lx = alongX ? x : x + (half + 2);
      const lz = alongX ? z + (half + 2) : z;
      if (world.isLand(lx, lz) && !world.isProtected(lx, lz)) {
        lampPost(world, lx, lz, world.surfaceAt(lx, lz), P.seaLantern, 4);
        world.protect(lx, lz, 2);
      }
    }
  }
  return painted;
}

export interface PathReport {
  id: string;
  from: { x: number; z: number };
  to: { x: number; z: number };
  length: number;
  painted: number;
}

function paintThreshold(world: World, gate: { x: number; z: number }): number {
  let laid = 0;
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = gate.x + dx;
      const z = gate.z + dz;
      if (!world.inRealm(x, z) || !world.isLand(x, z)) continue;
      if (Math.max(Math.abs(dx), Math.abs(dz)) === 3) continue;
      const deck = world.surfaceAt(x, z);
      world.set(x, deck - 1, z, P.glowstone);
      world.set(x, deck, z, dx === 0 && dz === 0 ? P.limeGlass : P.greenGlass);
      world.set(x, deck + 1, z, AIR);
      world.set(x, deck + 2, z, AIR);
      world.setSurface(x, z, deck);
      world.protect(x, z, 2);
      laid++;
    }
  }
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) {
    const x = gate.x + dx;
    const z = gate.z + dz;
    if (!world.inRealm(x, z) || !world.isLand(x, z)) continue;
    const deck = world.surfaceAt(x, z);
    world.set(x, deck, z, P.polishedDeepslate);
    world.set(x, deck + 1, z, P.seaLantern);
    world.protect(x, z, 2);
  }
  return laid;
}

function surfaceNear(world: World, x: number, z: number): number {
  for (let r = 1; r <= 40; r++) {
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (world.inRealm(nx, nz) && world.isLand(nx, nz)) return world.surfaceAt(nx, nz);
    }
  }
  return 46;
}

function crossesVoidGulf(
  world: World,
  a: { x: number; z: number },
  b: { x: number; z: number },
): boolean {
  const gulf = CONFIG.terrain.voidGulf;
  const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const z = Math.round(a.z + (b.z - a.z) * t);
    if (x <= gulf.minX || x >= gulf.maxX) continue;
    if (z < -192 || z > 191) continue;
    if (!world.isLand(x, z)) return true;
  }
  return false;
}

export function buildLandmarkPaths(world: World): PathReport[] {
  const reports: PathReport[] = [];
  for (const landmark of Object.values(LANDMARKS)) {
    const { x, z } = landmark.center;
    const anchor = nearestRoadPoint(world, x, z);
    if (!anchor) continue;
    const gate = gatePoint(world, landmark, anchor.x, anchor.z);
    const length = Math.round(Math.hypot(anchor.x - gate.x, anchor.z - gate.z));
    if (crossesVoidGulf(world, gate, { x: anchor.x, z: anchor.z })) {
      if (paintThreshold(world, gate)) reports.push({ id: landmark.id, from: gate, to: gate, length, painted: 1 });
      continue;
    }
    if (walkableFraction(world, gate, anchor) < 0.7) {
      if (paintThreshold(world, gate)) reports.push({ id: landmark.id, from: gate, to: gate, length, painted: 1 });
      continue;
    }
    const painted = paintPath(world, gate, { x: anchor.x, z: anchor.z });
    if (painted > 0) reports.push({ id: landmark.id, from: gate, to: { x: anchor.x, z: anchor.z }, length, painted });
  }
  return reports;
}

/** The Purgatory avenue — lit green glass path west to the office. */
const PURGATORY_DOOR_X = -360;

export function buildPurgatoryAvenue(world: World): PathReport | null {
  // Start from the west rim of the Underworld plate and run to the Purgatory door.
  const startX = -340;
  const centreZ = 40;
  const painted = paintPath(
    world,
    { x: startX, z: centreZ },
    { x: PURGATORY_DOOR_X, z: centreZ },
    { width: 2, pylon: true, causeway: true },
  );
  if (painted <= 0) return null;
  return { id: "purgatoryAvenue", from: { x: startX, z: centreZ }, to: { x: PURGATORY_DOOR_X, z: centreZ }, length: PURGATORY_DOOR_X - startX, painted };
}
