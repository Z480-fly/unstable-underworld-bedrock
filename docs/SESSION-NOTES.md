# Session notes — Underworld Bedrock on iOS (2026-09-24/25)

## Goal
Playable Unstable Underworld reconstruction on **Minecraft Bedrock 1.26.51 iPhone**.

## Timeline

1. User shared freebuff world video (Google Drive) — sparse plate, floating scraps.
2. Repo inspected: terrain gulf/chasms, pad foundations, landmarks in TypeScript.
3. Terrain tweaks (narrower gulf, softer chasms, stronger pad) — user still saw broken/empty map.
4. LevelDB inspection showed **blocks were written** (~2594 subchunks) but phone showed nothing.
5. Added **Data3D + Data2D** for all chunks — still failed on device.
6. User could not upload zip in chat; shared **phone-native world** via Drive.
7. Diff vs phone export found real format gaps (see `docs/IOS-1.26-FINDINGS.md`).
8. Format work landed (PR #5): Data3D rewritten to the native 24-slice layout, the per-chunk
   `MetaDataHash` / `BlendingData` / `ActorDigestVersion` records and the world-level
   `LevelChunkMetaDataDictionary` added, legacy Data2D dropped.
9. **Content pass** (the map itself, not the format):
   * realm expanded **512 × 512 → 704 × 704** (radius 220 → 300) with new terrain regions
     (southern range, east highlands, north basin, far-west spine) and three new chasms;
   * stained-glass windows on **every** tower and house (was iron-bar slits);
   * **the Glassworks** (`188, 226`) - a 30 × 60 hall of stained glass with glazed bays, rose
     windows, a half-collapsed glass roof, a glass bridge and a green glass crystal;
   * **the Gate Field** (`252, -116`) - eighteen nether portals in whole / **cut** / collapsed
     states, plus a ten-wide grand gate;
   * **the End Ruin** (`-246, -170`) - four broken end portals (`brokenEndPortal()` had been
     written and never called, so the map had no end portal at all), end stone / purpur plaza,
     end-rod pillars, a shard of the End overhead.
   Now 17 landmarks, 1 936 chunks, 4 808 subchunks, ~3.7 MB; `bun run check` green.

## Files saved this session

| Path | Purpose |
|------|--------|
| `docs/IOS-1.26-FINDINGS.md` | Phone vs generator format comparison |
| `src/bedrock/data3d.ts` | Data3D/Data2D serializers |
| `src/bedrock/world-writer.ts` | putData3D / putData2D |
| `src/build.ts` | Writes biomes for every chunk |
| `src/world/config.ts` | chunkVersion **42**, InventoryVersion **1.26.51**, networkVersion **2193** |
| `src/bedrock/leveldat.ts` | NetworkVersion, Platform, ClassicFlat layers, 1.26 version lists |

## Confirmed phone facts

- Chunk version byte: **42**
- Data3D ~**5252** bytes (ours still ~637 stub — main remaining bug)
- NetworkVersion **2193**
- InventoryVersion **1.26.51**
- Extra tags **0x3F / 0x40 / 0x41** per chunk

## Still broken for player

iOS still does not show buildings until Data3D matches phone size/layout and likely extra tags.

## Handoff

```
Read docs/IOS-1.26-FINDINGS.md and docs/SESSION-NOTES.md
Repo: Z480-fly/unstable-underworld-bedrock
Priority: rewrite Data3D to ~5KB phone format; chunk v42 already set; then rebuild .mcworld
```

---

## Follow-up (later the same day): main repaired, CI added

The saved commits did not compile (138 TypeScript errors): `structures.ts` was deleted and
replaced by a 3-function stub, `config.ts` lost the exports its callers import (`CONFIG.terrain`,
`WORLD_MIN_X` …), and `leveldat.ts` was pointed at an `nbt-le.ts` API that does not exist.
`bun run build:map` could not run at all, so the `.mcworld` in `dist/` was stale.

Fix: restored `structures.ts` (all 18 builders, plus the improved `pad()`), restored the
`config.ts` shape while keeping the 1.26.51 stamps, and restored `leveldat.ts` on
`prismarine-nbt` (re-adding `parseLevelDat`) with the phone's version fields. The terrain
softening and the Data3D/Data2D writers from the earlier session were kept, so the map was
rebuilt from the repaired source.

Current state: `bun run check` green (16 tests, palette OK, 745 chunks / 2 275 subchunks, 23/23
checks) and `.github/workflows/ci.yml` runs that gate on every push and pull request. See the
follow-up section of `docs/IOS-1.26-FINDINGS.md` for the file-by-file detail and the reasoning for
keeping `FlatWorldLayers` air-only.

---

## Follow-up: the transposed subchunk, and no more falling blocks

The world that came out of the last build **looked right on the map preview and wrong in the
game**. The preview (`docs/map-preview.jpg`) is rendered from the generator's in-memory buffer, so
it never saw the bug; the `.mcworld` did.

### The bug

Bedrock indexes a subchunk **XZY with Y fastest**:

```
index = (x << 8) | (z << 4) | y
```

The generator's chunk buffers are laid out **Y-major**:

```
index = x + (z << 4) + (y << 8)
```

Two different orders, and `subChunkSlice()` copied the buffer straight into the payload. In binary
the buffer's index bits are `[y y y y][z z z z][x x x x]` and Bedrock reads them as
`[x x x x][z z z z][y y y y]`, so **X and Y were swapped** in the written world: vertical columns
became horizontal runs of terrain. The payload still parsed, the palette was still valid, the ZIP
was still well formed, all 23 inspection checks passed — which is exactly why it shipped.

The fix is one transpose in `ChunkBuffer.subChunkSlice()`, which now walks the destination index in
Bedrock order. `src/world/world.ts` and `src/bedrock/subchunk.ts` both say so at the top now.

### Why it cannot come back

`bun run inspect` regenerates the whole scene and compares **every** written subchunk against it,
block for block, reading the payload back in Bedrock's index order (2 275 subchunks, 9.3 M
positions). A transposed payload fails that immediately. There is also a unit test that pins a
single block to Bedrock index `(x << 8) | (z << 4) | y`.

### No gravity blocks

`minecraft:gravel` was 5.9 % of the world. Gravel, sand and concrete powder *fall* in Bedrock, and
in a map that is placed block by block they drop out of the terrain, duplicate, punch holes in the
plate and keep re-triggering the fall loop — the "glitching the game" behaviour on a phone.

`stabilize()` in `src/world/blocks.ts` now substitutes every gravity block with
`minecraft:green_stained_glass` at the one choke point all voxel writes pass through
(`ChunkBuffer.setLocal`), so the builders keep asking for "the gravel shade of ground" and the world
never contains one. The inspector fails the build if a gravity name ever reaches a subchunk palette.

### Landmarks

`bun run audit` (new) walks each landmark's footprint and counts what it actually built: blocks
raised above the local ground plus occurrences of a signature material (`bookshelf` for the Citadel,
`wheat` for the Fields, `sculk_shrieker` for the Tomb, ...). All fourteen produce geometry. The tomb
and the crypt sit *below* the ground and the pads sit flush with it, so the audit and the matching
test scan the whole footprint volume rather than only the space above the surface — a top-down view
cannot see either of those, which is why "some buildings did not generate" is hard to confirm from
a map.

### State

`bun run check` green: 19 tests, palette OK (116 entries), 745 chunks / 2 275 subchunks,
**26/26 inspection checks**, `dist/Underworld-Simulator-Remastered.mcworld` 1.70 MB,
`docs/map-preview.jpg` regenerated (205 051 B). The generation pipeline moved into
`src/world/scene.ts` so the builder, the ASCII map, the audit and the inspector cannot drift.

Still unverified here: how it renders on a real iPhone.

---

## Fidelity pass: making the wasteland look like the Underworld

With the transposition and the gravity blocks out of the way, the next pass was about matching the
references rather than fixing bugs.

### The palette splits the way the sources do

The previous pass had swept *every* gravity block into green stained glass, which put bright green
across the whole ground. That contradicted the source material on the one point it is explicit
about:

> "Almost everything is gray or black, with really the only vibrant color being the green visible on
> some **structures**."

So the substitution now keeps the role of each block instead of flattening the map to one colour:
gravel (the wasteland's ash-grey ground) becomes **tuff**, sand (only ever used by the void castles'
parkour escape room) becomes **green stained glass**, concrete powder would become grey concrete.
The ground reads **gravel has gone grey**, and the green is placed deliberately as Soul Keeper
glazing in tower windows at the Breach, on the Withered Castle's corner towers, the Citadel, the
void castles, the Portal Lobby guard posts, and in the escape-room parkour.

Resulting mix, measured over all 4.03 M blocks: deepslate 52 %, tuff 21 %, blackstone 5.7 %,
basalt 3.6 %, cobbled deepslate 3.4 %, snow 2.3 %, gold ore 2.2 %, obsidian 2.0 %, soul sand/soil
2.5 %. No gravity block anywhere.

### The plain is ruined now

