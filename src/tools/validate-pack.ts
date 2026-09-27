/**
 * Validate the Soul Keepers pack against the real Bedrock 1.26.51 block/item
 * dataset shipped by minecraft-data.
 *
 * The pack is JSON, and JSON that parses is not the same as JSON the game
 * will accept. The three ways this pack could be silently wrong are:
 *
 *  1. a malformed file (caught by JSON.parse),
 *  2. an identifier that violates Bedrock's namespace rules, and
 *  3. a reference to a block/item that does not exist in 1.26.51 - the exact
 *     failure mode that hit the map generator, where `dark` looked plausible
 *     but is a Java-only block with no Bedrock equivalent.
 *
 * None of that is catchable by eyeballing the files, so it is checked here.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import mcDataLoader from "minecraft-data";

interface BlockDefinition {
  name: string;
  states?: Record<string, unknown> | Array<{ name: string; values?: unknown }>;
}

function loadBedrockData(): {
  blocksByName: Record<string, BlockDefinition>;
  itemsByName: Record<string, unknown>;
  version: string;
} {
  const versions = (mcDataLoader as unknown as { supportedVersions: { bedrock: string[] } }).supportedVersions;
  const candidates = [...new Set([...versions.bedrock].reverse())];
  for (const version of candidates) {
    try {
      const data = mcDataLoader(`bedrock_${version}` as never) as unknown as {
        blocksByName: Record<string, BlockDefinition>;
        itemsByName: Record<string, unknown>;
      };
      if (data && data.blocksByName) {
        return { ...data, version };
      }
    } catch {
      // try the next version
    }
  }
  throw new Error("no bedrock data available in minecraft-data");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const problems: string[] = [];
const data = loadBedrockData();
const blockNames = new Set(Object.keys(data.blocksByName));
const itemNames = new Set(Object.keys(data.itemsByName));

// Some `minecraft:` strings in a pack are *events*, not items or blocks
// (e.g. `minecraft:wither_on_hit` inside a projectile definition). They are
// valid but do not appear in either dataset, so they are listed here rather
// than weakening the check into uselessness.
const KNOWN_EVENTS = new Set([
  "minecraft:wither_on_hit",
  "minecraft:on_damage",
  "minecraft:entity_spawned",
  "minecraft:damage",
  "minecraft:on_use",
  "minecraft:tick",
]);

// Collect every soulkeepers: identifier declared anywhere, so cross-file
// references can be checked against what actually exists.
const declared = new Set<string>();
const jsonFiles = [
  ...walk("packs/soul-keepers-bp"),
  ...walk("packs/soul-keepers-rp"),
].filter((f) => f.endsWith(".json") || f.endsWith(".ent.json"));

for (const file of jsonFiles) {
  let parsed: any;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    problems.push(`${file}: invalid JSON - ${(error as Error).message}`);
    continue;
  }
  // harvest identifiers
  const stack: unknown[] = [parsed];
  while (stack.length) {
    const node = stack.pop();
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "identifier" && typeof v === "string") declared.add(v);
        stack.push(v);
      }
    }
  }

  // Any *string value* anywhere in the file that looks like a minecraft:
  // reference must resolve to something 1.26.51 actually has. This is
  // deliberately broader than "item"/"name" keys: the `dark` block bug that
  // hit the map generator was a bare block name in a component, and a
  // key-specific check would have sailed straight past it.
  const stack2: unknown[] = [parsed];
  while (stack2.length) {
    const node = stack2.pop();
    if (typeof node === "string") {
      if (node.startsWith("minecraft:")) {
        const bare = node.slice("minecraft:".length);
        if (bare && !itemNames.has(bare) && !blockNames.has(bare) && !KNOWN_EVENTS.has(node)) {
          problems.push(`${file}: references ${node}, which is not a Bedrock ${data.version} item or block`);
        }
      }
    } else if (Array.isArray(node)) {
      stack2.push(...node);
    } else if (node && typeof node === "object") {
      stack2.push(...Object.values(node as Record<string, unknown>));
    }
  }
}

// namespace + identifier rules
for (const id of declared) {
  if (!/^[a-z0-9_.]+:[a-z0-9_./]+$/.test(id)) {
    problems.push(`identifier "${id}" is not a valid Bedrock identifier (lowercase, colon-namespaced)`);
  }
  const [ns] = id.split(":");
  if (ns !== "soulkeepers" && ns !== "minecraft") {
    problems.push(`identifier "${id}" uses unexpected namespace "${ns}"`);
  }
}

// -- cross-file references --------------------------------------------------
//
// Everything above checks that files parse and that ids are well formed. What
// it cannot check is the failure mode that actually kept this pack from
// working: a file that names something which is not there. A client entity
// pointing at a texture that does not exist, an icon key that was never
// registered, an equipment table that was referenced and never written, a
// render controller that cannot see the second material it is bound to. None of
// those are syntax errors. The game loads the pack, and the player gets a
// pink-and-black checker or a mob that will not shoot.

const BP = "packs/soul-keepers-bp";
const RP = "packs/soul-keepers-rp";

/** Every PNG the resource pack actually ships, as a path without extension. */
const shippedTextures = new Set<string>();
for (const file of walk(RP)) {
  if (!file.endsWith(".png")) continue;
  shippedTextures.add(file.slice(RP.length + 1, -4).split("\\").join("/"));
}

