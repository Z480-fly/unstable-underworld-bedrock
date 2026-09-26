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

// ---------------------------------------------------------------------------
// Landmark paths
// ---------------------------------------------------------------------------

/**
 * The footpath is paved in glass, not stone.
 *
 * Canon is explicit that glazing is the Soul Keepers' material and the only
 * vibrant colour in the realm, and the references line their walks with
 * sea-lantern posts. So a path is a lit glass ribbon: a canon-green centre
 * line to walk down, a band of prism either side, and a polished-deepslate
 * kerb so the glazing has something to sit in rather than reading as paint.
 */
const PATH_CENTRE: BlockState = P.greenGlass;
const PATH_BANDS: BlockState[] = [P.cyanGlass, P.limeGlass, P.greenGlass, P.purpleGlass, P.magentaGlass, P.lightBlueGlass];
const PATH_KERB: BlockState = P.polishedDeepslate;

/** The glazing for one cell of the path, chosen by position so it is stable. */
function pathGlass(tx: number, tz: number, w: number): BlockState {
  if (w === 0) return PATH_CENTRE;
  return PATH_BANDS[Math.floor(hash2(tx, tz, CONFIG.seed + 640) * PATH_BANDS.length) % PATH_BANDS.length]!;
}

/**
 * The point on a landmark's footprint boundary closest to `to` - i.e. the gate
 * side. A path is built to the *edge* of a footprint, never to its centre:
 * paving into a centre would run the path straight through the building it is
 * meant to reach (the same trap the Glassworks road already documents).
 */
function gatePoint(landmark: Landmark, toX: number, toZ: number): { x: number; z: number } {
  const f = landmark.footprint;
  const candidates: Array<{ x: number; z: number; d: number }> = [];
  for (let x = f.x1; x <= f.x2; x += 2) {
    candidates.push({ x, z: f.z1, d: (x - toX) ** 2 + (f.z1 - toZ) ** 2 });
    candidates.push({ x, z: f.z2, d: (x - toX) ** 2 + (f.z2 - toZ) ** 2 });
  }
  for (let z = f.z1; z <= f.z2; z += 2) {
    candidates.push({ x: f.x1, z, d: (f.x1 - toX) ** 2 + (z - toZ) ** 2 });
    candidates.push({ x: f.x2, z, d: (f.x2 - toX) ** 2 + (z - toZ) ** 2 });
  }
  let best = candidates[0]!;
  for (const c of candidates) if (c.d < best.d) best = c;
  return { x: best.x, z: best.z };
}

/** The nearest point on any existing road, sampled along each flattened line. */
function nearestRoadPoint(world: World, x: number, z: number): { x: number; z: number; distance: number } | undefined {
  let best: { x: number; z: number; distance: number } | undefined;
  for (const road of ROADS) {
    for (const point of flattenPath(road)) {
      // A road column that never got paved (it crosses void) is not an anchor.
      if (!world.isLand(point.x, point.z)) continue;
      const distance = (point.x - x) ** 2 + (point.z - z) ** 2;
      if (!best || distance < best.distance) best = { ...point, distance };
    }
  }
  return best;
}

/**
 * How much of a straight line is walkable ground. A candidate path that would
 * spend most of its length over the void is not a path, it is a bridge
 * request - and the void-castle chain already owns the only real crossing in
 * the west, so those are left alone rather than spanned twice.
 */
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

/**
 * Paints one footpath: 5 wide, glazed, kerbed in polished deepslate and
 * lantern-lit every 12 blocks.
 *
 * Five rather than three because the path is now the glazing itself - at three
 * wide there is only ever one centre cell and one band, and the ribbon reads as
 * a plain green stripe instead of a mosaic. The kerb is painted as a separate
 * ring rather than as the outermost paving row so the glass has a dark frame
 * to sit inside, which is what makes it look glazed-in rather than laid-on.
 */