The references describe the wilderness as "an endless plain of broken structures", and the map was
carrying detail on only **1.5 %** of its non-landmark columns. `src/world/decorate.ts` gained
`scatterRuins`: half-buried wall stubs that erode to nothing at both ends, ruined tower stumps (tall
on one side, collapsed on the other - the silhouette that actually reads from a distance), fallen
columns with their snapped stumps, rubble fields and broken gate frames with the span fallen in.
Masonry darkens toward the west with the terrain.

Two tuning notes, because both were wrong on the first try:

* the first version excluded an extra 22 blocks around every landmark *footprint*, and the
  footprints are enormous (the Fields alone is 100 x 104), so almost nothing was eligible. Landmark
  pads and roads are protected columns already, so the margin only needs to stop masonry sprouting
  against a wall - it is 3.
* coverage is now **6.6 %** of the plain carrying standing detail, held in a band by a test
  (`0.04 < fraction < 0.25`) so a later pass cannot quietly return the map to bare noise.

`carveGroundFractures` adds the other half of the canon - "cracks of void forming on the ground":
long, thin, wandering cracks floored with magma and obsidian and edged with crying obsidian. One
block wide and shallow on purpose: texture, not a second chasm network, and it stops short of
landmarks and roads.

### State

`bun run check` green: 20 tests, palette OK, 745 chunks / 2 323 subchunks, 26/26 inspection checks,
`dist/Underworld-Simulator-Remastered.mcworld` 1.69 MB. `bun run audit` reports every landmark
building its signature geometry plus the wilderness coverage figure.

---

## The plate actually tears now (three bugs the old checks could not see)

The last pass added the fracture and rim detail the references describe, and then a probe of the
finished world showed that most of it was not happening. Three separate causes, all of them the same
shape of mistake: a guard that was correct for the code it was written for, applied to a map that is
mostly covered by landmarks.

### 1. The crack pass carved almost nothing

`carveGroundFractures` walked in steps and `break`-ed out of the walk on the first cell that was
protected or near a landmark. Measured on the real world, only **10 % of the plate** is free of both
(after the landmarks pad and protect their ground, and the road network protects its paths), so
9 cracks were opening on the order of a dozen columns in total - invisible. Worse, the refactor that
tried to make cracks "run their full length" added a `path.length < 8` guard on top, which took it
to *exactly zero*.

Now a crack is **walked first and carved afterwards** (a second, separate reason: a through-crack
voids its own columns, which would abort a step-by-step walk), and during the carve it **skips** the
cells it must not cut instead of stopping. A crack therefore crosses the whole plate and is only
interrupted where it should be - at a paved road or a building - which is also how a real crack
behaves. The breakthrough window is measured against the path that was **actually** walked, not the
planned length: a crack that leaves the plate half way through was otherwise never reaching its
window and never opening anything.

Half of the cracks now tear **clean through the plate**: the column is cleared to the bottom, marked
void and protected, and its walls are hardened the way `carveChasmWalls` hardens a chasm lip, so the
break reads as torn rock rather than a clean cut. **45 columns** of the 512 x 512 realm are a hole
dropping into the void; the rest of the cracks are shallow magma-and-obsidian seams with the odd
crying-obsidian bead, and a crack is occasionally torn 2 blocks wide so it reads on a phone screen.

### 2. A third of the plain was never decorated

Every detail loop in `decorate.ts` ran on a hard-coded **±190 square**, while the plate is a
superellipse of radius 220 in a realm that is **±256**. The entire outer band - rubble, boulders,
dead trees, bones, crack mouths, rim shards - stopped 30 blocks short of the edge on all four sides.
That is **23 663 walkable columns** carrying terrain and nothing else, and it hid itself: the audit
and the wilderness test both scanned \u00b1190 too, so the coverage figure was measured inside the
region that had been decorated.

All four loops, the audit and the test now run on `WORLD_MIN_X..WORLD_MAX_X` and the matching `Z`
bounds from `config.ts`, so the boundary is the realm and not a magic number. The audit went from *6.6 % of the
plain* to **8.7 % of 164 462 non-landmark columns** simply because it is finally looking at the
whole plate; the outer band alone carries detail on 18 % of its columns.

### 3. The rim now sheds

New `scatterPlateShards`: chunks of the plate's own rock drift just clear of the edge, and teeth of
obsidian with crying-obsidian tips hang off the torn underside. It only ever writes into **void**
columns (so it can never punch through the plate), it hugs the edge, and the expensive
nearest-land lookup runs only after a cheap hash rejection. Result: material hanging in the void in
1 200+ columns within three blocks of the land, and a rim that reads as an island coming apart
rather than a floating rectangle with a tidy border.

### Also fixed

* `colorAt` (the world-icon / map-preview colour table) keyed `minecraft:stonebrick`, which is not a
  block - `stone_bricks` is. Several heavily-used blocks (polished/cracked blackstone bricks,
  chiseled deepslate, iron bars, the pressure plate, the lit lamps) had no entry and fell through to
  the generic grey.
* `carveGroundFractures` originally assumed a crack is 1 wide; the widening step now tears sideways
  along the axis *perpendicular to the crack's own heading*, not a hard-coded one.

### State

`bun run check` green: **21 tests**, palette OK, **756 chunks / 2 386 subchunks**, generator
round-trip compared all 2 386 subchunks block by block, **26/26 inspection checks**,
`dist/Underworld-Simulator-Remastered.mcworld` **1.74 MB**, `docs/map-preview.jpg` regenerated
(184 749 B). The new test `the plate is torn: cracks open onto the void, the rim sheds, and detail
reaches the edge` pins all three fixes - 45 through-crack mouths (> 20), 1 200+ hanging rim columns
(> 500) and > 5 % detail on the outer band - so none of them can silently regress.

## The west actually darkens now

Canon: *"The sky and void grow increasingly darker as the proximity to the end shortens."* The
palette had a `darkness(x)` ramp, and the README described "the far west is the darkest rock ... the
darker-toward-the-End gradient" - but the ramp was `(-215 - x) / 40`, so it only became non-zero
**past x = -215**. Every western landmark sits *east* of that: the void castles at ~-90, the Citadel
and the Tomb at ~-158, the Portal Lobby at ~-158, the Citadel footprint ending at -189. The gradient
therefore only ever tinted the last ~40 blocks of empty rim beyond everything, and the entire built
west was exactly as light as the east.

`darkness()` now ramps from **`darkEdgeStartX = -58`** (just west of the Center, so the change is
visible by the time the player reaches the gulf) to **`darkEdgeX = -218`** (past the Citadel), and it
is exported so `ruinMasonry` in `decorate.ts` can use it too. The ruins no longer flip black at a
hard `x < -60` line: a ruin is as likely to be black stone as the ground beneath it is dark, so the
material change reads as a gradient rather than a seam.

Measured on the finished ground: black rock (blackstone, polished blackstone, basalt, crying
obsidian, black concrete) rises from **~17 % of surface columns east of the Center, through ~27 %
around the Citadel, to ~43 % in the far-west band** beyond it - more than double, and now unmissable
on the map preview and in game. The new test `the west darkens toward the End` samples two bands
clear of every landmark and holds both figures, because the previous values passed silently.

The all-block mix is deliberately unchanged in the README's headline numbers (deepslate 51 %, tuff
21 %): the recolour only touches the 1-4 surface blocks of each column (~164 k of 4.06 M blocks), so
it changes what the player sees without disturbing the plate's bulk.

### State

`bun run check` green: **22 tests** (160 expectations), palette OK, 2 386 subchunks round-trip,
**26/26 inspection checks**, `dist/Underworld-Simulator-Remastered.mcworld` 1.75 MB,
`docs/map-preview.jpg` regenerated (188 616 B).

---

## The last two format gaps are closed

Both remaining items in `docs/IOS-1.26-FINDINGS.md` are done; the detail lives there. In short:

* **Data3D** was writing **25** biome storages where the Overworld has **24** (384 blocks / 16). The
  rest of the layout was already right for a single-biome chunk, which is why the payload was ~637
  bytes; the real encoding is 632 bytes for this world (512-byte heightmap + 24 x `0x01` + i32).
  The phone sample's ~5252 bytes were not a different structure — they were nine subchunks carrying
  two biomes each and fifteen `0xFF` "no data" markers. The serializer now implements the whole
  spec (uniform, palettized and empty storages) and a decoder, so the payload can be checked
  instead of assumed.
* **Chunk metadata** (0x3F `MetaDataHash`, 0x40 `BlendingData`, 0x41 `ActorDigestVersion`) is now
  written on every chunk, together with the `LevelChunkMetaDataDictionary` record the hash points
  into. The hash is xxHash64 (seed 0) over the metadata NBT in the game's network order with its
  keys sorted — the recipe Prismarine-Anchor reverse-engineered, whose parser validates it against
  real worlds. `BlendingData` is `[0, 8]` (not a blending source) and `ActorDigestVersion` is `0`
  (the only format Bedrock has shipped). Legacy `Data2D`, which a native 1.18+ chunk does not have,
  is no longer written.

New `src/bedrock/data3d.test.ts` and `src/bedrock/chunk-metadata.test.ts` pin the byte layouts
(including a hand-written expectation for the network-order hash input and the published XXH64 test
vector), and both `mcbe-leveldb` parsers read the new payloads back.

### State