// Vanilla geometry and material names a client entity may legitimately use.
// Anything outside these has to be defined by the pack.
const VANILLA_GEOMETRY = new Set([
  "geometry.humanoid",
  "geometry.humanoid.armor",
  "geometry.item_sprite",
  "geometry.player_cape",
  "geometry.blob",
  "geometry.pig_slim",
  "geometry.quad",
  "geometry.skeleton",
  "geometry.zombie",
  "geometry.villager",
  "geometry.villager_v2",
  "geometry.creeper",
]);
const VANILLA_MATERIALS = new Set([
  "entity_alphatest",
  "entity_alphatest.emissive",
  "entity_emissive",
  "entity_emissive_alpha",
  "entity_emissive_alpha.emissive",
  "entity_silk",
  "entity_solid",
  "particles_alpha",
]);

/** Render controller and animation names the pack defines. */
const definedRenderControllers = new Set<string>();
const definedAnimations = new Set<string>();
const allRenderControllers = new Map<string, any>();
for (const file of jsonFiles) {
  let parsed: any;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    continue; // already reported above
  }
  for (const [name, body] of Object.entries<any>(parsed?.render_controllers ?? {})) {
    definedRenderControllers.add(name);
    allRenderControllers.set(name, body);
  }
  for (const name of Object.keys(parsed?.animations ?? {})) definedAnimations.add(name);
}

/** Texture keys declared in textures/item_texture.json, which icons point at. */
const declaredItemTextureKeys = new Set<string>();
const itemTexturePath = join(RP, "textures", "item_texture.json");
if (existsSync(itemTexturePath)) {
  const atlas = JSON.parse(readFileSync(itemTexturePath, "utf8"));
  for (const key of Object.keys(atlas?.texture_data ?? {})) declaredItemTextureKeys.add(key);
} else {
  problems.push(`${itemTexturePath}: missing - every custom item icon resolves through this file`);
}

/** Entity event and component-group names, which are identifiers too. */
for (const file of jsonFiles) {
  let parsed: any;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    continue;
  }
  // NB: the key is literally "minecraft:entity", not `minecraft`.entity.
  const entity = parsed?.["minecraft:entity"];
  for (const name of Object.keys(entity?.events ?? {})) declared.add(name);
  for (const name of Object.keys(entity?.component_groups ?? {})) declared.add(name);
}

