/**
 * Landmark audit: proves that every landmark in `layout.ts` actually produced
 * geometry in the finished world.
 *
 *   bun run src/tools/landmark-audit.ts
 *
 * A landmark that "builds" but leaves nothing standing (because a later pass
 * overwrote it, because it was drawn outside the plate, or because a guard
 * returned early) is invisible in an ASCII top-down map and only shows up in
 * game. This walks the finished world and counts, inside each landmark's
 * footprint:
 *
 *   raised  - blocks sitting above the column's own surface (walls, towers,
 *             statue rows, planted crops, ...)
 *   tall    - the tallest such block above the surface
 *   distinct- how many different block names were stacked up there
 *   sig     - occurrences of the landmark's signature material anywhere in the
 *             footprint, at any depth (the tomb and the crypt rooms are *below*
 *             the ground, the pads are flush with it, so a footprint-wide scan
 *             is the only honest fingerprint)
 *
 * A landmark that reports `raised 0` and `sig 0` did not generate.
 */

import { LANDMARKS, type Landmark } from "../world/layout.ts";
import { CONFIG, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z } from "../world/config.ts";
import { buildSceneWorld } from "../world/scene.ts";
import type { World } from "../world/world.ts";

/** A block that only that landmark places, used as a fingerprint. */
const SIGNATURES: Record<string, string> = {
  breach: "minecraft:obsidian",
  ruinedCastle: "minecraft:stone_pressure_plate",
  fields: "minecraft:wheat",
  ashenReaches: "minecraft:lava",
  center: "minecraft:gold_block",
  graveyard: "minecraft:polished_blackstone_brick_slab",
  ruins: "minecraft:chiseled_deepslate",
  mazeValley: "minecraft:deepslate_bricks",
  village: "minecraft:coarse_dirt",
  frostPocket: "minecraft:blue_ice",
  tomb: "minecraft:sculk_shrieker",
  dungeonChain: "minecraft:black_concrete",
  citadel: "minecraft:bookshelf",
  portalLobby: "minecraft:portal",
  glassworks: "minecraft:green_stained_glass",
  portalField: "minecraft:crying_obsidian",
  endRuin: "minecraft:end_portal",
};

interface Row {
  landmark: Landmark;
  raised: number;
  tall: number;
  columns: number;
  distinct: number;
  signature: string;
  signatureCount: number;
}

function audit(world: World): Row[] {
  const rows: Row[] = [];
  for (const landmark of Object.values(LANDMARKS)) {
    const signature = SIGNATURES[landmark.id] ?? "";
    const row: Row = {
      landmark,
      raised: 0,
      tall: 0,
      columns: 0,
      distinct: 0,
      signature,
      signatureCount: 0,
    };
    const names = new Set<string>();
    const f = landmark.footprint;
    for (let z = f.z1; z <= f.z2; z++) {
      for (let x = f.x1; x <= f.x2; x++) {
        if (!world.inRealm(x, z)) continue;
        const surface = world.surfaceAt(x, z);
        let columnRaised = 0;
        for (let y = 0; y < CONFIG.maxY; y++) {
          const block = world.get(x, y, z);
          if (!block) break;
          if (block.name === signature) row.signatureCount++;
          if (y <= surface) continue;
          if (block.name === "minecraft:air") continue;
          columnRaised++;
          names.add(block.name);
        }
        if (columnRaised > 0) row.columns++;
        row.raised += columnRaised;
        if (columnRaised > row.tall) row.tall = columnRaised;
      }
    }
    row.distinct = names.size;
    rows.push(row);
  }
  return rows;
}

/**
 * How much detail the plain itself carries. The references describe the
 * wilderness as "an endless plain of broken structures", so this measures the
 * thing that actually makes it read that way: blocks standing above the ground
 * on columns that belong to no landmark and are not part of a pad or a road.
 *
 * The scan spans the whole realm, not a comfortable inner square: an earlier
 * version stopped 30 blocks short of the plate on every side, which hid the
 * fact that a third of the plain was carrying no detail at all.
 */
function wildernessDetail(world: World): { blocks: number; columns: number; columnsTouched: number } {
  let blocks = 0;
  let columns = 0;
  let columnsTouched = 0;
  for (let z = WORLD_MIN_Z; z <= WORLD_MAX_Z; z++) {
    for (let x = WORLD_MIN_X; x <= WORLD_MAX_X; x++) {
      if (!world.inRealm(x, z) || !world.isLand(x, z)) continue;
      columns++;
      let raised = 0;
      let insideLandmark = false;
      for (const landmark of Object.values(LANDMARKS)) {
        if (inside(landmark, x, z)) {
          insideLandmark = true;
          break;
        }
      }
      if (insideLandmark) continue;
      const surface = world.surfaceAt(x, z);
      for (let y = surface + 1; y < CONFIG.maxY; y++) {
        const block = world.get(x, y, z);
        if (!block) break;
        if (block.name !== "minecraft:air") raised++;
      }
      if (raised > 0) columnsTouched++;
      blocks += raised;
    }
  }
  return { blocks, columns, columnsTouched };
}

function inside(landmark: Landmark, x: number, z: number): boolean {
  const f = landmark.footprint;
  return x >= f.x1 && x <= f.x2 && z >= f.z1 && z <= f.z2;
}

function main(): void {
  const { world } = buildSceneWorld();
  const rows = audit(world);
  const pad = (value: string, width: number): string => value.padEnd(width);

  console.log(`landmark audit - ${rows.length} landmarks, realm ${CONFIG.realm.minChunkX}..${CONFIG.realm.maxChunkX} chunks`);
  console.log(
    `${pad("landmark", 42)} ${pad("center", 12)} ${pad("raised", 8)} ${pad("tall", 5)} ${pad("cols", 6)} ${pad(
      "names",
      6,
    )} signature`,
  );
  let empty = 0;
  for (const row of rows) {
    const center = `${row.landmark.center.x},${row.landmark.center.z}`;
    const problems = row.raised === 0 || row.signatureCount === 0;
    if (problems) empty++;
    console.log(
      `${problems ? "!!" : "  "} ${pad(row.landmark.name, 40)} ${pad(center, 12)} ${pad(String(row.raised), 8)} ` +
        `${pad(String(row.tall), 5)} ${pad(String(row.columns), 6)} ${pad(String(row.distinct), 6)} ` +
        `${row.signature.replace("minecraft:", "")}: ${row.signatureCount}`,
    );
  }
  const detail = wildernessDetail(world);
  const percent = ((detail.columnsTouched / detail.columns) * 100).toFixed(1);
  console.log(
    `\nwilderness detail: ${detail.blocks} blocks standing above the ground on ${detail.columnsTouched} of ` +
      `${detail.columns} non-landmark columns (${percent}% of the plain carries something)`, 
  );

  if (empty) {
    console.log(`\n${empty} landmark(s) have no detectable geometry - see the !! rows.`);
    process.exitCode = 1;
  } else {
    console.log("\nall landmarks produced geometry.");
  }
}

main();