`bun run check` green: **37 tests** (260 expectations), palette OK, 2 454 subchunks round-trip,
**39/39 inspection checks**, Data3D 632 bytes on each of 1 024 chunks, one-entry metadata
dictionary, `dist/Underworld-Simulator-Remastered.mcworld` 1.84 MB.
Still unverified here: how it renders on a real iPhone.

---

## Palette: drop the Java state names on chorus_flower and respawn_anchor

The `palette` test started failing after the End Ruin pass added `chorus_flower` and
`respawn_anchor` to the palette: both carried **Java** state names Bedrock does not have (`age` on
chorus_flower, `charges` on respawn_anchor), and `validate-palette.ts` rejects any state key outside
its known Bedrock vocabulary. Both blocks are placed stateless now (src/world/blocks.ts); their
names are unchanged and they are still used by `end_ruin.ts`.

### State

`palette > every block state exists in Bedrock 1.26.51` passes and `bun run validate` prints
`palette OK` (152 entries, 144 distinct names). `bun test` is **36 pass / 1 fail**; the remaining
failure is the unrelated `terrain > every landmark actually builds something` signature mismatch
from the in-progress areas_a/areas_b restructuring.

---

## Purgatory: merging a second map into the same Overworld (2026-09-26)

The user supplied their **Purgatory Simulator** world (a Bedrock 1.26 export, originally
`Purgatory Simulator (1).mcworld`) and asked for it to become the *next physical region*
continuing from the Underworld - OVERWORLD -> UNDERWORLD -> PURGATORY, one world, no separate
dimension, no teleport, existing terrain intact.

### Why it needed new plumbing

* The source `.ldb` tables use a LevelDB the repo could not read: `classic-level` fails on them
  with `Corruption: bad block type` because Bedrock's LevelDB fork labels raw-deflate blocks as
  compression `4`. `src/bedrock/leveldb-reader.ts` now decodes the table format directly
  (footer -> index -> data blocks), strips the 8-byte internal key suffix (sequence + value type)
  and resolves newer writes by sequence number.
* The reference `mcbe-leveldb` parser is far too slow to read a whole world (protodef), so
  `src/bedrock/nbt-le-reader.ts` and `src/bedrock/subchunk-reader.ts` read palette/indices
  directly.

### The merge

* Source region: chunks `cx 0..33`, `cz -3..34`, solid `y 26..273` (a 250-block-tall build).
* `src/world/purgatory.ts` reads it from the vendored `assets/purgatory/db`, translates every
  block by a multiple-of-16 offset (`x -896`, `z -256`, `y +16`), substitutes gravity blocks via
  `stabilize`, and re-serializes each subchunk unchanged otherwise. Because the vertical offset is
  chunk-aligned, blocks never need re-packing.
* `src/build.ts` writes those subchunks plus their `Data3D`/metadata into the same LevelDB, west of
  the realm (`cx -56..-23`, `cz -19..18`), so the Underworld generator is untouched.
* `src/world/purgatory_approach.ts` builds the physical bridge: for every z-row in Purgatory's
  footprint it fills the void from the realm edge eastward to the island's west coast, ramping
  from Purgatory's floor (y 42) up to the coast height so the seam is a walkable slope. It only
  ever writes columns `isLand` reports as void, so no Underworld terrain is changed.
* `src/tools/inspect-world.ts` learned to accept subchunks up to index 19 and to skip the
  transplanted region in the generator round-trip / Data3D scene comparison (it is not regenerated
  locally, so it is compared against its source instead).

### Also this pass

More glass-eye buildings and stained glass, as requested: the Glassworks grew a six-spire
colonnade plus two more floor oculi and stained-glass lancets flanking both rose windows; the End
Ruin gained three more glass-eye spires and two plaza oculi.

### Result

One Bedrock Overworld: normal Underworld terrain, then the bridge, then Purgatory. Build writes
**3 126 chunks** (1 936 realm + 1 190 Purgatory), 16 623 subchunks, `dist` ~8.2 MB. `bun run check`
green: **37 tests**, palette OK, **39/39 inspection checks**, 4 949 realm subchunks round-trip and
11 689 transplanted subchunks parsed/decoded clean. Still unverified here: on-device rendering.

---

## The Sunken City and the Warden's Deep Dark (2026-09-27)

Two landmarks built in the void ring east of the realm, filling the leftover air the request
described ("theres a lot of left over air blocks on the side"). The realm's void is 141 732
columns and sits almost entirely in the corner tiles; the north-east one is fully void and clear
of the Glassworks at (188, 226).

* **The Sunken City** (280, 290) - an Ancient City grown on a broken deepslate plate: a spine
  corridor, three halls with chiseled door frames and corner pillars, polished-deepslate accent
  courses, sculk creeping in from the hall corners, and a single bridge back to the realm so it
  is walkable rather than an orphan island.
* **The Warden's Deep Dark** (214, 208) - a lit ring walk around a parabolic sculk bowl, buttressed
  and lit with sea-lantern posts, with a switchback stair down to a floor of spreading sculk, ten
  half-buried sculk sensors on the slope and a shrieker at the centre.

### What this pass deliberately did NOT build

