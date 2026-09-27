/**
 * The scene: the exact order the realm is generated in.
 *
 * This lives in one place so that the builder (`src/build.ts`), the ASCII map,
 * the landmark audit and the inspector all produce - and therefore verify -
 * byte-for-byte the same world. The inspector in particular regenerates the
 * scene to prove that what came back out of the written LevelDB is what the
 * generator intended, which is the check that catches an axis/index ordering
 * mistake in the subchunk serializer.
 */

import { buildAllAreas } from "./areas.ts";
import { decorate } from "./decorate.ts";
import { buildPurgatoryApproach } from "./purgatory_approach.ts";
import { buildLandmarkPaths, buildPurgatoryAvenue, buildRoadNetwork } from "./roads.ts";
import { carveChasmWalls, generateTerrain, type TerrainStats } from "./terrain.ts";
import { World } from "./world.ts";

export interface Scene {
  world: World;
  terrain: TerrainStats;
}

/**
 * Generates the whole realm in memory.
 *
 * Order matters: the terrain heightfield comes first, the chasm walls are
 * carved into it, the fourteen landmarks are placed on top of that, the road
 * network is painted between them, and decoration only ever fills air.
 */
export function buildSceneWorld(log: (message: string) => void = () => {}): Scene {
  const world = new World();
  log("generating terrain...");
  const terrain = generateTerrain(world);
  log(
    `terrain done: ${terrain.landColumns} land columns, ${terrain.voidColumns} void columns, ` +
      `surface y ${terrain.minY}..${terrain.maxY}`,
  );
  carveChasmWalls(world);
  log("building landmarks...");
  buildAllAreas(world);
  const approach = buildPurgatoryApproach(world);
  log(`bridging to purgatory: ${approach.columns} columns (x ${approach.minX}..${approach.maxX})`);
  log("painting roads...");
  buildRoadNetwork(world);
  log("scattering detail...");
  decorate(world);
  // The paths are laid *after* the detail pass on purpose. Detail scatters
  // masonry and terrain debris on unprotected columns, and it was dropping
  // blocks back onto the Purgatory avenue in two places, punching holes in a
  // route that is meant to be walkable end to end. Paths are infrastructure:
  // nothing should be able to break them after the fact.
  const paths = buildLandmarkPaths(world);
  const pathColumns = paths.reduce((sum, p) => sum + p.painted, 0);
  log(
    `landmark paths: ${paths.length} footpaths, ${pathColumns} paved columns ` +
      `(${paths.map((p) => p.id).join(", ") || "none"})`,
  );
  const avenue = buildPurgatoryAvenue(world);
  log(
    avenue
      ? `purgatory avenue: ${avenue.painted} lit glass columns, x ${avenue.from.x}..${avenue.to.x} at z ${avenue.from.z}`
      : "purgatory avenue: NOT BUILT",
  );
  return { world, terrain };
}
