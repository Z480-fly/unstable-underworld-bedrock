# Unstable SMP — The Underworld, rebuilt for Minecraft Bedrock

A **procedural reconstruction of the physical Underworld map** (the *Underworld Simulator* /
*Underworld Simulator Remastered* arena from the Unstable SMP), built from scratch as an
importable **Minecraft Bedrock `.mcworld`** and optimised for iPhone / mobile.

> **Map only.** No simulator, no lobby, no simulator UI, no bots or NPCs, no combat systems,
> no kits, no extra gameplay mechanics and no addons. Just the world: terrain, elevation,
> buildings, landmarks, roads and atmosphere.
>
> No original map files are redistributed. Everything in `src/` is generated from the public
> references listed below.

---

## Get the world

The generated world ships with the repository:

| File | Description |
| --- | --- |
| `dist/Underworld-Simulator-Remastered.mcworld` | Importable Bedrock world (~1.7 MB) |
| `docs/map-preview.jpg` | Top-down render of the realm (also used as the world icon) |

**Importing on iPhone / iPad**

1. Download `dist/Underworld-Simulator-Remastered.mcworld` (for example from GitHub, or AirDrop
   it to the device).
2. Tap the file in **Files**. iOS hands `.mcworld` to Minecraft, which imports it and shows it in
   the world list as *Underworld Simulator Remastered*.
3. Open the world. You spawn at **The Breach** — the crater Wemmbu and Boosfer fell into.

Manual install (Android / Windows / console paths) works too: the `.mcworld` is an ordinary ZIP,
so it can also be extracted into `minecraftWorlds/<folder>/` with `level.dat` and `db/` at the root.

Reproducing it from source: `bun install && bun run build:map`.

---

## References used

The request named four references. They were used like this:

