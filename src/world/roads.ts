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
 * Every path in the realm is green stained glass.
 *
 * The references are consistent about this: glazing is the Soul Keepers'
 * material, green is the one colour they put on whole structures, and their
 * walks are lit so a player can actually follow one. So a path is a ribbon of
 * green glass with a deepslate kerb, lit from underneath by glowstone and from
 * the side by sea-lantern posts - the glass is the surface *and* the light
 * source, so it reads as a glowing line across a black plain from a long way
 * off.
 */
const PATH_CENTRE: BlockState = P.greenGlass;
const PATH_BANDS: BlockState[] = [P.greenGlass, P.limeGlass, P.cyanGlass, P.greenGlass, P.limeGlass];
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
  // Prefer a boundary point that is actually on solid ground. The closest point
  // on the rectangle can be a hole in the plate - the Cathedral's east edge at
  // (-76, -180) is void - and a path that starts over the void paints nothing
  // at all and is then silently dropped from the report.
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
    // Widen perpendicular to travel so corners do not pinch shut.
    const prev = { x: Math.round(from.x + (to.x - from.x) * Math.max(0, t - 1 / steps)), z: Math.round(from.z + (to.z - from.z) * Math.max(0, t - 1 / steps)) };
    const alongX = Math.abs(x - prev.x) >= Math.abs(z - prev.z);
    for (let w = -half; w <= half; w++) {
      const tx = alongX ? x : x + w;
      const tz = alongX ? z + w : z;
      if (!world.isLand(tx, tz)) {
        if (!opts.causeway) continue;
        // A route to Purgatory has to be a *route*. The Underworld's own west
        // reach has a void gap in it, and a path that quietly stops at a hole
        // is not a path to anywhere - so the avenue builds its own floor across
        // the gap rather than pretending the gap is not there.
        const surface = surfaceNear(world, tx, tz);
        for (let y = surface - 6; y < surface; y++) world.set(tx, y, tz, P.deepslate);
        world.set(tx, surface - 1, tz, P.glowstone);
        world.set(tx, surface, tz, pathGlass(tx, tz, w));
        world.set(tx, surface + 1, tz, AIR);
        world.setSurface(tx, tz, surface);
        world.setLand(tx, tz, true);
        world.protect(tx, tz, 1);
        painted++;
        continue;
      }
      const deck = world.surfaceAt(tx, tz);
      // Follow the ground: step the paving up or down with the terrain so the
      // walk never floats and never buries itself.
      world.set(tx, deck + 1, tz, AIR);
      // Stained glass does not emit light, so the path carries its own: a
      // glowstone course one block *under* the glazing throws light up through
      // it and onto the walker's feet, which is what makes the line readable
      // at night instead of just being a green stripe in the dark.
      world.set(tx, deck - 1, tz, P.glowstone);
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
      // A sea lantern on top of every third kerb stone: the path lights itself
      // from its own edge, so it is findable without following it blind.
      if (s % (opts.pylon ? 2 : 3) === 0) {
        world.set(kx, deck + 1, kz, P.seaLantern);
        world.set(kx, deck + 2, kz, P.glowstone);
      }
      world.setSurface(kx, kz, deck);
      world.protect(kx, kz);
    }
    if (s - lastLamp >= 8) {
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
/**
 * A lit green-glass threshold laid directly at a landmark's gate.
 *
 * Used where there is no room for a real path - the road already stops at the
 * wall, or the only route crosses the void gulf that the glass bridges own.
 * Without it those landmarks are the ones with no green glass anywhere near
 * them, which is exactly the gap this was asked to close.
 */
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
      world.setSurface(x, z, deck);
      world.protect(x, z);
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
    world.protect(x, z);
  }
  return laid;
}

/**
 * A sensible deck height for a column that is currently void, taken from the
 * nearest land around it. Used only by the causeway option, where the path has
 * to build its own floor.
 */
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

