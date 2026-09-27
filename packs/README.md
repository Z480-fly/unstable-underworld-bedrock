# Soul Keepers

Behaviour + resource pack that populates the Underworld with mobs. This is the
**addon half** of the mob request — the map half is the Sunken City and the
Warden's Deep Dark, already in the `.mcworld`.

## Install (iPhone / iPad)

`.mcworld` is a ZIP, but Bedrock will not read packs out of a world folder that
were not registered with it. The reliable path is to import them as packs:

1. Unzip `packs/soul-keepers-bp` and `packs/soul-keepers-rp` (or use the
   `.mcpack` zips if you make them).
2. Minecraft → **Profile** → the three-dot menu → **Import Packs from File** (or
   *Import from File* on older builds). Import the **resource pack first**, then
   the **behaviour pack**. The RP must exist before the BP will enable, because
   the BP declares a dependency on it.
3. Create a world with both packs enabled, then import
   `dist/Underworld-Simulator-Remastered.mcworld` alongside it.

To make `.mcpack` files: zip each pack folder so the `manifest.json` sits at the
*root* of the zip (not inside a parent folder), and rename to `.mcpack`.

## Testing the mobs

The packs do not spawn anything on their own until a mob actually spawns in a
sculk area — the Warden's Deep Dark and the Sunken City are the only places in
the world with enough sculk. For a quick check, run:

```
/function spawn_keeper_party
```

That summons one of everything at your feet: the archer, the bruiser, the ashen
blaze, the trader and a warden. Cheats must be on.

## What each mob is

| Mob | What it does |
| --- | --- |
| `soulkeepers:soul_keeper_trader` | Wandering-trader behaviour with a trade table selling gold, gold blocks, netherite scrap, netherite ingots and the two Keeper items. Takes damage at half rate from players. |
| `soulkeepers:soul_keeper_skeleton` | Archer. Flame + Infinity + Unbreaking III bow, full Protection IV netherite. |
| `soulkeepers:soul_keeper_zombie` | Bruiser. Sharpness V + Fire Aspect II netherite sword, full Protection IV netherite. |
| `soulkeepers:ashen_blaze` | Fires the `soulkeepers:wither_skull` projectile, which deals impact damage and triggers the wither effect. Full Protection IV netherite. |
| `soulkeepers:wither_skull` | The projectile. Not spawnable. |

The mob **behaviour, health, AI and loot are in the entity JSON**. The
**enchantments are applied by `scripts/keeper_gear.js`**, because Bedrock has no
declarative way to say "equip this, enchanted with that" in an entity file —
enchantments live on item NBT, and only the Script API can set them at spawn.
That is the one thing in this pack that is not plain JSON.

The **textures are generated**, by `bun run src/tools/make-pack-textures.ts`.
They are flat-shaded and deliberate rather than good pixel art; the point is
that the pack loads and the "green infected, dark Soul Keeper cloak" look
actually exists. To replace one with real art, drop a 64x64 PNG at the same path
and the validator will tell you it no longer matches the generator.

## Known gaps — read before assuming it works

**This has still never been loaded in Minecraft.** There is no client in the
build environment, so everything below is *verified against the documented
schema*, not verified in game.

- **The Ashen Blaze's wither skulls need the Custom Projectiles experimental
  toggle.** A custom projectile *entity* is gated behind that toggle, and a pack
  imported on a phone is exactly the situation where it is not switched on. The
  blaze has a melee attack as a fallback for that reason: without the toggle it
  is still a threat, it just does not throw skulls. Turn the toggle on in world
  settings to see it work as intended.
- **The Ashen Blaze uses the humanoid rig, not a bespoke blaze model.** Its
  texture is painted on `geometry.humanoid`'s UV layout, and swapping to a
  custom `.geo.json` would be unverifiable from here — a geometry the game
  rejects means an invisible mob. Swapping later is a one-line change in
  `ashen_blaze.ent.json` plus a geometry file.
- **The trade screen has not been seen opening on a custom entity.** The
  component shape is now the documented one (`table` pointing at a trade table
  file, `interactions` wrapping the interact fields), but whether the UI opens
  on a bespoke entity rather than an override of `minecraft:wandering_trader` is
  the part most likely to still need adjusting.

## What was wrong, and how it was found

Every one of these was a component or property that **does not exist**, so the
game silently ignored it. The pack parsed, the pack validated, and the mobs did
nothing:

- `minecraft:behavior.shoot` — not a component in any version. This is why the
  archer and the blaze never shot anything. A Bedrock mob fires via the
  `minecraft:shooter` **component**, which `minecraft:behavior.ranged_attack`
  then reads to learn what to fire.
- `minecraft:trade_table.table_id` / `.new_trades` — neither is a property of
  that component. There is no inline trade list; `table` is a *path* to a trade
  table file.
- `minecraft:interact` with `interact_text` / `use_item` / `interact_event` set
  directly on the component — all three belong inside an entry in
  `interactions`, and on the component itself they are dropped, which left the
  trader with no way to be interacted with at all.
- `minecraft:behavior.look_at_player.look_frequency`, `behavior.melee_attack.can_leap`,
  `equipment.reset_on_spawn` — properties that do not exist; the real one is
  `look_time`.
- `minecraft:behavior.walk_in_water` and `behavior.jump_avoiding_block` — not
  components.
- `minecraft:repairable` takes a `repair_items` array of
  `{ items, repair_amount }`, not a map of item id to `{ durability, repair_cost }`.
- `minecraft:equipment.table` pointed at `equipment/keeper_skeleton.json` and
  `equipment/keeper_zombie.json`, **which did not exist**.
- The trader's client entity declared a cloak geometry, material and texture
  that its single render controller never bound, so the cloak was never drawn.
- `minecraft:icon` pointed at texture keys that were not registered in
  `textures/item_texture.json` (which did not exist either).
- The wither skull projectile had a behaviour-pack entity and **no
  resource-pack one at all**.

These were found by auditing the pack against the community Bedrock JSON schema
(`Blockception/Minecraft-bedrock-json-schemas`) rather than by reading it, which
is why they are worth writing down: nothing about any of them is visible from
the file itself.

## What `validate:pack` checks now

`bun run validate:pack` — and it runs in `bun test` as well, via
`src/tools/pack.test.ts`, so a pack regression fails the normal test suite:

- every file parses, and every identifier obeys Bedrock's namespace rules;
- every `minecraft:` reference resolves in the real 1.26.51 dataset (this is
  what caught `minecraft:dark` being Java-only during development);
- **every `textures/...` path is a PNG that actually ships**;
- **every item icon is registered in `textures/item_texture.json`**;
- **every loot table, equipment table and trade table a component points at
  exists on disk**;
- **every render controller, animation, geometry, material and texture an entity
  names exists** — and, in the direction that actually bit this pack, **every
  geometry, material and texture an entity declares is bound by one of its
  render controllers**, so nothing can be declared and then silently never
  drawn;
- **every `soulkeepers:` reference resolves to something the pack declares**;
- **the shipped textures still match the generator**, so a hand-edited PNG is a
  deliberate act rather than an accident.
