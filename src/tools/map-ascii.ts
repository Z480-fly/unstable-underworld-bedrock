/**
 * ASCII map dump: renders the generated realm as text so the layout can be
 * checked without opening the game (north is up, -X is west/left).
 *
 *   bun run src/tools/map-ascii.ts [columns]
 */

import { CONFIG, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z } from "../world/config.ts";
import { LANDMARKS } from "../world/layout.ts";
import { buildSceneWorld } from "../world/scene.ts";
import type { World } from "../world/world.ts";

const GLYPHS: Record<string, string> = {
  "minecraft:deepslate": "#",
  "minecraft:cobbled_deepslate": "#",
  "minecraft:polished_deepslate": "#",
  "minecraft:tuff": "t",
  "minecraft:green_stained_glass": ",",
  "minecraft:stone_bricks": "C",
  "minecraft:dark_oak_planks": "h",
  "minecraft:spruce_planks": "h",
  "minecraft:lantern": "i",
  "minecraft:soul_lantern": "i",
  "minecraft:lava": "~",
  "minecraft:magma": "~",
  "minecraft:snow_layer": "*",
  "minecraft:snow": "*",
  "minecraft:powder_snow": "*",
  "minecraft:ice": "*",
  "minecraft:packed_ice": "*",
  "minecraft:blue_ice": "*",
  "minecraft:wheat": "%",
  "minecraft:farmland": "%",
  "minecraft:hay_block": "%",
  "minecraft:gold_block": "G",
  "minecraft:glass": "|",
  "minecraft:gray_stained_glass": "|",
  "minecraft:deepslate_tiles": "=",
  "minecraft:bookshelf": "L",
  "minecraft:sculk": "s",
  "minecraft:obsidian": "o",
  "minecraft:crying_obsidian": "o",
  "minecraft:soul_sand": ".",
  "minecraft:soul_soil": ".",
  "minecraft:blackstone": "B",
  "minecraft:polished_blackstone": "B",
  "minecraft:polished_blackstone_bricks": "C",
  "minecraft:deepslate_bricks": "C",
  "minecraft:black_concrete": "X",
  "minecraft:iron_bars": "H",
  "minecraft:netherrack": "n",
  "minecraft:basalt": "b",
  "minecraft:smooth_basalt": "b",
};

export function buildWorld(): World {
  return buildSceneWorld().world;
}

function glyphFor(world: World, x: number, z: number): string {
  if (!world.isLand(x, z)) {
    // Look for lava/structures hanging over the void (void castles, bridges).
    for (let y = CONFIG.maxY; y >= 0; y--) {
      const block = world.get(x, y, z);
      if (block && block.name !== "minecraft:air") return glyphForName(block.name, "?");
    }
    return " ";
  }
  const surface = world.surfaceAt(x, z);
  for (let y = Math.min(CONFIG.maxY, surface + 45); y >= 0; y--) {
    const block = world.get(x, y, z);
    if (block && block.name !== "minecraft:air") return glyphForName(block.name, "#");
  }
  return " ";
}

function glyphForName(name: string, fallback: string): string {
  return GLYPHS[name] ?? fallback;
}

function main(): void {
  const cols = Number(process.argv[2] ?? 128);
  const world = buildWorld();
  const spanX = WORLD_MAX_X - WORLD_MIN_X;
  const spanZ = WORLD_MAX_Z - WORLD_MIN_Z;
  const colStep = spanX / cols;
  const rows = Math.round(spanZ / (colStep * 2.1));

  const grid: string[][] = [];
  for (let row = 0; row < rows; row++) {
    const line: string[] = [];
    for (let col = 0; col < cols; col++) {
      const x = Math.round(WORLD_MIN_X + col * colStep);
      const z = Math.round(WORLD_MIN_Z + row * (spanZ / rows));
      line.push(glyphFor(world, x, z));
    }
    grid.push(line);
  }

  // Landmark markers (drawn over the terrain glyph).
  for (const landmark of Object.values(LANDMARKS)) {
    const col = Math.round(((landmark.center.x - WORLD_MIN_X) / spanX) * (cols - 1));
    const row = Math.round(((landmark.center.z - WORLD_MIN_Z) / spanZ) * (rows - 1));
    if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
    grid[row]![col] = "O";
  }

  const header = `Underworld realm ${spanX + 1}x${spanZ + 1} blocks, 1 char = ${colStep.toFixed(1)} blocks`;
  console.log(header);
  console.log(`+${"-".repeat(cols)}+`);
  for (const line of grid) console.log(`|${line.join("")}|`);
  console.log(`+${"-".repeat(cols)}+`);
  console.log("north = up (-Z) | west = left (-X) | O = landmark centre");
  console.log(
    "legend: ' 'void  #stone  , green stained glass (ground)  B blackstone  C castle brick  = road  " +
      "| glass  G gold  ~ lava  * snow  % fields  L books  s sculk  o obsidian  H iron  X black concrete",
  );
  console.log("\nlandmarks:");
  for (const landmark of Object.values(LANDMARKS)) {
    console.log(`  ${landmark.name.padEnd(52)} (${landmark.center.x}, ${landmark.center.z})`);
  }
}

if (import.meta.main) main();