function paintPath(world: World, from: { x: number; z: number }, to: { x: number; z: number }): number {
  const half = 2;
  const steps = Math.max(2, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z)));
  let painted = 0;
  let lastLamp = -99;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const z = Math.round(from.z + (to.z - from.z) * t);
    if (!world.isLand(x, z)) continue;
    // Widen perpendicular to travel so corners do not pinch shut.
    const prev = { x: Math.round(from.x + (to.x - from.x) * Math.max(0, t - 1 / steps)), z: Math.round(from.z + (to.z - from.z) * Math.max(0, t - 1 / steps)) };
    const alongX = Math.abs(x - prev.x) >= Math.abs(z - prev.z);
    for (let w = -half; w <= half; w++) {
      const tx = alongX ? x : x + w;
      const tz = alongX ? z + w : z;
      if (!world.isLand(tx, tz)) continue;
      const deck = world.surfaceAt(tx, tz);
      // Follow the ground: step the paving up or down with the terrain so the
      // walk never floats and never buries itself.
      world.set(tx, deck + 1, tz, AIR);
      world.set(tx, deck, tz, pathGlass(tx, tz, w));
      world.setSurface(tx, tz, deck);
      world.protect(tx, tz, 1);
      painted++;
    }
    // The kerb, one row outside the glazing on both sides.
    for (const side of [-1, 1]) {
      const kx = alongX ? x : x + side * (half + 1);
      const kz = alongX ? z + side * (half + 1) : z;
      if (!world.isLand(kx, kz)) continue;
      const deck = world.surfaceAt(kx, kz);
      world.set(kx, deck, kz, PATH_KERB);
      world.set(kx, deck + 1, kz, AIR);
      world.setSurface(kx, kz, deck);
      world.protect(kx, kz);
    }
    if (s - lastLamp >= 12) {
      lastLamp = s;
      const lx = alongX ? x : x + (half + 2);
      const lz = alongX ? z + (half + 2) : z;
      if (world.isLand(lx, lz) && !world.isProtected(lx, lz)) {
        lampPost(world, lx, lz, world.surfaceAt(lx, lz), P.seaLantern, 4);
        world.protect(lx, lz);
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

/**
 * Walks a path from every landmark to the road network.
 *
 * The hand-authored `ROADS` reach the important places but leave the outer ring
 * reachable only by crossing open wasteland, which on a phone - in the dark,
 * on a 704-block plate - is the difference between a map and a maze. This pass
 * closes the gap: for each landmark it finds the nearest point already on a
 * road and lays a lit footpath there.
 *
 * Landmarks that are already on a road, and landmarks whose nearest road is
 * across the void gulf, are skipped rather than spanned.
 */
export function buildLandmarkPaths(world: World): PathReport[] {
  const reports: PathReport[] = [];
  const gulf = CONFIG.terrain.voidGulf;
  for (const landmark of Object.values(LANDMARKS)) {
    const { x, z } = landmark.center;
    const anchor = nearestRoadPoint(world, x, z);
    if (!anchor) continue;
    const distance = Math.sqrt(anchor.distance);
    // Already served: the road runs into the footprint already.
    if (distance <= 6) continue;
    const gate = gatePoint(landmark, anchor.x, anchor.z);
    const length = Math.round(Math.hypot(anchor.x - gate.x, anchor.z - gate.z));
    if (length < 8 || length > 150) continue;
    // Refuse to pave a path whose whole body is over the gulf.
    if (Math.min(gate.x, anchor.x) < gulf.maxX && Math.max(gate.x, anchor.x) > gulf.minX) continue;
    if (walkableFraction(world, gate, anchor) < 0.7) continue;
    const painted = paintPath(world, gate, { x: anchor.x, z: anchor.z });
    if (painted === 0) continue;
    reports.push({ id: landmark.id, from: gate, to: { x: anchor.x, z: anchor.z }, length, painted });
  }
  return reports;
}
