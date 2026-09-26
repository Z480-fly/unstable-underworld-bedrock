/**
 * Block palette for the Underworld reconstruction.
 *
 * Everything here is a vanilla Bedrock block state. The palette is deliberately
 * dark: deepslate / blackstone / soul / sculk / obsidian / black concrete, with
 * gilded + gold accents and cold blue-grey glass for the void bridges.
 *
 * Canon sources for the palette (see README "References"):
 *  - "Almost everything is gray or black, with really the only vibrant color
 *    being the green visible on some structures."  -> Soul Keepers wiki page.
 *  - dungeon rooms built from black concrete with redstone lamp floors.
 *  - soul sand / soul soil patches, deep chasms, void cracks, sculk tomb.
 */

export type StateValue = string | number | boolean;

export interface BlockState {
  readonly name: string;
  readonly states?: Readonly<Record<string, StateValue>>;
}

export function bs(name: string, states?: Record<string, StateValue>): BlockState {
  return states ? { name, states } : { name };
}

/** Stable string key used for palette dedupe inside a chunk. */
export function blockKey(b: BlockState): string {
  if (!b.states) return b.name;
  const keys = Object.keys(b.states).sort();
  let out = b.name + "|";
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    out += k + "=" + String(b.states[k]) + (i === keys.length - 1 ? "" : ",");
  }
  return out;
}

export const AIR: BlockState = bs("minecraft:air");

export function stairs(name: string, facing: 0 | 1 | 2 | 3, upsideDown = false): BlockState {
  return bs(name, { upside_down_bit: upsideDown, weirdo_direction: facing });
}

export function slab(name: string, top = false): BlockState {
  return bs(name, { top_slot_bit: top });
}

export function wall(
  name: string,
  connections: { north?: "none" | "short" | "tall"; east?: "none" | "short" | "tall"; south?: "none" | "short" | "tall"; west?: "none" | "short" | "tall" } = {},
): BlockState {
  return bs(name, {
    wall_connection_type_north: connections.north ?? "none",
    wall_connection_type_east: connections.east ?? "none",
    wall_connection_type_south: connections.south ?? "none",
    wall_connection_type_west: connections.west ?? "none",
    wall_post_bit: false,
  });
}

export function log(name: string, axis: "x" | "y" | "z" = "y"): BlockState {
  return bs(name, { pillar_axis: axis });
}

export function leaves(name: string): BlockState {
  return bs(name, { persistent_bit: true, update_bit: false });
}