The same request asked for mobs: a green Soul Keeper wandering trader with custom trades, skeletons
with enchanted flame bows and Protection IV netherite, zombies with Sharpness/Fire Aspect, blazes
firing wither skulls, and a spawning warden. **None of that is world data.** Those are entities
with behaviour, attributes, equipment, trade tables and spawn rules - a behaviour pack plus a
resource pack. This project is scoped map-only ("no bots or NPCs, no combat systems, no kits, no
extra gameplay mechanics and no addons") and `src/build.ts` writes `world_behavior_packs.json` as
`[]`, so there is no pack layer to extend. Building it would mean adding packs to the
`.mcworld` and changing the project's stated scope, which is a decision for the maintainer, not a
quiet extension of a map generator.

What *was* built is the **place** those mobs would occupy - the arena, the pit, the city - as
geometry. The shrieker is placed with `can_summon: false` (already how `P.sculkShrieker` is defined)
so opening the world cannot spawn a Warden before the player walks in; a world that spawns a boss
on load is hostile.

### Two bugs worth recording

* **The audit caught a hollow landmark.** `wardenPit` was being called with the *city's* centre, so
  the arena's own footprint contained no pit at all - a ring walk and a stair around nothing. The
  landmark audit reported `sculk_shrieker: 0` inside the arena, which is what surfaced it. The pit
  now sinks in the arena itself.
* **`sculkPatch` laid sculk at a fixed y.** In a parabolic bowl that buries the growth under the
  slope everywhere except the deepest few columns, so 477 blocks existed but almost none were
  visible. It now writes to each column's own `surfaceAt`. The test asserts on *visible* surface
  sculk specifically so this cannot regress into being buried again.

### Result

Two new landmarks, **22 total**. `bun run check` green: **47 tests** (3 new), palette OK (172
entries), **39/39 inspection checks**, 5 374 realm subchunks round-tripped block by block.
`dist` ~8.74 MB. Probed the written `.mcworld` directly: 1762 chiseled_deepslate, 1026
cracked_deepslate_bricks, 144 sculk, 46 sculk_vein, 25 sculk_catalyst, 14 sculk_sensor,
2 sculk_shrieker, across 27 chunks in the city's footprint.

---

## Soul Keepers: the mob pack (2026-09-27)

The mob half of the previous request, delivered as an actual pack pair under
`packs/` rather than folded into the map generator. Two UUID-linked packs:

* `packs/soul-keepers-bp` - data + script behaviour pack
* `packs/soul-keepers-rp` - resource pack

Mobs, all on the `soulkeepers:` namespace (**new** identifiers, deliberately not
overriding vanilla - replacing `minecraft:zombie` in a BP substitutes the whole
entity and breaks the mob if any component is missing):

| identifier | behaviour |
| --- | --- |
| `soul_keeper_trader` | trade table: gold, gold blocks, netherite scrap, netherite ingot, Keeper blade/helm; half damage from players |
| `soul_keeper_skeleton` | archer - Flame + Infinity bow, Protection IV netherite |
| `soul_keeper_zombie` | bruiser - Sharpness V + Fire Aspect II sword, Protection IV netherite |
| `ashen_blaze` | fires the `wither_skull` projectile |
| `wither_skull` | projectile: impact damage + wither on hit, not spawnable |

### Why the enchantments are in a script

There is no declarative way to say "equip this, enchanted with that" in a Bedrock
entity file. `minecraft:equipment` places items; enchantments live on item NBT and
only the Script API can set them at spawn. So behaviour/health/AI/loot stay in
JSON (`entities/*.json`) and `scripts/keeper_gear.js` applies the gear in an
`entitySpawn` handler. Two of my own bugs lived here first: an invented
`minecraft:custom_components` key, and an invented `addEntityLoad` API. Both
were removed rather than left to fail at runtime.

### `bun run validate:pack`

New tool (`src/tools/validate-pack.ts`). JSON that parses is not JSON Bedrock
accepts, so it checks: every file parses, identifiers are lowercase
colon-namespaced and in an expected namespace, manifests carry the right module
type, and **every `minecraft:` string anywhere in the pack resolves in the real
1.26.51 dataset**. That last check is deliberately broad rather than
key-specific - the key-specific version *missed* `minecraft:dark`, which is the
exact Java-only block that bit the map generator.

The validator is itself negative-tested: fed a bad identifier and a
`minecraft:dark` reference, it fails on both. A validator that only ever passes
proves nothing. It currently flags one real thing as a known event
(`minecraft:wither_on_hit`, a projectile event not an item), which is whitelisted
explicitly rather than by weakening the check.

### What is NOT done - the pack has never been loaded in Minecraft

There is no client in this environment, so none of the following is verified:

1. **No textures ship.** The RP references five entity textures and two item
   textures that do not exist as PNGs. Mobs will show the missing-texture
   pattern. **The green-infected / dark-Soul-Keeper-cloak look is therefore not
   present** - it needs 64x64 skins dropped into
   `packs/soul-keepers-rp/textures/entity/`.
2. **The Ashen Blaze's `behavior.shoot` is not bound to `soulkeepers:wither_skull`**
   yet, so it will most likely fire default shots.
3. **The trader trade UI on a custom entity** is the most likely thing to need
   adjusting; some builds expect trades in a separate `trade_tables/` file.

All three are written up in `packs/README.md` rather than left for the user to
discover by testing.

---

## Fixing the Warden's arena: it was bricked in (2026-09-27)

Reported as "I can't tell where it is". It turned out to be two separate bugs,
both of which had to be found by reading the *written* world rather than the
generator.

### Bug 1 - the arena was sited on top of the Glassworks

`wardenArena` was at (214,208), footprint x 190..238, z 188..228. The Glassworks
footprint is x 150..226, z 188..264. They overlapped by **1 517 columns**, and
the Glassworks is built later, so its floor went down over the pit. Re-sited to
**(-300,300)**, which is fully void, in-realm, and clear of every footprint.

### Bug 2 - the pit was never actually carved (the real one)

Re-siting did not fix it. `wardenPit` fills rock from y=3 up to the bowl floor
and records that floor in the surface map - but it **never cleared the space
above its own floor**. `plate()` runs first and fills the whole footprint solid
from y=3 to the arena level, so the result was 27 blocks of deepslate sitting on
top of a pit whose surface map said the floor was at y18. The generator's own
`surfaceAt` returned 18, so every in-memory check passed; the player walked over
a flat plate.

Fixed by carving explicitly in the same loop:

```ts
for (let yy = 3; yy <= y; yy++) world.set(x, yy, z, P.deepslate);
world.set(x, y, z, t < 0.35 ? P.sculk : P.cobbledDeepslate);
for (let yy = y + 1; yy <= rimY + 2; yy++) world.set(x, yy, z, AIR);   // <- was missing
```

### Three wrong tests before one right test

The instinct was to assert on the footprint rectangles not overlapping. That is
the wrong invariant: footprints are padded bounds and eight pairs have always
legitimately touched (breach/frostPocket, mazeValley/village, fields/splice...).
Rewriting it as "centre is buried" flagged the Splice, which is *correctly*
flat-topped. Rewriting it as "there is an interior" flagged the maze, the
village and the tomb, which are correctly open to the sky. All three were
guesses; the real invariant had not been identified yet.

The right check is in `src/tools/inspect-world.ts` and it reads the bytes that
were actually written: **is the landmark's own signature material still there,
and does it have headroom?** It took three attempts to get the exposure test
right, each caught by a negative test:

1. Counting the material present passed with the pit bricked in - presence is
   not the invariant, reachability is.
2. "Is the next block air" passed, because the bricked pit had a 1-block air gap
   at y19 before the rock resumed at y20. A shrieker you cannot stand in front
   of is not reachable.
3. **Headroom >= 2 blocks** is the version that discriminates.

Each version was proven by re-introducing the bug and confirming the check went
red (`wardenArena:0/1 exposed`, "sealed by a later build"), then confirming it
went green on the fix. A check that has never been seen to fail is not a check.

`bun run inspect` is now **40 checks**, up from 39.

### Result

Arena at **(-300,300)**: /tp -300 20 300 - the ring walk is at y46 and the
sculk pit floor at y18, a 28-block descent. Sunken City at (280,290):
/tp 280 14 290, floor at y12. Both shrieker/sculk confirmed exposed in the
written file.

## Giving Grok's helpers a job: the split tables

Six helpers arrived on `main` with **no call sites at all** - `splitTable`,
`brokenSplitTable`, `glassSplitTable`, `portalRibbon`, `voidWindow` and
`portalPillar`, all in `structures.ts`. The code was correct and typechecked; it
was simply invisible, because a function nobody calls puts no blocks in the
world. The `.mcworld` had changed by 166 bytes, which was build noise, not
geometry. Worth being blunt about: the screenshot that prompted this was the
Splice, which had been in the world for some time and was not from these
commits at all.

Two homes, chosen on canon rather than on convenience:

**The Splice** gets the split tables. Its own description is "a crafting table
spliced into an enchanting table, both set in end-portal frames", so a bench
that runs crafting table | nether portal | enchanting table into one another is
literally the reference machine. Five rows of two, either side of the aisle, so
the hall is a workshop you walk through rather than a corridor with props in it.

The ordering matters and was the one real trap. The Splice's `creepy fill` pass
writes to the **surface column** of anything that looks unprotected, and a
split table's bench sits exactly on that column. Built alongside the other
machines, the fill drops warped growth and glass chips straight through the
benches. They go in *after* the fill, immediately before the closing
`world.protect`.

**The Portal Field** gets the seam and the stumps: two full-width portal
ribbons north and south of the gate grid, a short abandoned spur off the north
one, four sheared-off `portalPillar` stumps on the grid's own diagonals, two
`voidWindow` frames on the field's edge, and three split tables along the west
edge - one still standing, two ruined - for whatever was meant to cut the
portals in the first place.

The field is inside a `pad()`, so the whole footprint is already protected and
neither the detail pass nor the path painter can touch any of it.

### A finding from the first test run

The initial row mix was computed as `Math.abs(row * 7 + side) % 3`, which
handed **four of the five rows** to `brokenSplitTable`. That variant only places
a crafting table about 55% of the time, so the bench count came back 7 where 10
was expected. The arithmetic was doing what it was told; the design was wrong.
Half the hall's signature machine lying ruined reads as a scrapyard, not a
workshop, so the mix is now fixed and explicit: six whole, two glazed, two
failed. The test caught it because the threshold was written down first.

### Verification

Two tests in `src/world/world.test.ts`, both asserting the geometry is in the
**generated world** rather than merely in the helper - the same distinction that
made the arena bug visible. The Splice test counts portal slices (exactly 10;
every variant keeps its portal, which is the part that makes it a splice rather
than two tables standing near each other) and benches (at least 8; the ruined
rows carry a crafting table only some of the time). The field test checks both
ribbons run the full 60-plus blocks of the field's width, the west stumps still
have their deepslate, and both windows are still glazed - a stub instead of a
line is what a path painter crossing the seam would leave.

The Splice test was negative-tested by dropping a row: it goes red at 6 of 10.
A check never seen to fail is not a check.

Full gate: typecheck clean, **51/51 tests**, palette OK, `world OK (40 checks)`.
Signature exposure confirms the geometry in the written file rather than in the
generator: `splice` 0/5 -> **10/15**, `portalField` 35/53 -> **36/54**, and
`wardenArena` still **1/1**.

## The sky canopy: the glass goes everywhere

The reference's defining image is sheets of coloured glass stacked in the sky
with moss along every rim. It lived in exactly one place - the Cathedral hung a
five-sheet cluster over its own footprint. That is right for a landmark and
wrong for a *sky*: you walked out of the arch and the ceiling stopped at the
edge of the building.

`src/world/sky_canopy.ts` scatters **27 overlapping sheets** across the realm at
mixed heights, denser over the built-up plate and thinner out east, with the
western dark getting a lower, sparser, colder set because that end is supposed
to be closing down.

### Why sheets and not a lid

A single translucent sheet across 704x704 is 495k columns of glass and would
have cost more than the entire rest of the world. Every sheet here is a bounded
disc, they overlap, and **the holes are load-bearing**: the parallax between
layers is the image. You can look up through a gap and see teal, and that is
what stops it reading as a ceiling. Measured coverage is **84.7%** of the plate
- deliberately short of 1.0, and the test fails both above 0.8 and above 0.99 so
it can never quietly become a lid.

### The band is only 24 blocks

The ceiling is y=127 and the tallest thing in the realm is a 34-block glass tree
on a surface that reaches y=91, which puts the legal band at y100..y124.

**The first draft of the sheet table had 16 of 19 sheets over-tall.** A
five-layer stack at gap 5 needs 25 blocks and the band has 24. `glassSky` clamps
an overflowing stack rather than throwing, so this fails *silently* - no error,
no warning, just a fifth of the sky quietly missing. It was only caught because
the test asserts `y + layers * layerGap <= 124` over the sheet table itself
rather than trusting the builder. Verified by re-introducing a five-layer sheet
and confirming the check goes red.

Two other failures in the same run were my arithmetic, not the test's fault:

- The first row-mix-style coverage number came out at 0.717, below the 0.8
  floor. The sheets were too small and too few to overlap across the whole
  plate; the list grew from 19 to 27 and the radii were re-spread.
- A "no glass outside the band" assertion failed with 902 blocks. Those are at
  **y48-y99** and belong to the landmarks' own glass - the Cathedral's sky, the
  Glass Grove's trees, the Splice's floor - not to the canopy. Sweeping every
  stained-glass block in the world into the canopy's budget was simply the
  wrong assertion, so it was replaced with one that checks a representative
  sheet kept every layer it was asked for.

### The dangerous one: protecting the ground

`glassSky` protects the columns under a sheet so the detail pass cannot reach
into a building. Over a canopy drifting above open ground that would switch off
**ruins, ground fractures and detail scatter across most of the plate** - gutting
the whole wasteland to hang a sky 60 blocks up. `protectGround: false` is
load-bearing, and the test asserts the *pairing* rather than a raw count: 963
sampled columns are under the canopy **and still unprotected**. The 777 that are
protected are protected by the landmark underneath them, which is correct.

### Cost

858k stained-glass blocks, but only **1.7% of the world's blocks** and
**+943 KB (+11%)** on the file: glass is highly compressible, and only 1197 of
1936 chunks are touched. Against a realm whose whole premise is loading on a
phone, that is affordable - but it is not free, and it is the reason the canopy
is 27 sheets and not a continuous sheet.

Full gate: typecheck clean, **54/54 tests**, palette OK, `world OK (40 checks)`.

---

## The city was too much deepslate, the sky was too high, and the Purgatory was unlit

Three complaints from a playthrough on a phone at the lowest render distance.
One of them turned out to be about a building this repo did not generate at
all, and finding it is most of the work.

### 1. The sky was 8 blocks too high

The canopy band was `y=100..y124`, chosen to clear every landmark. It was
wrong for the device it is played on: at minimum render distance a ceiling
eight blocks further up is the first thing past the far end of the view, so
the sky read as "hard to see" exactly where it was meant to be pretty.

The band is now **`y=92..y116`** - one block above the highest ground in the
realm (y=91). The cost is that sheets now drift through the crowns of the
glass trees and the Glassworks spires, which is what the reference does
anyway: a sheet passing behind a spire is what parallax looks like.

`glassSky` had `const ceiling = 124` hardcoded, which would have silently
clamped the canopy to a ceiling it does not use. It is now an option, and the
canopy passes its own. **The band still has to be 24 blocks**, so the sheet
table's arithmetic is unchanged - only every `y` moved down by 8. The existing
`skyCanopyFitsTheBand` test caught the class of bug this invites, and a new one
pins the band low so it cannot drift back up.

### 2. The Sunken City: 92x80 blocks of deepslate facing the player

"Can we change it to the stained glass design but keep the Warden stuff."

The honest reading of the first pass was that it was not a palette problem. The
city was *correct* - deepslate is what an Ancient City is made of - and the
problem was that 92x80 blocks of it were **facing outward**: a 44-block wall on
all four sides, and a bare cobble plaza on top. So the fix stops facing the
world with rock rather than deleting the rock:

- **`glazePlateRim`** - the plate's outer face becomes a stained-glass
  foundation: a cornice, a plinth, a deepslate mullion every fourth block and
  sea-lanterns every twelfth. This is the single highest-value change; it is
  the thing you actually see from the void ring.
- **`glazePlaza`** - the plate top is inlaid with diagonal glass courses
  through the cobble, stopping exactly at the bowl's lip, with a green ring
  (canon Soul Keeper green) one block out from it.
- **Halls** - glazed vault instead of a solid roof, a glazed band over a
  deepslate dado, a floor inlay panel, two prism pillars, and a glass **eye
  window** in the end wall the doorways do not use, with a mosaic frieze over
  it.
- **Spine corridor** - glazed vault and a glazed top course with sea lanterns
  every eighth bay, so the 80-block avenue is lit along its whole length.

What did **not** change is the Warden. The pit, the bowl, the sculk, the
shrieker, the sensors and the catalyst rim are exactly as dark as they were.
That is the whole reason the glass reads as bright, and it is asserted two ways:
no glazing inside the bowl, and the sculk/catalyst/shrieker still present.

Two real bugs the tests caught while writing this:

- The bowl test counted the **bounding square**, not the bowl. The 119 glass
  blocks it found were in the four corners of that square, which are plaza and
  are supposed to be glazed. A bowl is a disc.
- `wardenPit` in the Sunken City clears to `rimY + 2 = 40`, but the plate top
  is 44 - so the city's pit has been **roofed by four blocks of rock**
  (y41..44) since it was written. The surface map says the floor is at y12; in
  game there is a plaza on top of it and no way down. Pre-existing, not caused
  by the glazing, and **left as-is on purpose**: opening it without a proper
  descent turns a landmark into a 32-block death trap, and the arena's stair
  does not transplant. Worth doing properly, as its own change.

### 3. "The prison" is the Purgatory, and it is a seven-storey tower

There is no structure called a prison anywhere in this repo, so the first move
was to probe the vendored Purgatory source (`assets/purgatory/db`) and look.

**The first detector was wrong, and wrong in an instructive way.** It looked
for a solid block *above* a column's topmost block, which only finds overhangs
and ledges. It reported "0 roofed columns" for a world that is almost entirely
rooms. From above, a roofed room and a solid wall are the same thing - the top
block is the roof. The test that actually identifies an interior is an **air
run with solid below it and solid above it**.

With that fixed, a single column says the whole story. At source `x=60, z=28`:

```
y43..53   deepslate_tiles     <- floor
y54..63   air                 <- storey
y64..64   deepslate_brick_slab
y65..65   blackstone
y66..76   air                 <- storey
y77..77   tuff_bricks
y78..88   deepslate_tiles     <- floor
   ... repeating every 35 blocks, seven storeys, to y=271
```

It is a **230-block tower with no light in it**. Transplanted verbatim, "inside
the prison" is a place you cannot see in - which is exactly what was reported.

So the transplant is no longer quite verbatim. `planPurgatoryLighting` walks
the source once, builds a bit per Y per column, and hangs a lamp flat under the
ceiling of every enclosed air volume that has no light source in it. It is
narrow on purpose:

- only **enclosed** air is touched - no landscape silhouette moves and nothing
  outdoors changes;
- a room that already has a light in it is **left completely alone**, so any
  lighting in the source build stays the author's;
- it runs in source coordinates before the offset and writes nothing outside
  the region the transplant already owns. **Nothing else in the Underworld is
  in scope.**

**20,304 lamps** in the final build. One lamp per 8x8 of floor, on a global
grid so neighbouring columns line up instead of forming a diagonal weave, and
one in four is a sea lantern rather than glowstone.

The planner is a pure per-column function (`planColumn`) specifically so it can
be tested against synthetic columns - the 300,000-column walk is ~40 seconds
and the failure modes that matter (a lamp buried in rock, a lamp dropped into a
room that already has a torch) are invisible in a build log. Six tests, four of
them negative.

### Full gate

typecheck clean, **67/67 tests** (54 + 6 lighting + 7 new city/canopy),
palette OK, `world OK (40 checks)`. Artifact **9,766,459 bytes** (was
9,719,254): +47 KB for the city glazing and 20k lamps.

---

## The mob backlog: the Soul Keepers pack, and why nothing in it worked

The map half of the mob request shipped long ago. The addon half had been
written, never loaded, and — as it turned out — could not have worked. This
session went through it mob by mob.

### The pack was full of components that do not exist

`minecraft:behavior.shoot` appears **zero times** in the Bedrock entity JSON
schema. It is not a component, in any version. Both the archer and the Ashen
Blaze were built on it, which means neither of them ever shot anything — and
nothing about that is visible from the file. The pack parses, the pack
validates, the mob spawns, it just does not do its one job.

A real mob fires through the `minecraft:shooter` **component**, which the
`minecraft:behavior.ranged_attack` goal then reads to learn what to fire. The
`ranged_attack` schema is also strict (`additionalProperties: false`) and its
property names are not the intuitive ones: `burst_shots` and `burst_interval`,
`attack_radius`, `charge_shoot_trigger` — no `range`, no `pull_duration`, both
of which the pack had been using.

The audit turned up more of the same:

| What | Reality |
| --- | --- |
| `minecraft:trade_table.table_id`, `.new_trades` | Neither exists. There is no inline trade list; `table` is a **path** to a trade table file. |
| `minecraft:interact` with `interact_text`/`use_item`/`interact_event` | All three belong inside an entry in `interactions`. On the component they are dropped, which left the trader with **no way to be interacted with at all**. |
| `behavior.look_at_player.look_frequency` | Not a property. It is `look_time`. |
| `behavior.melee_attack.can_leap` | Not a property. |
| `equipment.reset_on_spawn` | Not a property; only `table` and `slot_drop_chance` are. |
| `behavior.walk_in_water`, `behavior.jump_avoiding_block` | Not components. |
| `minecraft:repairable` | Takes a `repair_items` array of `{ items, repair_amount }`, not a map of item id to `{ durability, repair_cost }`. |
| `minecraft:equipment.table` | Pointed at `equipment/keeper_skeleton.json` and `equipment/keeper_zombie.json`, **which were never written**. |
| the trader's cloak | The client entity declared a second geometry, material and texture that its single render controller never bound — so the Keepers' eye on its back was never drawn. |
| both item icons | Pointed at texture keys that were not in `textures/item_texture.json`, which did not exist. |
| the wither skull | Had a behaviour-pack entity and **no resource-pack one at all**. |

Every one of these is invisible to a type checker, invisible to `JSON.parse`, and
invisible in game except as a mob that quietly does nothing.

### Textures, at last

The pack shipped **no PNGs at all**, which is the reason the "green infected,
dark Soul Keeper cloak" look did not exist — the mobs were pink-and-black
checkers. There was no PNG encoder in the project (`jpeg-js` cannot write one),
so there is now `src/bedrock/png.ts`: 8-bit RGBA, dependency-free, round-trip
tested. A generated texture that silently writes a corrupt PNG is worse than one
that writes nothing, because the corruption only shows up in the game.

`src/tools/make-pack-textures.ts` paints nine textures. The humanoid UV layouts
are written once in `paintBox` rather than hand-tabulated per body part, because
a mis-set UV offset does not error — it just produces a mob with its face on its
chest. Verified by decoding the output and reading it back as ASCII: head top
and bottom at y0–7, the four head faces at y8–15, body front at x20–27 y20–31,
exactly where `geometry.humanoid` expects them.

### The validator now catches the class, not just the instance

`validate:pack` previously checked that files parse, identifiers are legal, and
`minecraft:` references exist in 1.26.51. None of that would have caught a single
bug above. It now also checks that every `textures/...` path is a PNG that ships,
every item icon is registered, every loot/equipment/trade table a component
points at exists, every render controller / animation / geometry / material /
texture an entity names exists, every `soulkeepers:` reference resolves, and the
shipped textures still match the generator.

The one worth calling out is the **reverse** direction: every geometry, material
and texture an entity *declares* must be bound by one of its render controllers.
That is precisely the cloak bug, and a check that only runs controllers→entity
walks straight past it.

All five new checks were negative-tested by breaking the pack on purpose
(deleted a texture, unregistered an icon, pointed the trade table at a missing
file, dropped the cloak controller, flipped one byte of a PNG) and confirming
each one fails. `validate:pack` now also runs inside `bun test`
(`src/tools/pack.test.ts`), so a pack regression fails the normal suite.

### Two deliberate compromises, both documented in the README

- **The Ashen Blaze uses the humanoid rig.** Its texture is painted on
  `geometry.humanoid`'s UVs, and a hand-written `.geo.json` cannot be validated
  from here — a geometry the game rejects means an invisible mob. Swapping later
  is a one-line change plus a geometry file.
- **The wither skulls need the Custom Projectiles experimental toggle**, which a
  pack imported on a phone is exactly the situation where is *not* on. The blaze
  has a melee fallback for that reason: without the toggle it is still a threat,
  it just does not throw skulls.

**Still not verified in game** — there is no client in this environment, so
"valid against the schema" is the strongest claim available. The trade screen in
particular is the most likely thing to still need adjusting.

Full gate: typecheck clean, **74/74 tests**, palette OK, `world OK (40 checks)`,
`pack OK`.

---

## Making the pack downloadable: `.mcpack` archives, and a world that asks for them

A download link for a pack is 38 separate files. That is fine for git and
useless on a phone, and Bedrock's "Import Packs from File" takes exactly one
file per pack — so the thing that actually gets tested has to be an archive.

`src/tools/pack-mcpack.ts` produces `dist/soul-keepers-rp.mcpack` and
`dist/soul-keepers-bp.mcpack`. Two details are easy to get wrong and produce an
archive that unpacks but does not import:

- **`manifest.json` must be at the root of the zip.** Zipping the folder gives
  `soul-keepers-bp/manifest.json`, which Bedrock opens as a folder with no
  manifest and silently ignores. The tool throws if that happens, and a test
  reads the zip's central directory directly rather than trusting the tool.
- The BP must declare a dependency on the RP's UUID or it imports fine and then
  refuses to enable. The tool asserts it.

### The world now asks for the packs by name

`world_behavior_packs.json` was `"[]"`, which is what a vanilla phone export
writes and what this build has always written. It imports perfectly and gives
you a world with no mobs in it and nothing on screen to explain why.

It now carries the pack UUIDs, read from the manifests rather than typed in, so
that importing the two `.mcpack` files into the profile once is enough and the
mobs are simply there when the world opens. A linked behaviour/resource pair is
a **single** entry with the resource pack under `dependencies` — that is how
Bedrock records "these two travel together".

This is a real change to the artifact and it is the one part of this that
cannot be verified from here: it depends on how a phone resolves a pack id it
has imported. If the mobs do not appear, the fallback is two taps in the
world's Settings → Packs, and the UUIDs are asserted against the manifests by a
test so they cannot drift apart.

Full gate: typecheck clean, **76/76 tests**, palette OK, `world OK (40 checks)`,
both `.mcpack` archives built and verified.

---

## Colour beacons, a pale castle, a green portal court, and a glazed arena

Four requests in one turn, from ten screenshots.

### 1. A colour beacon over every landmark

> "every land mark, make a colour beacon give each one it's own colour, so i can
> see it in the sky. I think that be prettt cool"

New `src/world/beacons.ts`. Every landmark gets a banded stained-glass mast that
rises out of the top of its own building and punches up through the canopy to a
lantern crown at y123. Three decisions, none of them obvious:

- **It runs *after* the canopy.** `buildSkyCanopy` is documented as the last word
  in the sky over the landmarks, and that is still true — but a mast drawn
  before it would have a sheet of glass land on top of it, which is precisely
  the failure the request is about. So `buildAllAreas` calls the canopy and then
  the beacons, and a beacon is allowed to cut a hole through a sheet.
- **Sixteen glasses, twenty-three landmarks.** "Each one its own colour" cannot
  be satisfied by hue alone, so each beacon is a `main` with an `accent` band
  and every *pair* is unique. `BEACON_COLOURS` is hand-assigned (for the same
  reason the canopy sheets are) and a test asserts no two landmarks share a pair.
- **The crown clears the canopy.** `CANOPY_BAND.ceiling` is 116; the crown sits
  at 121-123. A crown at or below the sheets is a mast you can only see through
  glass, which is the state the world was in before this existed.

**The bug worth writing down.** The mast is anchored to the landmark's own
structure, found by scanning *down* the centre column. The first version scanned
from y92 — the canopy's floor — and every single mast in the world came out
anchored at y91, because `glassSky` hangs green fronds two to eight blocks below
every sheet and glass therefore reaches down to y84. A frond was found in all
twenty-three landmark columns at once. It is invisible in a build log, it still
leaves glass at the column so a "is there glass here" check passes, and the fix
is a scan ceiling of 83 with a test that asserts `baseY < CANOPY_BAND.floor`.

### 2. The Warden arena: keep the Warden, glaze the deepslate

> "u can keep the warden stuff but change the deep slate with the glass we been
> using"

The arena now gets the same three passes the Sunken City got: `glazePlateRim` on
the outward face, `glazePlaza` on the top, and a new `glazeRingWalk` on the walk
around the lip — a dark pier every fourth block, glazing between, a chiseled
kerb and catalyst line on the inside edge, green glass on the outside. The
buttresses are glazed piers still capped with a catalyst.

`wardenPit` is untouched. `wardenPit(world, cx, cz, level - 2, 91)` is the same
call it always was, and a test asserts **zero** glass inside the bowl while
sculk, the catalyst rim and the disarmed shrieker are all still there. Bright
glass only reads as bright next to something that stayed dark.

Two things had to move for the ring walk to work at all:

- **Order.** `wardenPit` clears every column inside its radius up to the rim, so
  a walk drawn first is a walk with its inner two courses deleted. The pit is now
  sunk *before* the walk.
- **Size.** The walk is radius 22 and the old footprint was 48 × 40, so its north
  and south arcs were written out over the void with nothing under them — the
  arena had a rail floating in mid-air on two sides. The plate and the footprint
  are now 50 × 50 (`-325, 275 → -275, 325`) and the walk runs 22 → 25. A test
  asserts every course of the walk is on land at plaza level.

The switchback stair down into the bowl deliberately stays bare polished
deepslate. Everything *around* the bowl is glazing now and the one thing that
must not be is the way down: a lit balustrade leading to the bottom would take
away the last twenty unlit blocks, which are the entire point of the arena.

### 3. The Veil Castle

> "I have a photo of the castle I want, I sent a picture of where I want it"

The placement screenshot reads `Position: -179, 46, 133` and shows a broad paved
plaza, so the plaza *is* the forecourt and the castle runs east from it: causeway
`x -211..-199`, forecourt `-199..-179`, gatehouse at `-181`, palace `-171..-131`.
New `src/world/veil_castle.ts`, and the first genuinely **pale** building in the
map — quartz and sandstone against a canon palette that is grey and black
everywhere else. 8 200-odd smooth quartz, 4 200 blue concrete, roundels in green
and lime glass in sandstone rings, and a purple carpet that runs unbroken for 55
blocks from the causeway through the gate and down the hall to the dais.

The drum and dome are taken up to y104 on purpose: the canopy hangs at y92-116,
and a castle whose spires stop below the glass reads as a model of a castle.

Two composition bugs that only a test would have caught:

- The forecourt medallion was drawn **over** the carpet, cutting a 17-block hole
  in the middle of the approach. It is now an annulus drawn *before* the carpet,
  so the purple runs through the middle of the ring — which is what the reference
  does at every medallion on that bridge.
- `lobbyRoad` used to run along z = 133, straight down the causeway axis, so the
  landmark-path pass repaved the castle's own carpet in green glass. The road now
  stops short, south-west of both gates.

Twenty-three new palette entries (quartz, sandstone, the concretes) plus
`polished_andesite` and `polished_tuff` for the portal court. **Bedrock has no
`black_andesite` block** — the palette validator rejected the name outright, which
is exactly what it is for; the frame the screenshot calls "black andesite" is
`polished_andesite`.

### 4. The portal section, where the screenshot says it is

> "dont thought the nether portal section neee Theres i send another screen shot
> for reference"

The second screenshot reads `Position: -219, 45, 125` and shows a green
deepslate/tuff wall, a giant dark-oak door, a black andesite frame, gold ore in
the stone and the purple edge of an obsidian portal. So the lobby is **re-sited**
there — it used to be a blackstone plaza at `-158, 140`, which is now the
castle's forecourt — and re-faced to match: a walled green-stone court with the
twenty portal frames set *into* its long walls rather than standing loose on a
floor, a six-wide ten-tall dark-oak door with iron banding in a polished andesite
reveal, and a green-glass fanlight over the lintel.

The frames are spaced five apart down each wall. The first attempt put ten frames
at the same z — ten frames in the same hole — and the count of twenty was
satisfied by four. `portal` blocks went from 48 to 237.

### 5. The Purgatory office beacon

> "I sent a picture of the purgatory office, try to find that and put a beacon
> there too si I can find it easier"

The screenshot reads `Position: -623, 270, 23`, which is source-local
`(273, 254, 279)` after the transplant offsets. Probing the source DB found a
rotunda there: a 28-block polished-tuff floor at local y250, seating and desks
around the wall, a slab ceiling at y265, and a 40-wide black-glass dome over the
lot. The mast goes at the centre of the floor disc, `(274, 283)`.

It cannot be a `beacons.ts` mast. Purgatory is a 250-block tower and `World.set`
refuses anything past the realm's own y127, so the beacon is planned inside the
transplant in **source** coordinates — `planOfficeBeacon`, keyed exactly like the
lamp plan. It is the only plan allowed to *replace* a block rather than only fill
air, because it has to punch up through the storey floors above the office; a
lamp is always inside the same subchunk as its room, and so is a course of the
mast. It runs from the office floor at y251 to y282, which is the roof of the
island and the highest block anywhere in the source — the only thing on Purgatory
visible from the Underworld. Green and lime, the build's own palette; 32 courses.

`loadPurgatoryRegion` throws if the planned course count and the applied count
disagree, because a beacon that silently stops at a subchunk boundary is exactly
the kind of failure that reads as "the build passed".

Full gate: typecheck clean, **99/99 tests**, palette OK, `world OK (40 checks)`,
23/23 landmarks present and reachable, both `.mcpack` archives built and verified.

---

## Activated netherite beacons, the eyes, and the inside of the Veil Castle

Three follow-ups on the beacon/castle pass, all of them corrections rather than
additions.

### The beacons are switched on

"Colour beacon" was built as a lit *lookalike* — a glass cap with a glowstone on
top. The user meant an actual beacon, activated, in netherite. All 23 masts (and
the Purgatory office, which lives in `purgatory.ts`) now crown with a real
`minecraft:beacon` block stored as `{ power_level: 1, target: 0 }`, on two
courses of `minecraft:netherite_block`.

The collar is not decoration: **netherite is one of the five vanilla beacon base
materials**, so it is the block that makes the crown light, and because the state
is written into the subchunk the beam renders on load rather than waiting for a
player to feed the block metal. The mast's dark banding changed from obsidian to
netherite for the same reason — it is the part you read from the ground.

`BEACON_CROWN_Y` moved **123 → 121** and the glowstone flame on top was deleted.
An active beacon draws its beam from its own block upward, so anything sitting on
it cuts the beam off one block long — the first version was a perfectly good
light and a beam you could not see. `NEGATIVE: nothing stands on a crown, or the
beam is one block long` now fails if any of the 23 has a block above it.

`target: 0` and the crown's height mean nobody on the ground is in range of the
beacon's effect (crowns are at y121, the canopy tops out at y116), so the
beacons are there to be seen rather than to buff anyone.

### The eyes

The green medallions on the reference castle were built as **roundels** — discs
in a stone ring — and the user pointed out they are eyes. They are now almonds:
`1 - |u/w|^1.8` for the lid line, so the lids meet in a point at each corner, with
white sclera, a green/cyan iris, a black pupil and a **sea-lantern** catchlight
(a lit block, not a white one, so the eye catches light at night). Nine of them:
three across the great hall's west face, over each gate, in the tympanum over the
rotunda door, and two laid flat — the forecourt paving and the rotunda dais.

The negative test is the one that matters: at the height of the pupil, the cell
4 blocks out is sclera and the cell 7 blocks out is stone. A disc fails that; an
almond passes it. It is also what forces the shape, because a circle and an
almond differ *only* at the corners.

Two placement bugs this shook out:
* the three hall eyes at ±9 **overlapped** the great one in the middle and fought
  over the same blocks; the hall is 43 long and each eye is 13 wide, so ±14 is
  the only spacing that fits three without them touching.
* the gatehouse eye was originally drawn in `forecourt`, which runs *before*
  `gatehouse` — so the gatehouse simply walled over it. Caught by a test that
  samples the pupil.

### The insides

A build like this gets the inside wrong by default: every reference photograph
was taken from outside, so nothing forces it to exist, and a player walks through
the gate into four walls.

* **Great hall** — laid floor and border course, a colonnade with a sea lantern in
  every capital, pews in rows either side of the aisle, banners between the
  window piers (skipping the axis, where the doors are), three chandeliers on
  iron chains, a three-course tiered dais with a throne and a lectern on the
  carpet.
* **Both wings** — library galleries: a carpet runner, bookcases along both walls
  in bays with a pier between them, hanging lanterns, refectory tables with stools.
* **Rotunda** — a compass-rose floor in glass and stone, eight piers with lamps in
  their capitals, a ring of six chandeliers, and the castle's flattest eye laid
  on the dais with a sea lantern under the pupil.

Three doorways now connect the spaces, and they are cut *last*: the wings and the
drum are both built as solid masses and hollowed afterwards, so anything cut into
a shared wall before they run is paved over by the room behind it. Two of them had
exactly that bug — the wings' arcade is built one block *inside* the hall's east
wall, and the drum's ring wall is two blocks thick on its axis, so each door
opened onto a solid block. Reached with a BFS over standable cells (feet in air,
floor solid, step-up and step-down moves) rather than by counting blocks, which
is the only check that would have found either.

The rotunda dais is one course and its eye is 5 across, not three courses and 7
across: a two-course dais is a two-block wall, and an eye scaled up until its own
stone socket covers the dais leaves the middle of the room as the one place in the
castle you cannot stand in.

### Files

`src/world/veil_castle.test.ts` (new, 8 tests), `beacons.ts`, `veil_castle.ts`,
`purgatory.ts`, `blocks.ts` (`litBeacon`), `validate-palette.ts` (`power_level`
and `target` added to the known state vocabulary), `render-preview.ts`.

Full gate: typecheck clean, **108/108 tests**, palette OK, `pack OK`,
`world OK (40 checks)`, 23/23 landmarks present and reachable.

---

## The beacons that did not fire, and the castle that had one floor

Two reports from the same round of screenshots, and only one of them was a
matter of taste.

### Why no beam appeared

Every one of the 24 masts was topped with a `minecraft:beacon` block carrying
`power_level: 1` in its palette entry, and not one of them drew a beam. The
state was written correctly - the tests asserted it, the file was right, and
`validate-palette` was happy.

The reason is that **`power_level` is a cache, not a fact.** The game recomputes
a beacon's power from the blocks underneath it every time the chunk loads, and
overwrites whatever the file said. The crowns were standing on a 3x3 collar of
netherite, and 3x3 scores **zero**: the minimum for level 1 is a complete 5x5
of base material. So on load, all 24 beacons were recomputed to unlit and sat
there grey, in a world file that looked perfect to every tool that read it.

This is worth writing down because it is a genuinely different failure mode from
the usual "the geometry is wrong". Nothing is broken, nothing is missing, and
the more you inspect the file the more correct it looks. The bug is in a rule
the generator has to satisfy but never has to *represent*.

Fixed by building an actual pyramid: a solid 5x5 netherite base, a 3x3 iron
tier, a 3x3 netherite capital, and two decorative accent rings below it. The
decorative rings are deliberately *below* the base - an earlier attempt painted
the accent onto the base itself, which voids the pyramid just as thoroughly as
leaving a hole in it, and is invisible except as a beacon that will not light.

The Purgatory office beacon now imports `BEACON_TIERS` rather than re-declaring
its own collar, because a 5x5 in one file and a 3x3 in the other means one mast
silently never fires and only one of the two looks wrong.

New test: `NEGATIVE: every beacon stands on a full 5x5 base, with clear air
above`, naming the five valid base materials explicitly rather than counting
"solid" blocks, and checking the three courses above each crown are air - a beam
with a block on it is a beam one block long.

### A castle with one floor

The interior references are all the same building: a vaulted hall with a
**balcony running down both sides** above a colonnade, banners on the rail, a
broad stair at one end. The castle had a vault and a colonnade and no balcony,
which is a corridor with a roof.

`furnishGallery` adds the second storey - a three-wide deck ten courses over the
paving, hard against each wall, on the line of the piers below, with a dark-oak
rail on the nave side, corbels underneath, and two mirrored ten-course stairs at
the ends of the hall. The hall's roof became a barrel vault (the rise taken
across X only; taking it from the distance to the nearest edge on all four sides
put the *lowest* point of the ceiling over the middle of the room and made the
hall a funnel) with a mandala of concentric rings and twelve dark spokes laid in
the vault's own surface.