| Reference | What it contributed |
| --- | --- |
| [Unstable SMP Simulator modpack](https://modrinth.com/modpack/theunstablesmpsimulator) (Modrinth) | Confirms *Underworld simulator* / *Underworld simulator Remastered* exist as maps in the simulator pack (~6 GB of Java maps). Establishes the target: a famous, frequently-played arena, not a generic Nether. |
| [Wemmbu — Wemmbu Vs The Underworld Simulator](https://www.youtube.com/watch?v=r6CNba1D_EE) | The debut of the dimension: falling through a void trap in the Nether, the brewing tower, the giant castle with caged players in front, the laggy **gold block in the middle of the castle**, the Soul Keepers, the void-trap base, escaping back up through bedrock. |
| [Spoke — Exploring Minecraft's Forgotten Dimension](https://www.youtube.com/watch?v=lA1ohDqw8XA) | The west route: an endless plain of broken structures, terrain degenerating into void gaps, the gate that opens from a lectern, the escape-room dungeons, the **glass bridges**, the sky darkening toward the End, and the **Citadel** — the library far out west. |
| [Parrot — Escaping the Minecraft Underworld](https://www.youtube.com/watch?v=BWmWZTDxFrk) | The long overland route: the tower ringed by a **wheat field** and its activated wall, the cliff to the void, the ravine crossing, the valley between two mountains that opens into a labyrinth, the **abandoned village** with its castle, the cave gate and statue-lined pit, the **tomb of the Mage of the Deep**, a powder-snow pocket, the nether-like lava reach and its huge lava lake with an island of three striders, and finally the destroyed castle whose pressure plates open the way home. |

Video descriptions alone are thin, so the narrative details above were cross-checked against the
community wiki for the series (Unstable Universe wiki — `The Underworld`, `I Escaped Minecraft's
Forgotten Dimension`, `Exploring Minecraft's Forgotten Dimension`, `Escaping the Minecraft
Underworld`), which uses the maps' own footage as its source and names the areas exactly as the
request does: **The Castle, Center, The Fields, Citadel, Ruins, Dungeon, the Graveyard, the void
castles and glass bridges**.

Useful quotes the reconstruction leans on:

* *"The Underworld is a dark place filled with patches of soul sand and soil as well as several
  deep chasms. Almost everything is gray or black… It is home to several locations including a
  castle, a graveyard, and a series of partially destroyed bridges."*
* *"Sometimes these barren wastelands fracture to void."*
* *"The sky and void grow increasingly darker as the proximity to the end shortens."*
* *"In The Underworld coordinates are broken."*
* *"The Citadel is a massive library which houses the knowledge of almost everything that has
  ever happened on Unstable."*
* *"The gold block is located in (about) the middle of the castle."*

---

## The map

Realm footprint: **704 × 704 blocks** (44 × 44 chunks), centred on `0,0`, floating in the void —
316 764 of its 495 616 columns are land. Surface heights run from **y≈18 to y≈91**; the plate is
roughly 26 blocks thick and tapers into nothing at its edges. North is `-Z`, east is `+X`.

| Landmark | Centre (x, z) | What it is |
| --- | --- | --- |
| **The Breach** (spawn) | `0, 152` | The impact crater and shattered bedrock spire they fell through, with cages and a Soul Keeper outpost. |
| **The Ruined Castle** (exit) | `68, 146` | Parrot's destroyed castle: two pressure-plate platforms and a hidden Nether portal vault. |
| **The Ashen Reaches** | `120, 132` | Nether-like lava reach: a 42-block-radius lava lake, lava mountains, an island with a dock and three strider moorings. |
| **The Fields** | `112, 20` | Seven wheat terraces behind a ring wall, the brewing tower, cottages, silos, a well and hay. |
| **The Center** | `0, 40` | The Withered Castle — 100 × 88 curtain wall, four gates, four corner towers, cages in front — with the **Gold Block monument** on a gilded plinth at the exact middle. |
| **The Ruins** | `40, -60` | Broken viaduct, collapsed arches, fallen columns, a single intact obelisk. |
| **The Graveyard** | `-58, -78` | Grave rows, a ruined chapel, a crypt stair down to a lit burial chamber, dead trees. |
| **The Nether Portal Lobby** | `-158, 140` | The hall of **twenty** obsidian portal frames guarded by towers, connecting the Underworld to the Far Lands. |
| **The Citadel** | `-158, 40` | The great library: three floors of shelves around a domed atrium open to the dark sky, and the exit stairwell with its ladder and broken bedrock. |
| **The Pit / Tomb of the Mage of the Deep** | `-158, -70` | Statue-ringed pit with a spiral ramp, sculk tomb with sensors and shriekers, muffled corridors out, and the lava-trap corridor on the surface. |
| **The Void Castles** | `-78…-102, 36…42` | Three floating castle islands in the western gulf, each holding an escape room (redstone-lamp floor, flooded maze, copper-bulb and slime floor), linked only by **glass bridges**. |
| **Maze Valley** | `120, -128` | The valley between two mountains, a gatehouse, and a walled labyrinth with a hidden stair out. |
| **The Abandoned Village** | `118, -178` | Eight house plots (some ruined), a small keep, wells, gardens, hay, lamps, dead trees. The houses that survived are dressed as shops - a counter, back-wall shelving and a furnace at work - and two more stalls stand south of the row. |
| **The Frost Pocket** | `-64, 168` | A bowl of snow, powder snow, ice and blue ice with dead pines and the secret stair in from the tomb. |
| **The Glassworks** | `188, 226` | The Soul Keepers' glazing hall: a 30 × 60 stained-glass hall in blackstone frames, four full-height window bays a side, a rose window at each gable, a half-collapsed glass roof, a glass bridge and a green glass crystal - and 4 800-odd glass blocks in all. An **eye oculus** is set into the floor beneath the colour shaft: concentric stained-glass iris rings around a pupil of eyed end-portal frame, lit by a sea lantern. |
| **The Gate Field** *(cut portals)* | `252, -116` | Eighteen nether portals in three colonnades, each one failed differently: **whole** (frame and lit portal), **cut** (the frame sheared off above head height, only the lower portal left), **collapsed** (jambs and obsidian rubble), plus a ten-wide grand gate and a **hybrid portal** - half nether, half End - fused at a corrupted seam south of the grid. |
| **The End Ruin** | `-246, -170` | The dark end of the realm: an end stone and purpur plaza on an obsidian rim, six obsidian pillars with end-rod crowns, **four broken end portals**, a shard of the End hanging overhead, and the only `end_portal` blocks in the world. |

### How the areas relate

* **The Long Walk West** (`z = 40`) is the spine: Fields → Center → through the west gate →
  across the **void gulf**, which can only be crossed by the void castles' glass bridges →
  the Citadel's east gate. The western landmass (Citadel, Pit/Tomb, Portal Lobby) is an island in
  its own right — you *must* pass the escape-room castles to reach the library, exactly as Spoke does.
* **The Breach Road** runs north from spawn into the Center's south gate; a road leaves the north
  gate for the Graveyard, with spurs to the Ruins and on to Maze Valley and the Village.
* **The southern ring** closes the loop: Breach → Ruined Castle → Ashen Reaches → Fields →
  village roads → Portal Lobby → (west island) → Frost Pocket → back to the Breach. Parrot's
  video route, clockwise.
* The eastern **void fracture** and the northern **fracture** cut the plate apart; roads crossing
  them are bridged, and the bridges are deliberately **broken**.
* **The west darkens toward the End.** The surface palette ramps from the grey plain just west of the
  Center through the void castles and the Citadel to black rock at the rim: blackstone, polished
  blackstone, basalt, crying obsidian and black concrete climb from ~17 % of the ground east of the
  Center, through ~27 % around the Citadel, to ~43 % in the far-west band (`darkEdgeStartX` /
  `darkEdgeX` in `config.ts`). The ruin
  masonry darkens with it, so the broken structures out west are built from the same black stone the
  ground there is made of. A test holds the gradient in place — the old ramp began *past* the Citadel
  and only ever tinted the empty rim.

Atmosphere is entirely block-built: soul lanterns and soul fire, crying obsidian, sculk, soul
sand/soil flats, obsidian cairns along the void rim, grave lanterns, and a permanently dark sky
(`Time 18000`, `dodaylightcycle 0`). Nothing else was added.

### The outer ring

The realm was first built at 512 × 512 (radius 220) and every landmark sat inside ±200, so the map
had no land beyond the old rim. It is now **704 × 704** (radius 300): the plate carries an outer ring
of terrain of its own - a southern range, east highlands, a northern basin and a far-western spine,
plus a southern canyon, a second void fracture west of the Citadel and a dry ravine across the
east - and three new places stand in it:

* **The Glassworks** (`188, 226`) - the hall the Soul Keepers' glazing is made in. The map had
  stained glass only as two grey chapel windows, a ring of green on a handful of towers and the
  glass bridges; now **every tower and every house in the realm is glazed**, with two blocks of
  stained glass under a stone lintel per opening, and the Glassworks itself carries window bays,
  rose windows, a glazed roof, a glass bridge and a green glass crystal. The world went from a few
  hundred glass blocks to **4 869** (4 252 of them stained).
* **The Gate Field** (`252, -116`) - the "cut portals": nether portals that failed mid-frame.
  `portalFrame` grew a `broken` variant for it, and the field shows whole, sheared-off and collapsed
  gates side by side, with obsidian rubble and caged gates taken out of use.
* **The End Ruin** (`-246, -170`) - the end of the darkening west. `brokenEndPortal()` had been
  written and *never called*, so the map contained no end portal at all; it now has four shattered
  ones, end stone and purpur in an obsidian plaza, end-rod pillars and a shard of the End overhead.

* **Interiors and two failed hybrids.** Every surviving house in the Abandoned Village is now
dressed as a stall (`shopInterior`) - a counter facing the door, two rows of shelving on the back
wall, a crafting table and a furnace in a corner, a light overhead - built with `setIfAir` so the
dressing can never punch through a wall or a doorway, and the Glassworks gets the eye oculus above.
A *hybrid portal* (`hybridPortal`) sits in the Gate Field: one half obsidian and a lit nether
portal, the other an eyed end-portal frame and `end_portal`, joined by a corrupted seam column of
crying obsidian and end rods - a splice that failed the other way, and as purely decorative as
every other portal in the realm.

These three places are **additions, not reconstructions**: the references describe the Soul Keepers'
green glazing and the twenty-portal lobby, but not a glazing hall, a gate field or an End ruin. They
extend what the sources imply rather than contradict them (same palette, same masonry, same
atmosphere), and everything else in the map is unchanged.

### The wasteland between the set pieces

Two things the references describe as defining the place, and which the map therefore spends the
most effort on:

* **"An endless plain of broken structures."** The detail pass (`src/world/decorate.ts`) covers every
  stretch of wilderness with half-buried masonry - wall stubs eroded to nothing at both ends, ruined
  tower stumps tall on one side and collapsed on the other, fallen columns, rubble fields and broken
  gate frames with the span fallen in. **About 12 % of the plain now carries standing ruin**
  (`bun run audit` prints the figure). It is deliberately excluded from landmark footprints and from
  protected pads and roads, so it can never grow through a building or cut a path.

  The pass (and `bun run audit` with it) spans the **whole realm**. It did not always: every detail
  loop used to stop on a tidy ±190 square while the plate reaches ±300, so a band a hundred blocks
  deep around the entire edge carried no ruin, no boulders and no cracks at all, exactly where the
  references put the most broken ground. A test now holds detail coverage on the outer band, not just
  the middle.
* **"Cracks of void forming on the ground", "sometimes these barren wastelands fracture to void."**
  A second pass carves long, thin, wandering fractures into the plate. Half of them are shallow
  seams floored with magma and obsidian; the other half tear **clean through the plate and open onto
  the void** - 52 of the 704 × 704 columns are a hole you can drop through, 1-2 blocks across and
  edged with obsidian and crying obsidian so the break reads as torn rock rather than a clean cut.
  A crack is *walked* across the plate and then carved, skipping the cells it must not cut, so it
  crosses the map instead of stopping at the first paved road; whatever it opens is marked void and
  protected so no later pass tries to build on thin air.
* **The rim sheds.** The plate does not end in a clean cut. 5 225 columns just clear of the edge
  carry material the plate has torn loose: chunks of its own rock drift in the void (some of them
  still wearing a pane of Soul Keeper glazing), and teeth of obsidian with the odd crying-obsidian
  tip hang off the torn underside - the same "fracture to void" seen from the void side, so the
  realm reads as an island coming apart rather than a floating rectangle with a tidy border.

### No falling blocks, and where the green went

The palette splits the way the sources do - *"almost everything is gray or black, with really the
only vibrant color being the green visible on some structures"*:

* the **ground is gray and black**: deepslate (51 %), tuff (21 %, the old gravel shading), blackstone
  (6 %), basalt, cobbled deepslate, obsidian, soul sand/soil;
* the **green is stained glass, and it is on structures** - the Soul Keepers' tower windows at the
  Breach, the Withered Castle's corner towers, the Citadel, the void castles, the Portal Lobby guard
  posts, and the parkour course in the void castles' escape room.

  Glazing is a first-class material rather than a one-off: `tower()` and `house()` put two blocks of
  stained glass under a stone lintel in every opening on every building in the realm, the
  Glassworks is a long hall of it (bays, rose windows, a glazed roof, a glass bridge and a green
  glass crystal), and the void rim sheds shards that still carry a pane. The palette holds glass in
  plain, tinted, grey, light grey, white, black, light blue, cyan, purple, green and lime, plus
  panes in plain, grey, white, light blue, green and black - **4 789 glass blocks in all, 3 398 of
  them stained**.

Gravel, sand and concrete powder are Bedrock's *gravity* blocks: in a world placed block-by-block
they drop out of the terrain, leave holes in the plate and re-trigger the fall loop, which is what
makes a hand-built map glitch and stutter on a phone. `stabilize()` in `src/world/blocks.ts`
substitutes them at the single point every voxel write passes through - gravel becomes tuff (the
ash-grey ground), sand becomes the green glazing - so no builder can put one in the world by
accident, and `bun run inspect` fails the build if one ever reaches a subchunk palette.

---

## What is deliberately not here

No simulator logic, no lobby world, no UI or menus, no NPC/bot entities, no combat mechanics, no
kits, no loot or resource packs, no behavior packs, no commands or functions, no *scripted* portal
logic, no scoreboards and no mobs (`domobspawning 0`). The portal **blocks** are real (the twenty
frames of the Portal Lobby, the hidden vault in the Ruined Castle, the grand gate in the Gate Field
and the four shattered rings of the End Ruin), so they link and teleport exactly as the originals
do; nothing drives them from a script. Every block in the realm is placed by the
generator; nothing is left to the game's own world generation (the world is a **void flat world**,
so ungenerated space is nothing at all — which is what makes the "world within the void" reading
work).

---

## Bedrock format notes

Target: **Bedrock 1.26.51** (confirmed against Mojang's own block list as shipped in
`minecraft-data`).

* **`.mcworld`** — a ZIP containing `level.dat`, `levelname.txt`, `world_icon.jpeg` and `db/`.
* **`level.dat`** — 8-byte header (`u32` storage version 10, payload length) + uncompressed
  little-endian NBT: `Generator 1` with an **air-only flat layer** so everything outside the plate
  stays void, `Time 18000`, `showcoordinates 0` (canon: coordinates are broken), `domobspawning 0`,
  `keepinventory 1`, `dodaylightcycle 0`, and a spawn point placed safely at the Breach. The
  version stamps match an iPhone Bedrock 1.26.51 export — `InventoryVersion 1.26.51`,
  `MinimumCompatibleClientVersion [1,26,50,0,0]`, `NetworkVersion 2193`,
  `lastOpenedWithVersion [1,26,51,1,0]` — so importing does not raise an "older world" prompt.
  The flat layers stay air-only on purpose: that is safe whether or not `Generator 1` means
  "flat", whereas the export's `ClassicFlat` preset would carpet ungenerated space with grass.
* **`db/`** — real LevelDB (via `classic-level`, bytewise comparator) with Bedrock's key layout:
  `x: i32 LE | z: i32 LE | [dimension] | tag: u8 | [subchunk index: i8]`. Written per chunk:
  `Version 0x2C = 42` (the chunk version iPhone Bedrock 1.26.51 writes on export; 41 was used
  through ~1.21.x), `FinalizedState 0x36 = 2` (fully generated), `Data3D 0x2B` — a 512-byte
  heightmap plus the Overworld's **24** biome storages, bottom subchunk to top, written for
  **every** realm chunk so Bedrock treats the chunk as already generated instead of regenerating
  it — the three per-chunk metadata records a 1.26 export carries (`MetaDataHash 0x3F`,
  `BlendingData 0x40`, `ActorDigestVersion 0x41`), and `SubChunkPrefix 0x2F` records for the
  subchunks that actually contain blocks. Legacy `Data2D 0x2D` is deliberately **not** written:
  Bedrock stopped writing it in 1.18.0 and a native 1.26.51 chunk has none.
* **Chunk metadata** — every chunk stores an 8-byte `MetaDataHash`: the xxHash64 (seed 0) of its
  metadata NBT, serialized the way the game serializes it (keys recursively sorted, joint
  little-endian/varint "network" NBT order). The metadata itself lives once, in the world-level
  `LevelChunkMetaDataDictionary` record (`u32` entry count, then `u64` hash + NBT per entry), and
  describes the chunk as current and fully migrated — base game version 1.26.51, the extended
  Overworld height range, and every one-time terrain fix already applied. `BlendingData [0, 8]`
  says the chunk is not a seamless-blending source; `ActorDigestVersion 0` is the only entity
  digest format Bedrock has shipped.
* **Subchunks** — version **9** payload (1.18+): `version, layerCount, subChunkIndex`, then one
  NBT-paletted storage layer (`bitsPerBlock << 1`, packed 32-bit words, palette of
  `{name, states, version}` compounds). Block state names were checked against Bedrock 1.26.51 —
  including the flattened IDs (`stone_bricks`, `iron_chain`).
* **Subchunk index order** — Bedrock indexes a subchunk **XZY, Y fastest**: the block at
  `(x, y, z)` lives at `(x << 8) | (z << 4) | y`. The generator's own buffers are laid out Y-major
  so that a subchunk is 4096 consecutive entries, which is *not* the same order; `subChunkSlice()`
  transposes while it copies. This is worth calling out because writing the buffer order into the
  payload looks completely harmless — the payload still parses, the palette is still valid — and the
  only symptom is that the imported world is striped with the X and Y axes swapped. `bun run inspect`
  now compares all 4 808 subchunks against a freshly regenerated scene block by block, indexed
  Bedrock's way, so the two can never drift apart again.
* **Mobile performance** — 4 808 subchunks are stored, all 1 936 realm chunks carry their Data3D +
  metadata records, subchunks below/above the plate are omitted entirely, there are no block
  entities, no entities, no ticking systems and no mobs. The whole world is ~3.7 MB, which loads
  quickly and keeps memory low on a phone.

If a device ever renders the terrain incorrectly, the serializer has a documented escape hatch:
`bun run src/build.ts --subchunk-version=8` emits the legacy pre-1.18 paletted payload (modern
clients upgrade it on load) instead of version 9.

---

## Working on it

```bash
bun install

bun run build:map        # generate dist/*.mcworld + docs/map-preview.jpg  (~5 s)
bun run inspect          # read the world back: keys, subchunk round-trip, level.dat, zip
bun run typecheck        # tsc -b --noEmit
bun test                 # 37 tests: serializer, zip, metadata, palette, terrain, landmarks
bun run validate         # every block state vs Bedrock 1.26.51
bun run map              # ASCII map of the realm for layout checks
bun run audit            # per-landmark audit: did each one actually build something?
bun run check            # the whole gate: typecheck + test + validate + build + inspect
```

`.github/workflows/ci.yml` runs exactly `bun run check` on every push to `main` and every pull
request, so a change that breaks the palette, the serializers or the package layout fails before
it reaches a device.

Everything is deterministic: `CONFIG.seed` in `src/world/config.ts` reproduces the same map.

### Layout of the source

```
src/bedrock/    Bedrock file formats: NBT writer, subchunk serializer, Data3D biome writer,
                chunk metadata (hash + dictionary), LevelDB keys + writer, .mcworld ZIP packer,
                level.dat builder
src/world/      config.ts (seed, realm, versions)  layout.ts (landmark coordinates, roads,
                terrain regions)  terrain.ts (heightfield, chasms, lava lake)  structures.ts
                (towers, curtain walls, keeps, bridges, glass bridges, glazing panels, rose
                windows, eye oculi, hybrid portals, mazes, terraces)  structures_interior.ts
                (shop interiors, dressing an existing footprint with setIfAir)
                areas.ts (the seventeen landmarks)  roads.ts  decorate.ts  icon.ts
                scene.ts (the generation pipeline, in order)  world.ts (voxel buffer + painting
                primitives)
src/tools/      inspect-world.ts, map-ascii.ts, landmark-audit.ts, validate-palette.ts
src/build.ts    orchestrator
```

### Tuning

Almost everything worth changing is data, not code:

* `src/world/config.ts` — seed, realm size, vertical range, plate depth, relief amplitude, radius,
  void gulf, chunk/subchunk versions.
* `src/world/layout.ts` — landmark centres and footprints, terrain regions, the road network.
* `src/world/blocks.ts` — the palette; `P` is the single source of truth for materials.

---

## Verification status

Verified programmatically on every build:

* every block state in the palette exists in Bedrock 1.26.51 (checked against Mojang data);
* every written subchunk payload parses with the Minecraft-Wiki-referenced `mcbe-leveldb`
  implementation, returning the exact palette and block indices that were written;
* the `.mcworld` ZIP is well formed (magic, central directory, CRC32s) and contains
  `level.dat`, `levelname.txt`, `world_icon.jpeg` and the `db/` LevelDB files;
* `level.dat` parses back with the expected values, and the spawn point is on solid ground;
* the LevelDB contains `Version` + `FinalizedState` + `Data3D` + the three metadata records for
  all 1 936 realm chunks, the `LevelChunkMetaDataDictionary`, and only non-empty subchunks besides;
* every Data3D payload decodes as 24 uniform biome storages of 632 bytes, reads back through
  `mcbe-leveldb`, and its heightmap matches the regenerated scene column for column;
* every `MetaDataHash` equals the recomputed xxHash64 of the metadata, and the dictionary entry it
  points at is the one a 1.26 client would find;
* regenerating the scene reproduces every one of the 4 808 written subchunks block for block, with
  the payload read back in Bedrock's own XZY index order — so no written block is rotated, offset or
  dropped on the way from the generator into the file;
* not a single gravity block (gravel, sand, concrete powder) reached the world, checked in every
  subchunk palette;
* terrain generation is deterministic, every landmark lands on solid ground, and every one of the
  seventeen landmarks places its signature geometry (`bun run audit` prints the counts);
* the plate is actually torn: 52 columns open through it into the void, the rim hangs masonry into
  the void beside it, and the outer band of the plate carries the same density of ruin as the middle
  (all three are asserted in `bun test`, because all three were quietly false before);
* the wasteland really does darken toward the End: the far-west ground is more than twice as black as
  the east, asserted in `bun test` because the darkening ramp used to start beyond every western
  building.

`bun run inspect` is a real gate, not a diagnostic: it collects every problem it finds and exits
non-zero if there was any (39 checks on a healthy build). CI runs it on each push.

Not verifiable here (no Minecraft client in this environment): the final in-game look, and
whether a specific device build accepts the modern subchunk payload. The Data3D layout now matches
a native export (24 biome storages, plus the `MetaDataHash` / `BlendingData` / `ActorDigestVersion`
records): the phone sample's payload was ~5 KB because its subchunks really hold two biomes each,
while this world is a single soul-sand-valley biome, so its native encoding is the 632-byte uniform
form. `docs/IOS-1.26-FINDINGS.md` records both the sample and the resolution. The
`--subchunk-version=8` fallback and `docs/map-preview.jpg` exist for the same reason.

### Known gaps versus the original

The original Java maps are proprietary and were not available; this is a reconstruction from
public footage, descriptions and the community wiki. Where the source material is vague — exact
distances, exact building geometry, interior layouts of the dungeons — the map makes a reasoned,
documented choice rather than a guess at pixel accuracy. The *layout*, *palette*, *elevation*,
*major buildings* and *relationships between areas* follow the references; individual block-level
detail of the originals will differ.