export const P = {
  air: AIR,
  deepslate: bs("minecraft:deepslate"),
  cobbledDeepslate: bs("minecraft:cobbled_deepslate"),
  polishedDeepslate: bs("minecraft:polished_deepslate"),
  deepslateBricks: bs("minecraft:deepslate_bricks"),
  deepslateTiles: bs("minecraft:deepslate_tiles"),
  crackedDeepslateBricks: bs("minecraft:cracked_deepslate_bricks"),
  crackedDeepslateTiles: bs("minecraft:cracked_deepslate_tiles"),
  chiseledDeepslate: bs("minecraft:chiseled_deepslate"),
  tuff: bs("minecraft:tuff"),
  gravel: bs("minecraft:gravel"),
  blackstone: bs("minecraft:blackstone"),
  polishedBlackstone: bs("minecraft:polished_blackstone"),
  blackstoneBricks: bs("minecraft:polished_blackstone_bricks"),
  crackedBlackstoneBricks: bs("minecraft:cracked_polished_blackstone_bricks"),
  chiseledBlackstone: bs("minecraft:chiseled_polished_blackstone"),
  gildedBlackstone: bs("minecraft:gilded_blackstone"),
  basalt: bs("minecraft:basalt"),
  smoothBasalt: bs("minecraft:smooth_basalt"),
  obsidian: bs("minecraft:obsidian"),
  cryingObsidian: bs("minecraft:crying_obsidian"),
  magma: bs("minecraft:magma"),
  netherrack: bs("minecraft:netherrack"),
  soulSand: bs("minecraft:soul_sand"),
  soulSoil: bs("minecraft:soul_soil"),
  sculk: bs("minecraft:sculk"),
  sculkVein: bs("minecraft:sculk_vein", { multi_face_direction_bits: 63 }),
  sculkCatalyst: bs("minecraft:sculk_catalyst"),
  sculkShrieker: bs("minecraft:sculk_shrieker", { can_summon: false, active: false }),
  sculkSensor: bs("minecraft:sculk_sensor"),
  stoneBrick: bs("minecraft:stone_bricks"),
  mossyStoneBrick: bs("minecraft:mossy_stone_bricks"),
  crackedStoneBrick: bs("minecraft:cracked_stone_bricks"),
  chiseledStoneBrick: bs("minecraft:chiseled_stone_bricks"),
  deepslateTilesWall: wall("minecraft:deepslate_tile_wall"),
  blackstoneWall: wall("minecraft:blackstone_wall"),
  cobbledDeepslateWall: wall("minecraft:cobbled_deepslate_wall"),
  polishedBlackstoneWall: wall("minecraft:polished_blackstone_wall"),
  stoneBrickWall: wall("minecraft:stone_brick_wall"),
  ironBars: bs("minecraft:iron_bars"),
  chain: bs("minecraft:iron_chain", { pillar_axis: "y" }),
  deepslateTileSlab: slab("minecraft:deepslate_tile_slab"),
  blackstoneBrickSlab: slab("minecraft:polished_blackstone_brick_slab"),
  blackstoneBrickStairs: stairs("minecraft:polished_blackstone_brick_stairs", 0),
  blackConcrete: bs("minecraft:black_concrete"),
  grayConcrete: bs("minecraft:gray_concrete"),
  lightGrayConcrete: bs("minecraft:light_gray_concrete"),
  brownConcrete: bs("minecraft:brown_concrete"),
  darkOakLog: log("minecraft:dark_oak_log"),
  darkOakPlanks: bs("minecraft:dark_oak_planks"),
  darkOakFence: bs("minecraft:dark_oak_fence"),
  darkOakSlab: slab("minecraft:dark_oak_slab"),
  darkOakStairs: stairs("minecraft:dark_oak_stairs", 0),
  darkOakDoor: bs("minecraft:dark_oak_door", { direction: 0, door_hinge_bit: false, open_bit: false, upper_block_bit: false }),
  darkOakTrapdoor: bs("minecraft:dark_oak_trapdoor", { direction: 0, open_bit: false, upside_down_bit: false }),
  spruceTrapdoor: bs("minecraft:spruce_trapdoor", { direction: 0, open_bit: false, upside_down_bit: false }),
  cauldron: bs("minecraft:cauldron", { fill_level: 0 }),
  sprucePlanks: bs("minecraft:spruce_planks"),
  spruceLog: log("minecraft:spruce_log"),
  spruceFence: bs("minecraft:spruce_fence"),
  spruceStairs: stairs("minecraft:spruce_stairs", 0),
  spruceSlab: slab("minecraft:spruce_slab"),
  bookshelf: bs("minecraft:bookshelf"),
  barrel: bs("minecraft:barrel", { facing_direction: 0, open_bit: false }),
  soulLantern: bs("minecraft:soul_lantern", { hanging: false }),
  hangingSoulLantern: bs("minecraft:soul_lantern", { hanging: true }),
  lantern: bs("minecraft:lantern", { hanging: false }),
  hangingLantern: bs("minecraft:lantern", { hanging: true }),
  soulTorch: bs("minecraft:soul_torch"),
  torch: bs("minecraft:torch"),
  campfire: bs("minecraft:campfire", { extinguished: true, direction: 0 }),
  soulCampfire: bs("minecraft:soul_campfire", { extinguished: false, direction: 0 }),
  glowstone: bs("minecraft:glowstone"),
  seaLantern: bs("minecraft:sea_lantern"),
  shroomlight: bs("minecraft:shroomlight"),
  endRod: bs("minecraft:end_rod", { facing_direction: 1 }),
  redstoneLamp: bs("minecraft:redstone_lamp"),
  litRedstoneLamp: bs("minecraft:lit_redstone_lamp"),
  copperBulb: bs("minecraft:copper_bulb", { lit: true, powered_bit: false }),
  unlitCopperBulb: bs("minecraft:copper_bulb", { lit: false, powered_bit: false }),
  amethyst: bs("minecraft:amethyst_block"),
  glass: bs("minecraft:glass"),
  tintedGlass: bs("minecraft:tinted_glass"),
  grayGlass: bs("minecraft:gray_stained_glass"),
  lightGrayGlass: bs("minecraft:light_gray_stained_glass"),
  whiteGlass: bs("minecraft:white_stained_glass"),
  blackGlass: bs("minecraft:black_stained_glass"),
  lightBlueGlass: bs("minecraft:light_blue_stained_glass"),
  purpleGlass: bs("minecraft:purple_stained_glass"),
  cyanGlass: bs("minecraft:cyan_stained_glass"),
  greenGlass: bs("minecraft:green_stained_glass"),
  limeGlass: bs("minecraft:lime_stained_glass"),
  glassPane: bs("minecraft:glass_pane"),
  grayGlassPane: bs("minecraft:gray_stained_glass_pane"),
  whiteGlassPane: bs("minecraft:white_stained_glass_pane"),
  lightBlueGlassPane: bs("minecraft:light_blue_stained_glass_pane"),
  greenGlassPane: bs("minecraft:green_stained_glass_pane"),
  blackGlassPane: bs("minecraft:black_stained_glass_pane"),
  endStone: bs("minecraft:end_stone"),
  // Bedrock's id for end stone bricks is `end_bricks` (Java uses end_stone_bricks).
  endStoneBricks: bs("minecraft:end_bricks"),
  purpurBlock: bs("minecraft:purpur_block"),
  purpurPillar: bs("minecraft:purpur_pillar", { pillar_axis: "y" }),
  goldBlock: bs("minecraft:gold_block"),
  goldOre: bs("minecraft:gold_ore"),
  rawGoldBlock: bs("minecraft:raw_gold_block"),
  farmland: bs("minecraft:farmland", { moisturized_amount: 7 }),
  dryFarmland: bs("minecraft:farmland", { moisturized_amount: 0 }),
  wheat: bs("minecraft:wheat", { growth: 7 }),
  youngWheat: bs("minecraft:wheat", { growth: 4 }),
  hayBlock: bs("minecraft:hay_block", { pillar_axis: "y" }),
  water: bs("minecraft:water", { liquid_depth: 0 }),
  composter: bs("minecraft:composter", { composter_fill_level: 8 }),
  dirt: bs("minecraft:dirt"),
  coarseDirt: bs("minecraft:coarse_dirt"),
  podzol: bs("minecraft:podzol"),
  snowLayer: bs("minecraft:snow_layer", { covered_bit: false, height: 4 }),
  thinSnowLayer: bs("minecraft:snow_layer", { covered_bit: false, height: 1 }),
  snowBlock: bs("minecraft:snow"),
  powderSnow: bs("minecraft:powder_snow"),
  ice: bs("minecraft:ice"),
  packedIce: bs("minecraft:packed_ice"),
  blueIce: bs("minecraft:blue_ice"),
  lava: bs("minecraft:lava", { liquid_depth: 0 }),
  cageIron: bs("minecraft:iron_bars"),
  ironBlock: bs("minecraft:iron_block"),
  portal: bs("minecraft:portal"),
  endPortalFrame: bs("minecraft:end_portal_frame", { direction: 0, end_portal_eye_bit: false }),
  endPortalFrameEye: bs("minecraft:end_portal_frame", { direction: 0, end_portal_eye_bit: true }),
  endPortal: bs("minecraft:end_portal"),
  pressurePlate: bs("minecraft:stone_pressure_plate", { redstone_signal: 0 }),
  slime: bs("minecraft:slime"),
  sand: bs("minecraft:sand"),
  bone: bs("minecraft:bone_block", { pillar_axis: "y" }),
  deadBush: bs("minecraft:deadbush" as string),
  brewingStand: bs("minecraft:brewing_stand"),
  craftingTable: bs("minecraft:crafting_table"),
  furnace: bs("minecraft:furnace", { facing_direction: 2, lit: false }),
  chest: bs("minecraft:chest", { facing_direction: 2 }),
} as const satisfies Record<string, BlockState>;