**Every room is now asserted walkable**, which is the user's actual requirement
and the one thing a screenshot cannot check. A BFS floods real standable cells
from the middle of the hall - four-way, with a step up or down, which is what a
player can actually manage - and 16 named cells are then required to be in the
set: both ends of the hall, the dais, **both stair feet and both stair tops**,
four points on each gallery, the rotunda floor, two points on the rotunda dais
ring, and both wings.

That test found four real bugs, none of which were visible from outside:

1. **The newel post was in the staircase.** Both flights are hard against a
   wall, so the only way onto one is across the nave; a post on the nave column
   is a post in the doorway of its own stairs. The BFS failed both flights on
   exactly that. It now stands on the outer column, which is also the classic
   place for one.
2. **The colonnade piers were in the staircases too.** Fourteen courses tall, on
   the exact line the stairs climb. The run moved to z126-z142, clear of both
   flights. A plan view of either room would not have shown it.
3. **The wall banners went up through the gallery deck.** They ran to LEVEL+13;
   the deck is at LEVEL+10, so three of them ended up standing in the middle of
   the gallery walkway. They stop under the deck now.
4. **The pews were in the nave.** Moved outboard to `HALL_X1+1..+2` so they sit
   against the wall, and the two z bands the stairs occupy are left clear so a
   bench is not buried under four courses of stone tread.

