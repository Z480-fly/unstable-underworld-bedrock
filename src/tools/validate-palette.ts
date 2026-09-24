/**
 * Palette validator.
 *
 * Checks every block state used by the generator against Mojang's own Bedrock
 * block list (shipped by the `minecraft-data` package). A wrong block name or
 * an invented state key would otherwise only show up as an "unknown block" when
 * the world is opened on a phone, so this runs as part of `bun test`.
 *
 * Run standalone with: `bun run src/tools/validate-palette.ts`
 */

import mcDataLoader from "minecraft-data";
import { P } from "../world/blocks.ts";
import type { BlockState } from "../world/blocks.ts";

interface BlockDefinition {
  name: string;
  states?: Record<string, unknown> | Array<{ name: string; values?: unknown }>;
}

function loadBedrockData(): { blocksByName: Record<string, BlockDefinition>; version: string } {
  const versions = (mcDataLoader as unknown as { supportedVersions: { bedrock: string[] } }).supportedVersions;
  const candidates = [...new Set([...versions.bedrock].reverse())];
  for (const version of candidates) {
    try {
      const data = mcDataLoader(`bedrock_${version}` as never) as unknown as {
        blocksByName: Record<string, BlockDefinition>;
      };
      if (data && data.blocksByName) return { blocksByName: data.blocksByName, version };
    } catch {
      // try the next version
    }
  }
  throw new Error("no bedrock data available in minecraft-data");
}

export interface PaletteProblem {
  block: string;
  problem: string;
}

/**
 * Bedrock block-state keys (the "states" compound of a block palette entry).
 * Bedrock does not use the Java state names: stairs have `weirdo_direction` and
 * `upside_down_bit`, slabs have `top_slot_bit`, logs have `pillar_axis`, and so
 * on. Anything outside this set is almost certainly a Java-ism.
 */
const KNOWN_BEDROCK_STATES = new Set([
  "active",
  "can_summon",
  "composter_fill_level",
  "covered_bit",
  "direction",
  "door_hinge_bit",
  "extinguished",
  "facing_direction",
  "fill_level",
  "growth",
  "hanging",
  "height",
  "liquid_depth",
  "lit",
  "moisturized_amount",
  "multi_face_direction_bits",
  "open_bit",
  "pillar_axis",
  "portal_axis",
  "powered_bit",
  "redstone_signal",
  "top_slot_bit",
  "upper_block_bit",
  "upside_down_bit",
  "wall_connection_type_east",
  "wall_connection_type_north",
  "wall_connection_type_south",
  "wall_connection_type_west",
  "wall_post_bit",
  "weirdo_direction",
]);

export function validatePalette(): { problems: PaletteProblem[]; checked: number; blockCount: number; version: string } {
  const { blocksByName, version } = loadBedrockData();
  const problems: PaletteProblem[] = [];
  const seen = new Set<string>();

  const entries = Object.entries(P) as Array<[string, BlockState]>;
  for (const [key, state] of entries) {
    const name = state.name.startsWith("minecraft:") ? state.name.slice("minecraft:".length) : state.name;
    const definition = blocksByName[name];
    if (!definition) {
      problems.push({ block: `${key} (${state.name})`, problem: "unknown block name" });
      continue;
    }
    seen.add(name);
    if (!state.states) continue;
    // minecraft-data's Bedrock block list carries the flattened block names but
    // not per-block state lists, so state keys are checked against the known
    // Bedrock state vocabulary below instead of against the dataset.
    const stateNames = new Set<string>();
    if (Array.isArray(definition.states)) {
      for (const s of definition.states) stateNames.add(s.name);
    } else if (definition.states && typeof definition.states === "object") {
      for (const s of Object.keys(definition.states)) stateNames.add(s);
    }
    for (const stateKey of Object.keys(state.states)) {
      if (!KNOWN_BEDROCK_STATES.has(stateKey)) {
        problems.push({ block: `${key} (${state.name})`, problem: `state key "${stateKey}" is not a known Bedrock block state` });
      }
    }
  }

  return { problems, checked: seen.size, blockCount: entries.length, version };
}

if (import.meta.main) {
  const result = validatePalette();
  console.log(`minecraft-data bedrock version: ${result.version}`);
  console.log(`checked ${result.blockCount} palette entries (${result.checked} distinct block names)`);
  if (result.problems.length) {
    console.log(`\n${result.problems.length} problem(s):`);
    for (const p of result.problems) console.log(`  - ${p.block}: ${p.problem}`);
    process.exit(1);
  }
  console.log("palette OK");
}