for (const file of jsonFiles) {
  let parsed: any;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    continue;
  }
  const isRp = file.startsWith(RP);

  // 1. every textures/... path must be a PNG that ships
  const walkStrings = (node: unknown, visit: (value: string, key: string) => void): void => {
    if (typeof node === "string") return;
    if (Array.isArray(node)) {
      for (const v of node) walkStrings(v, visit);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (typeof v === "string") visit(v, k);
        else walkStrings(v, visit);
      }
    }
  };

  walkStrings(parsed, (value, key) => {
    if (key === "identifier") return;
    if (isRp && value.startsWith("textures/") && !value.includes(":")) {
      if (!shippedTextures.has(value)) {
        problems.push(`${file}: references ${value} but no such PNG ships in the resource pack`);
      }
      return;
    }
    // 2. an item icon key must be registered in the item texture atlas
    if (key === "textures" && typeof value === "string") {
      // handled below via the icon shape; this catches the flat string form
    }
    // 3. client entities must only use render controllers and animations that exist
    if (key === "render_controllers" && Array.isArray(value)) {
      for (const name of value as string[]) {
        if (!definedRenderControllers.has(name)) {
          problems.push(`${file}: uses render controller ${name}, which the pack never defines`);
        }
      }
    }
    // 4. render controllers reference `Geometry.x` / `Material.x` / `Texture.x`,
    //    which are *keys into the entity's own dicts*, not literal names. They
    //    are checked per entity below, where the entity is in hand.
  });

  // 5. an animation an entity plays must be defined
  const animations = parsed?.["minecraft:client_entity"]?.description?.animations;
  if (animations && typeof animations === "object") {
    for (const name of Object.values(animations) as string[]) {
      if (!definedAnimations.has(name)) {
        problems.push(`${file}: plays animation ${name}, which the pack never defines`);
      }
    }
  }

  // 6. a render controller's Geometry./Texture./Material. keys must exist on the entity
  const desc = parsed?.["minecraft:client_entity"]?.description;
  if (desc) {
    const textureKeys = new Set(Object.keys(desc.textures ?? {}));
    const materialKeys = new Set(Object.keys(desc.materials ?? {}));
    const geometryKeys = new Set(Object.keys(desc.geometry ?? {}));
    // every geometry the entity names must itself be real
    for (const name of Object.values(desc.geometry ?? {}) as string[]) {
      if (VANILLA_GEOMETRY.has(name)) continue;
      if (name.startsWith("geometry.soulkeepers")) continue;
      problems.push(`${file}: geometry "${name}" is neither a known vanilla model nor one the pack defines`);
    }
    for (const name of Object.values(desc.materials ?? {}) as string[]) {
      if (VANILLA_MATERIALS.has(name)) continue;
      if (name.startsWith("material.soulkeepers")) continue;
      problems.push(`${file}: material "${name}" is neither a known vanilla material nor one the pack defines`);
    }
    for (const [rcName, rc] of allRenderControllers.entries()) {
      if (!(desc.render_controllers ?? []).includes(rcName)) continue;
      for (const entry of rc?.textures ?? []) {
        const key = String(entry).replace(/^Texture\./, "");
        if (!textureKeys.has(key)) {
          problems.push(
            `${file}: render controller ${rcName} binds ${entry} but the entity defines no such texture`,
          );
        }
      }
      // `materials` is an array of bone-selector maps, e.g. [{ "*": "Material.default" }],
      // not an array of names - so flatten each entry's values.
      for (const entry of rc?.materials ?? []) {
        const names = entry && typeof entry === "object" && !Array.isArray(entry)
          ? (Object.values(entry) as string[])
          : [String(entry)];
        for (const m of names) {
          const key = m.replace(/^Material\./, "");
          if (!materialKeys.has(key)) {
            problems.push(
              `${file}: render controller ${rcName} binds ${m} but the entity defines no such material`,
            );
          }
        }
      }
      const rcGeometry = typeof rc?.geometry === "string" ? [rc.geometry] : Object.values(rc?.geometry ?? {}) as string[];
      for (const entry of rcGeometry) {
        const key = String(entry).replace(/^Geometry\./, "");
        if (!geometryKeys.has(key)) {
          problems.push(
            `${file}: render controller ${rcName} binds ${entry} but the entity defines no such geometry`,
          );
        }
      }
    }

    // ...and the reverse direction, which is the one that actually bit this
    // pack. The trader's client entity declared a second geometry, a second
    // material and a second texture for its cloak, and its single render
    // controller bound none of them - so the Keepers' eye on its back was
    // never drawn. Nothing errors in that situation; the cloak is simply
    // invisible. So every key an entity declares must be claimed by a
    // controller the entity actually uses.
    const usedControllers = new Set<string>(desc.render_controllers ?? []);
    const claimed = { geometry: new Set<string>(), materials: new Set<string>(), textures: new Set<string>() };
    for (const rcName of usedControllers) {
      const rc = allRenderControllers.get(rcName);
      if (!rc) continue;
      const geometries = typeof rc.geometry === "string" ? [rc.geometry] : Object.values(rc.geometry ?? {}) as string[];
      for (const g of geometries) claimed.geometry.add(String(g).replace(/^Geometry\./, ""));
      for (const entry of rc.materials ?? []) {
        const names = entry && typeof entry === "object" && !Array.isArray(entry)
          ? (Object.values(entry) as string[])
          : [String(entry)];
        for (const m of names) claimed.materials.add(m.replace(/^Material\./, ""));
      }
      for (const t of rc.textures ?? []) claimed.textures.add(String(t).replace(/^Texture\./, ""));
    }
    for (const [kind, keys, claimedKeys] of [
      ["geometry", geometryKeys, claimed.geometry],
      ["material", materialKeys, claimed.materials],
      ["texture", textureKeys, claimed.textures],
    ] as const) {
      for (const key of keys) {
        if (!claimedKeys.has(key)) {
          problems.push(
            `${file}: declares a ${kind} called "${key}" that none of its render controllers bind, so it is never drawn`,
          );
        }
      }
    }
  }

  // 7. a component that points at a *file* must point at one that exists
  const pathRefs: Array<[string, string]> = [];
  const entityComponents = parsed?.["minecraft:entity"]?.components ?? {};
  const loot = entityComponents["minecraft:loot"];
  if (loot?.table && typeof loot.table === "string") pathRefs.push(["minecraft:loot.table", loot.table]);
  const equip = entityComponents["minecraft:equipment"];
  if (equip?.table && typeof equip.table === "string" && equip.table.includes("/")) {
    pathRefs.push(["minecraft:equipment.table", equip.table]);
  }
  const trade = entityComponents["minecraft:trade_table"];
  if (trade?.table && typeof trade.table === "string" && trade.table.includes("/")) {
    pathRefs.push(["minecraft:trade_table.table", trade.table]);
  }
  for (const [where, value] of pathRefs) {
    if (!existsSync(join(BP, value))) {
      problems.push(`${file}: ${where} points at ${value}, which does not exist in the behaviour pack`);
    }
  }

  // 8. item icons: minecraft:icon names a texture key from the atlas
  const icon = parsed?.["minecraft:item"]?.components?.["minecraft:icon"];
  const iconKeys: string[] = [];
  if (typeof icon === "string") iconKeys.push(icon);
  else if (icon?.textures) {
    for (const v of Object.values(icon.textures) as string[]) iconKeys.push(v);
  }
  for (const key of iconKeys) {
    if (!key.startsWith("soulkeepers:")) continue;
    if (!declaredItemTextureKeys.has(key)) {
      problems.push(
        `${file}: icon ${key} is not declared in textures/item_texture.json, so the item has no icon`,
      );
    }
  }

  // 9. anything else in our own namespace must be something the pack declares
  walkStrings(parsed, (value) => {
    if (!value.startsWith("soulkeepers:")) return;
    if (iconKeys.includes(value)) return;
    if (!declared.has(value)) {
      problems.push(`${file}: references ${value}, which the pack never declares`);
    }
  });
}