The potted trees on the dais are **glass**, not leaves. The whole Underworld is
glazed and a world-wide test asserts there is not one leaf block in it; a
dark-oak topiary would have been the only foliage in 704x704 blocks of glass and
blackstone, in the one room a player is guaranteed to walk into.

### Files

`src/world/beacons.ts` (real pyramid, `BEACON_TIERS`), `purgatory.ts` (office
beacon shares the tiers), `veil_castle.ts` (gallery, stairs, barrel vault,
mandala, pew and banner fixes), `veil_castle.test.ts` (11 tests, incl. the BFS
reachability check and the beacon-pyramid test), `world.test.ts` and
`purgatory.test.ts` updated off the old 3x3 collar.

Full gate: typecheck clean, **111/111 tests**, palette OK, `pack OK`,
`world OK (40 checks)`. Verified in the built `.mcworld`: 24 beacon blocks, iron
pyramid tiers and netherite bases present in the decompressed `db/`.

## The castle's undercroft, and the nether portal frame that does not exist

The last four requests, in one sitting: an underground area for the Veil Castle ("eye style, same
style of castle, make it big, **and make sure you hit no builds**"), a 3x3 of nether portal frame at
the bottom of it laid out the way an end portal frame goes, glass and light in the Warden's arena,
and beacons anchored to the landmark's own roof.

### "Hit no builds" is the whole design constraint

`buildVeilUndercroft` runs *after* `buildVeilCastle` and `buildPortalLobby`, so every block it writes
is a subtraction from work that already exists. Three things own blocks below the surface:

| what | where | lowest block |
| --- | --- | --- |
| the castle's ground plate (`pad`) | x -195..-127, z 92..174 | y46 |
| the **causeway's arch piers** | x -208 and -200, z 130-136 | y ~20 |
| the portal lobby | x -231..-211 | y18 |

The first version cleared **y5 to y54 over 97x97** and called `setSurface(x, z, 5)` on every cell.
It took the castle's floor out from under itself, cut the lobby's east half off, and told the height
map the ground was at y5 - which is why `terrain > keeps every landmark on solid land` failed, and
why the castle, the lobby and the forecourt tests failed with it. Nineteen tests, one cause.

The shape that fixes it:

* the footprint is **inset inside the castle's own pad** (x -193..-129, z 99..167) instead of
  centred on `VEIL_COURT`, so every column it cuts has the castle's floor slab over it - and its
  west edge stops six blocks short of the causeway's piers and twenty short of the lobby;
* every write is capped at `UNDERCROFT.ceiling` = y45, one under the plate, and `excavate` no longer
  touches the height map at all;
* the **galleries** moved from `CX ± 40` to six in from each side wall. At `CX ± 40` they were at
  x -219 and -139, which is inside the portal lobby;
* the top hall's vault is **clipped** to the ceiling. A barrel vault rising to y57 went straight
  through the castle's floor.

Verified from the built world, not from the code: 41 holes in the castle's plate at y46 and not one
more, zero columns whose surface moved, both causeway piers still solid at y40, the lobby's court
still paved.

### The descent, and why it is a straight run and not a switchback

The undercroft has to be *reached*, so the great hall's own paving is opened and a flight runs down
out of it into the top hall.

The first attempt was a switchback: a flight down +Z, a landing, and a return flight in the same
three columns. That does not work in a three-wide shaft, and the failure is silent - the return
flight's headroom cut starts at `y + 1`, which on its first tread is exactly the landing's floor
course, so **the landing is deleted course by course** and the middle of the stairs is a five-block
hole. Three flights in one shaft also need a floor to cross between them, and the second flight's
re-cut takes that floor out.

What works is one straight run with a landing half way down, and the next flight **running back the
other way in the same shaft**, so the bottom step of one *is* the top step of the one under it. Each
step clears the blocks above itself up to the floor it starts from, which is what stops the slab
roofing over a flight that runs downward from a floor level. Verified by BFS from the middle of the
great hall: all three halls and a cell beside the portal frame are in the reachable set.

### `minecraft:nether_portal_frame` does not exist in Bedrock

The request was "at the bottom of it put an end portal, but instead of an end frame it's a nether
portal frame, but it's like in the way an end frame would go". There is **no such block** in 1.26.51
- `minecraft-data` does not have it and the palette validator rejects the name outright.

So the ring is **crying obsidian**: what a nether portal is actually built from, in the Nether family,
and a block the game knows. An end portal frame is a 3x3 ring of frame blocks lying *flat in the
floor* with the portal in the middle, so that is the shape: the ring is in the floor plane, the
centre cell carries `minecraft:portal` - the nether portal's own surface block, so it is a working
portal and not a picture of one - and the two courses above it are air, which is what makes a nether
portal two blocks tall. Standing the ring *on* the floor would be three blocks and a fence.

The chamber is the middle of the deepest hall rather than a room below it, because the void starts at
about y20 and there is nowhere below the deepest hall to put one.

### Beacons: on the roof, and out of the canopy

`beaconMast` reads the landmark's top out of the world, which is correct exactly once - after
`buildBeacons` has run, the column it scans *is* the mast, so asking again returns a taller mast
than the one that was built. The build now records what it built, per world, and the query answers
from the record.

The crowns then sit **under** the canopy band (a mast on a roof tops out around y64; the sheets are
at y92-116), so every crown cuts a three-wide skylight up through the band. Three wide and not seven:
the beam is one block, and a hole the width of the crown's own ring takes the silhouette off it and
reads as a missing patch of sky.

`MIN_BEACON_HEIGHT` went from 8 to 16. The crown's pyramid occupies the five courses under the
beacon, so an eight-course mast has a three-course shaft with no netherite band and no accent in it -
and the two accent halos, eight and twelve courses below the crown, fell off the bottom of the mast
and into the building it was standing on.

### The Warden's bowl: glazed slope, dark floor

The arena's slope is glazed on purpose - it is a terrace of light you look down into. What it must
not do is glaze the **sculk**. The bowl is a parabola, so the sculk disc runs a block or two past
the glaze's inner radius, and those cells were being paved: 61 of the floor's sculk blocks, and the
`NEGATIVE: no glazing reaches inside the bowl` tests were asserting the opposite of the request.
`glazeArenaSlope` now skips any column whose floor is sculk, and the two negative tests measure the
inner disc per column - a parabolic floor is a different height in every column - and additionally
assert the slope outside it *is* glazed, so the dark centre is dark because of the contrast.

### Tests

Two stale suites rewritten (the beacon-crown and the two Warden's-bowl negatives), and the sky
canopy / split tables / sky beacon suites moved to `sky.test.ts`: `world.test.ts` had grown past the
size the editor can address, and the Warden arena suite sat in that unreachable tail.

New `veil_undercroft.test.ts` (6 tests): underground, big, **reachable on foot from the great hall**,
the 3x3 frame and its lit portal, an eye on all four walls of every hall, and `NEGATIVE: hits no
builds`.

Full gate: typecheck clean, **117/117 tests**, palette OK, `pack OK`, `world OK (40 checks)`,
`.mcworld` 9.36 MB.
