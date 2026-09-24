/**
 * level.dat construction.
 *
 * `level.dat` is an 8 byte header (u32 LE storage version = 10, u32 LE payload
 * length) followed by uncompressed little-endian NBT. The world is a *void flat
 * world* (`Generator: 1` + an air-only flat layer) so that everything outside
 * the hand-built realm stays void - which is how the Underworld is described in
 * the source material ("a world within the void", "sometimes these barren
 * wastelands fracture to void").
 */

import nbt from "prismarine-nbt";
import { CONFIG } from "../world/config.ts";

export interface LevelDatOptions {
  levelName: string;
  spawn: { x: number; y: number; z: number };
  seed: string;
  /** Unix seconds. */
  lastPlayed?: number;
  /** void = the air-only superflat preset (matches "fractures to void"). */
  flatWorld?: boolean;
}

/** Game rules written to level.dat; Bedrock stores each rule as a root Int tag. */
const GAME_RULES: Record<string, number> = {
  commandblockoutput: 0,
  dodaylightcycle: 0, // permanently dark: the Underworld has no day
  doentitydrops: 0,
  dofiretick: 0, // fewer ticking blocks = smoother on phones
  dolimitedcrafting: 0,
  domobloot: 0,
  domobspawning: 0, // "map only": no mobs to fight or lag the device
  dotiledrops: 0,
  doweathercycle: 0,
  drowningdamage: 1,
  falldamage: 1,
  firedamage: 1,
  keepinventory: 1,
  mobgriefing: 0,
  naturalregeneration: 1,
  playerssleepingpercentage: 100,
  pvp: 1,
  randomtickspeed: 3,
  sendcommandfeedback: 1,
  showcoordinates: 0, // canon: "in the Underworld coordinates are broken"
  showdeathmessages: 1,
  showtags: 1,
  spawnradius: 2,
  tntexplodes: 0,
};

type NbtTag = { type: string; value: unknown };

export function buildLevelDatNbt(opts: LevelDatOptions): nbt.NBT {
  const lastPlayed = opts.lastPlayed ?? Math.floor(Date.now() / 1000);
  const flatLayers = JSON.stringify({
    biome_id: 1,
    block_layers: opts.flatWorld === false ? [{ block_name: "minecraft:deepslate", count: 1 }] : [{ block_name: "minecraft:air", count: 1 }],
    encoding_version: 6,
    structure_options: null,
  });

  const entries: Record<string, NbtTag> = {
    StorageVersion: nbt.int(10),
    LevelName: nbt.string(opts.levelName),
    GameType: nbt.int(1),
    Generator: nbt.int(1), // flat / superflat
    FlatWorldLayers: nbt.string(flatLayers),
    RandomSeed: nbt.long(BigInt(CONFIG.seed)),
    LevelSeed: nbt.string(opts.seed),
    LastPlayed: nbt.long(BigInt(lastPlayed)),
    Time: nbt.int(18000), // midnight: dark sky over the wasteland
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
    lastOpenedWithVersion: nbt.list(nbt.int(CONFIG.minimumClientVersion)),
    InventoryVersion: nbt.string(CONFIG.inventoryVersion),
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
      mayfly: nbt.int(0),
      mine: nbt.int(1),
      op: nbt.int(1),
      opencontainers: nbt.int(1),
      permissionsLevel: nbt.int(2),
      playerPermissionsLevel: nbt.int(1),
      teleport: nbt.int(1),
      walkSpeed: nbt.float(0.1),
    }),
  };

  for (const [rule, value] of Object.entries(GAME_RULES)) {
    entries[rule] = nbt.int(value);
  }

  return { type: "compound", name: "", value: entries as unknown as nbt.NBT["value"] } as nbt.NBT;
}

export function buildLevelDat(opts: LevelDatOptions): Buffer {
  const payload = nbt.writeUncompressed(buildLevelDatNbt(opts), "little");
  const header = Buffer.alloc(8);
  header.writeUInt32LE(10, 0); // storage version
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

/** Parse a level.dat back into NBT (used by the verifier). */
export async function parseLevelDat(
  buffer: Buffer,
): Promise<{ storageVersion: number; length: number; data: nbt.NBT }> {
  const storageVersion = buffer.readUInt32LE(0);
  const length = buffer.readUInt32LE(4);
  const parsed = await nbt.parse(buffer.subarray(8, 8 + length), "little");
  return { storageVersion, length, data: parsed.parsed };
}
