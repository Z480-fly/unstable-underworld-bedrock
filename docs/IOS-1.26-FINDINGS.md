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
5. ~~**Still TODO:** Expand Data3D to phone-sized biome layout (~5252 bytes)~~ — **resolved**, see
   "Data3D and chunk metadata" below. The real layout is 24 biome storages; the phone's ~5252 bytes
   came from subchunks that hold two biomes each, not from a different structure.
6. ~~**Still TODO:** Tags 0x3F / 0x40 / 0x41 payloads from phone WAL~~ — **resolved** from the
   format spec plus two independent implementations, see below.
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

---

## Data3D and chunk metadata: resolved (2026-09-26)

The two remaining TODOs above are now implemented. The work was guided by three independent
sources, which agree byte for byte:

* the byte-level "Bedrock Edition level format" table (Minecraft Wiki, Chinese mirror included);
* uNmINeD's reverse-engineering write-up of the 1.18 3D biome format;
* two implementations — `mcbe-leveldb` (the TypeScript parser `bun run inspect` already uses as its
  gate) and Prismarine-Anchor's Rust `data_3d.rs` / `level_chunk_meta_data_dictionary.rs`.

### Data3D: 24 storages, not 25, and not "phone-sized" for a single-biome world

```
512 bytes   heightmap: 256 x int16 LE, index = x + z*16
24 storages one per subchunk, bottom (y -64) to top (y 304)
  header    (type << 1) | 1:   0xFF = no biome data, 0x01 = uniform,
                               0x03/0x05/... = palettized
  uniform   0x01 + one int32 biome id          (5 bytes)
  palettized words: ceil(4096 / floor(32/type)) u32 LE, low bits first,
             then an int32 palette size and that many int32 biome ids
```

The Overworld is 384 blocks tall — exactly 24 subchunks. The older wiki claim of "exactly 25
palettes" is wrong (a 25th storage has nowhere to live, both implementations pad to 24, and the
Nether/End counts the same source gives — 8 and 16 — are exactly their 128- and 256-block heights).

That also explains the size discrepancy that started this thread. A 1.26.51 phone chunk's Data3D is
`512 + 9 x 525 + 15 x 1 = 5252` bytes: nine subchunks holding two biomes each (5-byte uniform
storages for the rest, `0xFF` for the fifteen sky subchunks that do not exist). This map is a
single soul-sand-valley biome, so its *native* encoding is `512 + 24 x 5 = 632` bytes — the same
layout, just with nothing to enumerate. Matching the phone's byte count would require inventing
biomes the map does not have.

### Chunk metadata: 0x3F / 0x40 / 0x41

The wiki's hex column (and `mcbe-leveldb`'s key table) put:

| Tag | Name | Payload |
|-----|------|---------|
| 0x3D | GeneratedPreCavesAndCliffsBlending | uint8 — not written by a 1.26 chunk |
| 0x3E | BlendingBiomeHeight | deprecated, not written |
| **0x3F** | **MetaDataHash** | uint64 LE — xxHash64 of the chunk's metadata NBT |
| **0x40** | **BlendingData** | uint8 used-for-blending, uint8 blend version (+ heights when used) |
| **0x41** | **ActorDigestVersion** | uint8 — 0 is the only shipped format (1.18.30) |

`MetaDataHash` keys into the world-level `LevelChunkMetaDataDictionary`: `u32` entry count, then
`u64` hash + NBT compound per entry. The hash is xxHash64 (seed 0) over the metadata serialized the
way the game serializes it for hashing: keys recursively sorted, and Bedrock's *network* NBT order
(varint string lengths, zig-zag varint i32/i64). Prismarine-Anchor's parser verifies that hash on
every entry it reads, so the recipe is validated against real worlds even though this environment
has no sample to check it against locally.

All 1 024 realm chunks now carry the three records. The metadata is built with every one-time
migration already marked done (base version 1.26.51, extended Overworld height range, underwater
lava-lake / below-zero fixes applied), so a client that reads it has nothing left to "upgrade", and
all chunks share one dictionary entry — which is what a real world does too.

### Verification

`bun run check` (typecheck -> 37 tests -> palette -> build -> inspect) is green. Inspect grew from
26 to 39 checks: every Data3D payload must decode as 24 uniform storages of 632 bytes, read back
through `mcbe-leveldb`, and match the regenerated heightmap column for column; every MetaDataHash
must equal the recomputed hash; and the dictionary entry it points at must be readable by the
reference parser. `Data2D` is no longer written at all, matching a native 1.18+ chunk.
