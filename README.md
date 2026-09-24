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
| `dist/Underworld-Simulator-Remastered.mcworld` | Importable Bedrock world (~1.2 MB) |
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

Realm footprint: **512 × 512 blocks** (32 × 32 chunks), centred on `0,0`, floating in the void.
Surface heights run from **y≈13 to y≈121**; the plate is roughly 20–30 blocks thick and tapers
into nothing at its edges. North is `-Z`, east is `+X`.

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
| **The Void Castles** | `-71…-111, 35…44` | Three floating castle islands in the western gulf, each holding an escape room (redstone-lamp floor, flooded maze, copper-bulb and slime floor), linked only by **glass bridges**. |
| **Maze Valley** | `120, -128` | The valley between two mountains, a gatehouse, and a walled labyrinth with a hidden stair out. |
| **The Abandoned Village** | `118, -178` | Eight house plots (some ruined), a small keep, wells, gardens, hay, lamps, dead trees. |
| **The Frost Pocket** | `-64, 168` | A bowl of snow, powder snow, ice and blue ice with dead pines and the secret stair in from the tomb. |

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
* The plate's lit, built areas sit around the Center; the far west is the darkest rock (blackstone,
  crying obsidian, sculk, more black concrete) — the "darker toward the End" gradient.

Atmosphere is entirely block-built: soul lanterns and soul fire, crying obsidian, sculk, soul
sand/soil flats, gravel and ash, obsidian cairns along the void rim, grave lanterns, and a
permanently dark sky (`Time 18000`, `dodaylightcycle 0`). Nothing else was added.

---

## What is deliberately not here

No simulator logic, no lobby world, no UI or menus, no NPC/bot entities, no combat mechanics, no
kits, no loot or resource packs, no behavior packs, no commands or functions, no portal logic,
no scoreboards and no mobs (`domobspawning 0`). Every block in the realm is placed by the
generator; nothing is left to the game's own world generation (the world is a **void flat world**,
so ungenerated space is nothing at all — which is what makes the "world within the void" reading
work).

---

## Bedrock format notes

Target: **Bedrock 1.26.51** (confirmed against Mojang's own block list as shipped in
`minecraft-data`).

* **`.mcworld`** — a ZIP containing `level.dat`, `levelname.txt`, `world_icon.jpeg` and `db/`.
* **`level.dat`** — 8-byte header (`u32` storage version 10, payload length) + uncompressed
  little-endian NBT: `Generator 1` (superflat) with an **air-only flat layer** so everything
  outside the plate stays void, `Time 18000`, `showcoordinates 0` (canon: coordinates are broken),
  `domobspawning 0`, `keepinventory 1`, `dodaylightcycle 0`, and a spawn point placed safely at
  the Breach.
* **`db/`** — real LevelDB (via `classic-level`, bytewise comparator) with Bedrock's key layout:
  `x: i32 LE | z: i32 LE | [dimension] | tag: u8 | [subchunk index: i8]`. Written per chunk:
  `Version 0x2C = 41` (v1.21.40 chunk format — modern, so nothing is migrated or re-blended on
  load), `FinalizedState 0x36 = 2` (fully generated), and `SubChunkPrefix 0x2F` records for the
  subchunks that actually contain blocks.
* **Subchunks** — version **9** payload (1.18+): `version, layerCount, subChunkIndex`, then one
  NBT-paletted storage layer (`bitsPerBlock << 1`, packed 32-bit words, palette of
  `{name, states, version}` compounds). Indices are in Bedrock's XZY order. Block state names were
  checked against Bedrock 1.26.51 — including the flattened IDs (`stone_bricks`, `iron_chain`).
* **Mobile performance** — only 596 chunks have content, only ~1 840 subchunks are stored (average
  payload 2.4 KB), subchunks below/above the plate are omitted entirely, there are no block
  entities, no entities, no ticking systems and no mobs. The whole world is ~1.2 MB, which loads
  quickly and keeps memory low on a phone.

If a device ever renders the terrain incorrectly, the serializer has a documented escape hatch:
`bun run src/build.ts --subchunk-version=8` emits the legacy pre-1.18 paletted payload (modern
clients upgrade it on load) instead of version 9.

---

## Working on it

```bash
bun install

bun run build:map        # generate dist/*.mcworld + docs/map-preview.jpg  (~2 s)
bun run inspect          # read the world back: keys, subchunk round-trip, level.dat, zip
bun run typecheck        # tsc -b --noEmit
bun test                 # 16 tests: serializer, zip, palette, terrain, level.dat
bun run src/tools/map-ascii.ts 128   # text map of the realm for layout checks
bun run src/tools/validate-palette.ts # every block state vs Bedrock 1.26.51
```

Everything is deterministic: `CONFIG.seed` in `src/world/config.ts` reproduces the same map.

### Layout of the source

```
src/bedrock/    Bedrock file formats: NBT writer, subchunk serializer, LevelDB keys + writer,
                .mcworld ZIP packer, level.dat builder
src/world/      config.ts (seed, realm, versions)  layout.ts (landmark coordinates, roads,
                terrain regions)  terrain.ts (heightfield, chasms, lava lake)  structures.ts
                (towers, curtain walls, keeps, bridges, glass bridges, mazes, terraces)
                areas.ts (the fourteen landmarks)  roads.ts  decorate.ts  icon.ts  world.ts
                (voxel buffer + painting primitives)
src/tools/      inspect-world.ts, map-ascii.ts, validate-palette.ts
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
* the LevelDB contains `Version` + `FinalizedState` for all 1 024 realm chunks and only
  non-empty subchunks besides;
* terrain generation is deterministic and every landmark lands on solid ground.

Not verifiable here (no Minecraft client in this environment): the final in-game look, and
whether a specific device build accepts the modern subchunk payload. That is what the
`--subchunk-version=8` fallback and `docs/map-preview.jpg` are for.

### Known gaps versus the original

The original Java maps are proprietary and were not available; this is a reconstruction from
public footage, descriptions and the community wiki. Where the source material is vague — exact
distances, exact building geometry, interior layouts of the dungeons — the map makes a reasoned,
documented choice rather than a guess at pixel accuracy. The *layout*, *palette*, *elevation*,
*major buildings* and *relationships between areas* follow the references; individual block-level
detail of the originals will differ.
