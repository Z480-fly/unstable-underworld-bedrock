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
