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

---

## Follow-up (same day): reconciliation + build repair

The commits that saved these findings left `main` **not compiling** — `bun tsc -b --noEmit`
reported 138 errors and no `.mcworld` could be produced:

| File | What had happened | Fix |
|------|-------------------|-----|
| `src/world/structures.ts` | Deleted in `4f8dd40`, then "restored" as a 129-line stub with only `pad` / `groundY` / `areaGround`. The other 15 builders that `areas.ts` and `roads.ts` import (`tower`, `curtainWall`, `gatehouse`, `keep`, `house`, `bridge`, `glassBridge`, `ruinedArch`, `grave`, `statue`, `portalFrame`, `lampPost`, `cage`, `labyrinth`, `wheatTerraces`) were gone. | Restored the full 679-line, 18-builder file and merged in the improved `pad()` (forced solid foundations). |
| `src/world/config.ts` | Rewritten in a different shape: the `terrain` object and the derived exports `WORLD_MIN_X/MAX_X/MIN_Z/MAX_Z`, `WORLD_HEIGHT`, `GRID_SIZE`, `gridIndex` were dropped, but `terrain.ts`, `world.ts`, `icon.ts` and `map-ascii.ts` still import them — and `terrain.ts` still reads `CONFIG.terrain`. | Restored the original shape, keeping the new **chunkVersion 42**, `inventoryVersion 1.26.51`, `networkVersion 2193`, `minimumClientVersion [1,26,50,0,0]` and the softened terrain values (radius 220, gulf −108..−72). |
| `src/bedrock/leveldat.ts` | Rewritten against `Nbt.int` / `Nbt.comp` / `NbtTag` imported from the local `nbt-le.ts`, which exports none of those; `parseLevelDat` was also dropped, breaking `inspect-world.ts` and the palette test. | Restored the `prismarine-nbt` implementation with both `buildLevelDat` and `parseLevelDat`, then added the 1.26 stamps. |

`layout.ts`, `terrain.ts`, `world-writer.ts`, `data3d.ts` and `build.ts` from that session were
sound and were kept, so the 1.26 version fields and the Data3D/Data2D writers are still in place.

### FlatWorldLayers: air-only is kept on purpose

The phone export stores `ClassicFlat` (bedrock/dirt/grass) because that is Bedrock's default stored
preset. It is **not** adopted here. With an air-only layer the region outside the realm stays pure
void whatever `Generator: 1` means, which matches *"barren wastelands fracture to void"*; the
`ClassicFlat` preset would carpet every ungenerated chunk outside the 512×512 realm with grass.

### Status after the repair

- `bun run check` is green: 16 tests, palette OK, 745 chunks / 2 275 subchunks, **23/23 inspection
  checks**.
- `.github/workflows/ci.yml` now runs that same gate on every push and pull request, which is what
  would have caught the breakage above.
- Remaining gap: Data3D is still the uniform-biome stub (~637 bytes) rather than a ~5 KB native
  layout, and tags `0x3F` / `0x40` / `0x41` are still unwritten. Neither has a documented payload
  here, so neither is guessed at; both are recorded for whoever reverse-engineers them.
- Still unverified: whether the rebuilt world renders on the physical iPhone.

---

## The reason the device showed a broken world: subchunk index order

A screen recording from the physical iPhone showed the imported world as horizontal stripes rather
than the island in `docs/map-preview.jpg`. The cause was not the Data3D stub and not the version
stamps — it was the subchunk block index order.

* Bedrock: `index = (x << 8) | (z << 4) | y` — XZY, **Y fastest**.
* This generator's buffers: `index = x + (z << 4) + (y << 8)` — **Y major**, so a subchunk is 4096
  consecutive `Uint16Array` entries.

`ChunkBuffer.subChunkSlice()` copied the buffer into the payload unchanged, which swapped X and Y:
the file's index bits were `[y][z][x]` where Bedrock reads `[x][z][y]`. Columns became rows.

What this does **not** break, and therefore why it survived every check: the ZIP, the LevelDB keys,
`level.dat`, `FinalizedState`, `Data3D`, the palette and the payload parser all stay valid. A
transposed world is a perfectly well-formed Bedrock world that happens to contain the wrong terrain.
Confirming the diagnosis from this environment needed a generator-aware check rather than a
format-aware one.

`bun run inspect` now performs that check: it regenerates the scene and compares all 2 275 subchunks
against the written payloads block by block, indexing the payload Bedrock's way. Any future
transposition (or offset, or dropped block) fails the build instead of reaching a device.

Two side notes from the same session, both now enforced in code:

* **Gravity blocks are excluded from the world entirely.** `minecraft:gravel` was 5.9 % of all
  blocks; gravel, sand and concrete powder fall in Bedrock and, in a map placed block by block,
  fall out of the terrain and glitch the client. `stabilize()` in `src/world/blocks.ts` swaps them
  for `minecraft:green_stained_glass` at write time, and the inspector rejects any that appear.
* **The landmark audit** (`bun run audit`) fingerprints each of the fourteen landmarks by a block
  only it places. It scans the full footprint volume, because the tomb and the crypt rooms are
  *below* the ground and the levelled pads are flush with it.

The Data3D gap described above (uniform biome, ~637 bytes instead of ~5 KB) is still open, and it is
still unknown whether the client accepts it in place. It is no longer the leading suspect for the
broken rendering, though, since it cannot rotate a world 90°.