/**
 * True when the straight line genuinely crosses the void gulf.
 *
 * The first version of this was a bounding-box test on X alone, which skipped
 * the Cathedral's path: the line merely *spanned* the gulf's x-range at a
 * latitude where the ground is solid, so it was refused for crossing something
 * it never touched. The real question is whether a point on the line is
 * actually over the void, so the line is sampled and only genuine void counts.
 */
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
    // Only void counts. Where the gulf row is solid ground the path is fine,
    // and where it is not, the glass-bridge chain already owns the crossing.
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
    // Refuse to pave a path that genuinely crosses the void gulf.
    if (crossesVoidGulf(world, gate, { x: anchor.x, z: anchor.z })) {
      // The Citadel chain is reached over the glass bridges, not over a paved
      // causeway, so it gets a threshold pad instead - see paintThreshold.
      if (paintThreshold(world, gate)) reports.push({ id: landmark.id, from: gate, to: gate, length, painted: 1 });
      continue;
    }
    if (walkableFraction(world, gate, anchor) < 0.7) {
      if (paintThreshold(world, gate)) reports.push({ id: landmark.id, from: gate, to: gate, length, painted: 1 });
      continue;
    }
    // Every landmark gets a path, whether or not a road already reaches it.
    // A road that stops a couple of blocks short of the wall is not a path
    // *to* the building, and when the link is too short to be worth paving we
    // lay a lit threshold at the gate so nothing is left without one.
    const painted = length < 8 ? paintThreshold(world, gate) : paintPath(world, gate, { x: anchor.x, z: anchor.z });
    if (painted === 0) continue;
    reports.push({ id: landmark.id, from: gate, to: { x: anchor.x, z: anchor.z }, length, painted });
  }
  return reports;
}

/**
 * The avenue west into Purgatory.
 *
 * Purgatory is transplanted from x = -896 to x = -353, immediately west of the
 * realm edge at x = -352, and `buildPurgatoryApproach` fills the void between
 * the island's coast and that edge. So the route is: the long walk west along
 * z = 40, out to the coast, then straight west across the causeway to the
 * Purgatory threshold. Green glass, lit, the whole way.
 */
export function buildPurgatoryAvenue(world: World): PathReport | undefined {
  const EDGE_X = -352;
  const PURGATORY_DOOR_X = -350;
  const centreZ = 40;
  // The avenue picks up where the long walk west already ends (x -128, which
  // is *west* of the void gulf, so continuing west never re-crosses the
  // glass-bridge chain) and runs to the Purgatory threshold. The causeway
  // option carries it across the hole the west reach has at x ~ -260.
  const startX = -128;
  const painted = paintPath(
    world,
    { x: startX, z: centreZ },
    { x: PURGATORY_DOOR_X, z: centreZ },
    { width: 3, pylon: true, causeway: true },
  );
  if (painted === 0) return undefined;
  // A gate at the threshold so Purgatory reads as a destination, not a cliff.
  for (let dz = -5; dz <= 5; dz++) {
    world.column(PURGATORY_DOOR_X + 1, centreZ + dz, 0, 0, P.obsidian);
  }
  for (const dz of [-5, 5]) {
    const base = world.surfaceAt(PURGATORY_DOOR_X + 1, centreZ + dz);
    for (let y = base + 1; y <= base + 9; y++) world.set(PURGATORY_DOOR_X + 1, y, centreZ + dz, P.obsidian);
    world.set(PURGATORY_DOOR_X + 1, base + 10, centreZ + dz, P.glowstone);
  }
  // The lintel: a green-glass band over the door with the deepslate to carry it.
  const lintelY = world.surfaceAt(PURGATORY_DOOR_X + 1, centreZ) + 9;
  for (let dz = -5; dz <= 5; dz++) {
    world.set(PURGATORY_DOOR_X + 1, lintelY, centreZ + dz, dz % 2 === 0 ? P.greenGlass : P.obsidian);
  }
  return { id: "purgatoryAvenue", from: { x: startX, z: centreZ }, to: { x: PURGATORY_DOOR_X, z: centreZ }, length: PURGATORY_DOOR_X - startX, painted };
}
