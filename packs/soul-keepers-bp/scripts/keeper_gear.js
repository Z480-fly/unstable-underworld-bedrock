/**
 * Soul Keepers - gear script.
 *
 * Bedrock entity `minecraft:equipment` places *items*, but there is no
 * declarative way in an entity JSON to say "and that bow is Flame+Infinity,
 * and that chestplate is Protection IV". Enchantments live on item NBT, not
 * on the item definition, so they are applied here at spawn time.
 *
 * The mobs' behaviour, health, AI and loot all stay in the entity JSON - this
 * file only handles what JSON cannot express.
 */
import { Enchantment, EquipmentSlot, ItemStack, world } from "@minecraft/server";

/**
 * Apply enchantments to a stack, skipping any this game version does not
 * expose. Throwing inside an entitySpawn handler would break the mob, so a
 * missing enchantment is a downgrade, not a crash.
 */
function enchant(stack, map) {
  for (const [name, level] of Object.entries(map)) {
    const ench = Enchantment.get(name);
    if (!ench) continue;
    try {
      stack.enchant(ench, level);
    } catch {
      /* enchantment unavailable in this version - skip */
    }
  }
  return stack;
}

function equipProtection(entity) {
  const armor = [
    [EquipmentSlot.Head, "minecraft:netherite_helmet"],
    [EquipmentSlot.Chest, "minecraft:netherite_chestplate"],
    [EquipmentSlot.Legs, "minecraft:netherite_leggings"],
    [EquipmentSlot.Feet, "minecraft:netherite_boots"],
  ];
  for (const [slot, itemId] of armor) {
    const stack = enchant(new ItemStack(itemId, 1), { protection: 4 });
    entity.getComponent("minecraft:equippable")?.equip(slot, stack);
  }
}

function equipArcher(entity) {
  const bow = enchant(new ItemStack("minecraft:bow", 1), {
    flame: 1,
    infinity: 1,
    unbreaking: 3,
    knockback: 2,
  });
  entity.getComponent("minecraft:equippable")?.equip(EquipmentSlot.Mainhand, bow);
  equipProtection(entity);
}

function equipBruiser(entity) {
  const sword = enchant(new ItemStack("minecraft:netherite_sword", 1), {
    sharpness: 5,
    fire_aspect: 2,
    knockback: 2,
    unbreaking: 3,
  });
  entity.getComponent("minecraft:equippable")?.equip(EquipmentSlot.Mainhand, sword);
  equipProtection(entity);
}

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  switch (entity.typeId) {
    case "soulkeepers:soul_keeper_skeleton":
      equipArcher(entity);
      break;
    case "soulkeepers:soul_keeper_zombie":
      equipBruiser(entity);
      break;
    case "soulkeepers:ashen_blaze":
      equipProtection(entity);
      break;
    default:
      break;
  }
});