export type PaletteKey = keyof typeof P;

export const GRAVITY_BLOCK_NAMES: ReadonlySet<string> = new Set([
  "minecraft:gravel",
  "minecraft:sand",
  "minecraft:red_sand",
  "minecraft:white_concrete_powder",
  "minecraft:orange_concrete_powder",
  "minecraft:magenta_concrete_powder",
  "minecraft:light_blue_concrete_powder",
  "minecraft:yellow_concrete_powder",
  "minecraft:lime_concrete_powder",
  "minecraft:pink_concrete_powder",
  "minecraft:gray_concrete_powder",
  "minecraft:light_gray_concrete_powder",
  "minecraft:cyan_concrete_powder",
  "minecraft:purple_concrete_powder",
  "minecraft:blue_concrete_powder",
  "minecraft:brown_concrete_powder",
  "minecraft:green_concrete_powder",
  "minecraft:red_concrete_powder",
  "minecraft:black_concrete_powder",
]);

const GRAVITY_REPLACEMENTS: ReadonlyMap<string, BlockState> = new Map([
  ["minecraft:gravel", P.tuff],
  ["minecraft:sand", P.greenGlass],
  ["minecraft:red_sand", P.greenGlass],
  ...([...GRAVITY_BLOCK_NAMES]
    .filter((name) => name.endsWith("_concrete_powder"))
    .map((name) => [name, P.grayConcrete] as const)),
]);

export function isGravityBlock(name: string): boolean {
  return GRAVITY_BLOCK_NAMES.has(name);
}

export function stabilize(block: BlockState): BlockState {
  return GRAVITY_REPLACEMENTS.get(block.name) ?? block;
}