// 10. the textures the generator draws must still match it
try {
  const drift = Bun.spawnSync({
    cmd: ["bun", "run", "src/tools/make-pack-textures.ts", "--check"],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (drift.exitCode !== 0) {
    problems.push(
      `pack textures have drifted from src/tools/make-pack-textures.ts:\n${drift.stderr.toString().trim()}`,
    );
  }
} catch (error) {
  problems.push(`could not run the texture drift check: ${(error as Error).message}`);
}

// manifest cross-check: BP must depend on the RP and vice versa is not required
for (const [pack, expect, other] of [
  ["packs/soul-keepers-bp/manifest.json", "data", "Soul Keepers Resources"],
  ["packs/soul-keepers-rp/manifest.json", "resources", "Soul Keepers"],
] as const) {
  const manifest = JSON.parse(readFileSync(pack, "utf8"));
  if (!manifest.header?.uuid) problems.push(`${pack}: no header.uuid`);
  if (!manifest.header?.version) problems.push(`${pack}: no header.version`);
  if (manifest.header?.["min_engine_version"]?.[0] !== 1) {
    problems.push(`${pack}: min_engine_version should target 1.x`);
  }
  const types = (manifest.modules ?? []).map((m: { type: string }) => m.type);
  if (!types.includes(expect)) problems.push(`${pack}: expected a "${expect}" module, found ${types.join(", ")}`);
  // The name is what the player reads in Settings, so it has to be a real name
  // and the two packs have to be tellable apart: two identically named packs
  // read as one, and the wrong one enabled shows up as "nothing happens".
  const name: string = manifest.header?.name ?? "";
  if (name.length < 3 || name === pack || name.toLowerCase().includes("pack.name")) {
    problems.push(`${pack}: header.name looks like a placeholder (${JSON.stringify(name)})`);
  }
  if (name === other) problems.push(`${pack}: header.name "${name}" is the same as the other pack's`);
}

// header.name and the lang file have to agree, or the pack list and the pack
// screen disagree about what the pack is called.
{
  const rp = JSON.parse(readFileSync("packs/soul-keepers-rp/manifest.json", "utf8"));
  const lang = readFileSync("packs/soul-keepers-rp/texts/en_US.lang", "utf8");
  const declared = /^pack\.name=(.*)$/m.exec(lang)?.[1]?.trim();
  if (declared !== rp.header?.name) {
    problems.push(
      `packs/soul-keepers-rp: texts/en_US.lang says pack.name=${JSON.stringify(declared)} but the manifest says ${JSON.stringify(rp.header?.name)}`,
    );
  }
}

console.log(`bedrock version: ${data.version}`);
console.log(`checked ${jsonFiles.length} pack JSON files, ${declared.size} identifiers`);
if (problems.length) {
  for (const p of problems) console.error(`  !! ${p}`);
  console.error(`pack validation FAILED with ${problems.length} problem(s)`);
  process.exit(1);
}
console.log("pack OK");
