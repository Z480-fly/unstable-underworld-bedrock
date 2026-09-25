/**
 * Builds Bedrock `level.dat` (little-endian NBT with 8-byte header).
 *
 * Header: StorageVersion (i32 LE) + NBT payload length (i32 LE).
 * Payload: unnamed root compound.
 *
 * Fields aligned to an iPhone Bedrock 1.26.51 export (2026-09-25).
 */

import { CONFIG } from "../world/config.ts";
import * as nbt from "./nbt-le.ts";
import type { NbtTag } from "./nbt-le.ts";

export interface LevelDatOptions {
  levelName: string;
  spawn: { x: number; y: number; z: number };
  seed: string;
  flatWorld?: boolean;
}

export function buildLevelDat(opts: LevelDatOptions): Buffer {
  const lastPlayed = Math.floor(Date.now() / 1000);

  const flatLayers = JSON.stringify({
    biome_id: 1,
    block_layers: [
      { block_name: "minecraft:bedrock", count: 1 },
      { block_name: "minecraft:dirt", count: 2 },
      { block_name: "minecraft:grass_block", count: 1 },
    ],
    encoding_version: 6,
    preset_id: "ClassicFlat",
    structure_options: null,
    world_version: "version.post_1_18",
  });

  const entries: Record<string, NbtTag> = {
    StorageVersion: nbt.int(10),
    LevelName: nbt.string(opts.levelName),
    GameType: nbt.int(1),
    Generator: nbt.int(1), // Infinite (phone uses 1)
    FlatWorldLayers: nbt.string(flatLayers),
    RandomSeed: nbt.long(BigInt(CONFIG.seed)),
    LevelSeed: nbt.string(opts.seed),
    LastPlayed: nbt.long(BigInt(lastPlayed)),
    Time: nbt.int(18000),
    DayCycleStopTime: nbt.int(18000),
    currentTick: nbt.long(0n),
    SpawnX: nbt.int(opts.spawn.x),
    SpawnY: nbt.int(opts.spawn.y),
    SpawnZ: nbt.int(opts.spawn.z),
    difficulty: nbt.int(1),
    spawnV1: nbt.int(1),
    hasBeenLoadedInCreative: nbt.int(1),
    commandsEnabled: nbt.int(1),
    immutableWorld: nbt.int(0),
    startWithMapEnabled: nbt.int(0),
    texturePacksRequired: nbt.int(0),
    isFromLockedTemplate: nbt.int(0),
    isFromWorldTemplate: nbt.int(0),
    isWorldTemplateOptionLocked: nbt.int(0),
    ConfirmedPlatformLockedContent: nbt.int(0),
    EducationFeaturesEnabled: nbt.int(0),
    lanternLevel: nbt.int(0),
    lightningLevel: nbt.int(0),
    rainLevel: nbt.int(0),
    NetherScale: nbt.int(8),
    limitedWorldOriginX: nbt.int(opts.spawn.x),
    limitedWorldOriginY: nbt.int(80),
    limitedWorldOriginZ: nbt.int(opts.spawn.z),
    NetherWorldType: nbt.int(0),
    MultiplayerGame: nbt.int(1),
    MultiplayerGameIntent: nbt.int(1),
    LANBroadcast: nbt.int(1),
    LANBroadcastIntent: nbt.int(1),
    PlatformBroadcastIntent: nbt.int(1),
    XBLBroadcastIntent: nbt.int(1),
    worldStartCount: nbt.long(0n),
    MinimumCompatibleClientVersion: nbt.list(nbt.int(CONFIG.minimumClientVersion)),
    lastOpenedWithVersion: nbt.list(nbt.int([1, 26, 51, 1, 0])),
    InventoryVersion: nbt.string(CONFIG.inventoryVersion),
    NetworkVersion: nbt.int(CONFIG.networkVersion ?? 2193),
    WorldVersion: nbt.int(1),
    Platform: nbt.int(2),
    prid: nbt.string(""),
    world_policies: nbt.comp({}),
    experiments: nbt.comp({ experiments_ever_used: nbt.int(0), saved_with_toggled_experiments: nbt.int(0) }),
    abilities: nbt.comp({
      attackmobs: nbt.int(1),
      attackplayers: nbt.int(1),
      build: nbt.int(1),
      doorsandswitches: nbt.int(1),
      flying: nbt.int(0),
      flySpeed: nbt.float(0.05),
      instabuild: nbt.int(0),
      invulnerable: nbt.int(0),
      lightning: nbt.int(0),
      mayfly: nbt.int(1),
      mine: nbt.int(1),
      opencontainers: nbt.int(1),
      permissionsLevel: nbt.int(1),
      playerPermissionsLevel: nbt.int(1),
      teleport: nbt.int(1),
      walkSpeed: nbt.float(0.1),
    }),
    commandblockoutput: nbt.int(1),
    dodaylightcycle: nbt.int(0),
    doentitydrops: nbt.int(1),
    dofiretick: nbt.int(1),
    dolimitedcrafting: nbt.int(0),
    domobloot: nbt.int(1),
    domobspawning: nbt.int(0),
    dotiledrops: nbt.int(1),
    doweathercycle: nbt.int(0),
    drowningdamage: nbt.int(1),
    falldamage: nbt.int(1),
    firedamage: nbt.int(1),
    keepinventory: nbt.int(0),
    mobgriefing: nbt.int(1),
    naturalregeneration: nbt.int(1),
    playerssleepingpercentage: nbt.int(100),
    randomtickspeed: nbt.int(1),
    sendcommandfeedback: nbt.int(1),
    showcoordinates: nbt.int(1),
    showdeathmessages: nbt.int(1),
    showtags: nbt.int(1),
    spawnradius: nbt.int(5),
    tntexplodes: nbt.int(1),
  };

  const root = nbt.comp(entries);
  const payload = nbt.encode(root);
  const header = Buffer.allocUnsafe(8);
  header.writeInt32LE(10, 0); // StorageVersion
  header.writeInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}
