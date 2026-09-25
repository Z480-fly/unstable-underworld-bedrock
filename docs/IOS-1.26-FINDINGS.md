# iOS Bedrock 1.26.51 — format findings (2026-09-25)

Comparison of our generator vs a world created on the target iPhone
(`new test world`, exported from Files → Compress world folder).

## Target device

- Platform: iPhone, Minecraft Bedrock
- `InventoryVersion`: **1.26.51**
- `lastOpenedWithVersion`: `[1, 26, 51, 1, 0]`
- `MinimumCompatibleClientVersion`: `[1, 26, 50, 0, 0]`
- `NetworkVersion`: **2193**
- `Platform`: 2
- `WorldVersion`: 1

## Critical mismatches (why imports looked empty)

| Item | Phone-native | Our builds (pre-fix) |
|------|--------------|------------------------|
| Chunk Version (tag 0x2C) | **42** | **41** |
| Data3D size | **~5252 bytes** | **~637 bytes** (stub) |
| Data2D | Not written | Written (optional) |
| InventoryVersion | 1.26.51 | 1.21.0 |
| NetworkVersion | 2193 | missing |
| Extra chunk tags | 0x3F, 0x40, 0x41 present | missing |
| FlatWorldLayers | ClassicFlat (bedrock/dirt/grass) | air-only layer |

## Phone LevelDB tag counts (sample world)

- `0x2B` Data3D: 42
- `0x2C` Version: 42 (value byte **42**)
- `0x2F` SubChunkPrefix: 375
- `0x36` FinalizedState: 43 (value **2**)
- `0x3F`, `0x40`, `0x41`: present on each chunk (1.26 metadata/blending-style)
- `0x31` BlockEntity: a few

Subchunk header on phone: version **9**, storage count **1** (same as us).

## Data3D notes

Phone Data3D is much larger than a heightmap + 25× uniform single-biome stub.
After the 512-byte heightmap, biome payload starts differently (not our `0x01` + one int32).
Next fix: reverse-engineer full biome storage from phone samples or copy known-good 1.26 encoder.

## Package layout (both OK)

`.mcworld` = ZIP of world folder **contents** at archive root:

```
level.dat
levelname.txt
world_icon.jpeg
world_behavior_packs.json   # phone has "[]"
world_resource_packs.json   # phone has "[]"
db/
  CURRENT
  MANIFEST-*
  *.ldb / *.log
```

iOS path after import:

```
On My iPhone/Minecraft/games/com.mojang/minecraftWorlds/<randomId>/
```

## Work already pushed

- `src/bedrock/data3d.ts` — Data3D/Data2D serializers (stub biomes; needs 1.26-accurate rewrite)
- `src/bedrock/world-writer.ts` — `putData3D` / `putData2D`
- `src/build.ts` — writes Data3D+Data2D for all realm chunks

## Code status (saved to repo)

1. ~~Set `chunkVersion` to **42**~~ — done in `config.ts`
2. ~~InventoryVersion / min client → **1.26.51** / **1.26.50**~~ — done in `config.ts`
3. ~~`NetworkVersion: 2193`, `WorldVersion: 1`, `Platform: 2`~~ — done in `leveldat.ts`
4. ~~FlatWorldLayers ClassicFlat~~ — done in `leveldat.ts`
5. **Still TODO:** Expand Data3D to phone-sized biome layout (~5252 bytes)
6. **Still TODO:** Tags 0x3F / 0x40 / 0x41 payloads from phone WAL
7. **Still TODO:** Confirm full `structures.ts` on remote (local copy is 24 KB)

## Handoff prompt (for another agent)

```
Repo: Z480-fly/unstable-underworld-bedrock
Target: Bedrock 1.26.51 iOS
Phone sample showed chunk version 42 (not 41), Data3D ~5252 bytes (not 637),
NetworkVersion 2193, InventoryVersion 1.26.51.
Read docs/IOS-1.26-FINDINGS.md and fix level.dat + Data3D + chunk version before more terrain tweaks.
```
