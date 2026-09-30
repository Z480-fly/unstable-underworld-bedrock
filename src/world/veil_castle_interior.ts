/**
 * Veil Castle interior pass — rooms and a visual trading district.
 *
 * Fills the still-empty usable volumes of the surface palace without touching:
 * - the Y46 ground plate outside the castle mass
 * - causeway / piers / portal lobby
 * - undercroft (separate module, ceiling y45)
 * - existing great-hall pews, throne, wing bookshelves, rotunda dais
 *
 * All writes prefer `setIfAir` so shell geometry is never punched.
 *
 * --- VILLAGERS / TRADES (HARD LIMIT) ---
 * This generator is blocks-only. `World` has no entity buffer. `build.ts`
 * writes subchunks + Data3D + metadata only — no CHUNK_TAG.Entity (0x32)
 * payloads and no actor digests. Therefore:
 *   - REAL functional villagers: NOT supported
 *   - REAL functional trade offers: NOT supported
 *   - Trade-table JSON: not used by this LevelDB exporter
 * The trading district places vanilla workstations and stall geometry only.
 * Players can still trade if they bring or breed villagers later; the world
 * does not pre-seed them.
 */

import { AIR, P, type BlockState } from "./blocks.ts";
import type { World } from "./world.ts";
import { LEVEL, VEIL_COURT } from "./veil_castle.ts";

/** Matches veil_castle.ts palace constants (must stay in sync). */
const PALACE_X1 = -171;
const PALACE_X2 = -131;
const PALACE_Z1 = 98;
const PALACE_Z2 = 168;
const HALL_X1 = -169;
const HALL_X2 = -155;
const HALL_Z1 = 112;
const HALL_Z2 = 154;
const DRUM = { x: -146, z: 133, radius: 9 };

const PALE: BlockState = P.smoothQuartz;
const PALE_TRIM: BlockState = P.chiseledQuartz;
const WARM: BlockState = P.smoothSandstone;
const WARM_TRIM: BlockState = P.chiseledSandstone;
const CARPET: BlockState = P.purpleConcrete;
const CARPET_EDGE: BlockState = P.magentaConcrete;

/** Stall definition: workstation + label blocks for a profession corner. */
interface Stall {
  /** Short id for logs. */
  id: string;
  workstation: BlockState;
  goods: BlockState[];
}

/**
 * Visual profession stalls. Workstations are real vanilla blocks; no entities.
 * Ordered for deterministic placement along a wall.
 */
const TRADE_STALLS: Stall[] = [
  { id: "librarian", workstation: P.lectern, goods: [P.bookshelf, P.enchantingTable, P.bookshelf] },
  { id: "armorer", workstation: P.blastFurnace, goods: [P.ironBlock, P.anvil, P.chest] },
  { id: "toolsmith", workstation: P.smithingTable, goods: [P.craftingTable, P.chest, P.barrel] },
  { id: "weaponsmith", workstation: P.grindstone, goods: [P.anvil, P.ironBlock, P.chest] },
  { id: "cleric", workstation: P.brewingStand, goods: [P.barrel, P.bookshelf, P.chest] },
  { id: "fletcher", workstation: P.fletchingTable, goods: [P.barrel, P.chest, P.craftingTable] },
  { id: "farmer", workstation: P.composter, goods: [P.hayBlock, P.barrel, P.chest] },
  { id: "mason", workstation: P.stonecutter, goods: [P.chiseledQuartz, P.barrel, P.chest] },
  { id: "cartographer", workstation: P.cartographyTable, goods: [P.bookshelf, P.chest, P.lodestone] },
  { id: "leatherworker", workstation: P.cauldron, goods: [P.barrel, P.chest, P.craftingTable] },
  { id: "butcher", workstation: P.smoker, goods: [P.barrel, P.chest, P.furnace] },
  { id: "fisherman", workstation: P.barrel, goods: [P.cauldron, P.chest, P.barrel] },
  { id: "shepherd", workstation: P.loom, goods: [P.barrel, P.chest, P.whiteConcrete] },
];

function lamp(world: World, x: number, y: number, z: number): void {
  world.setIfAir(x, y, z, P.seaLantern);
}

/** One market stall: counter, workstation, goods shelves, marker carpet. */
function placeStall(
  world: World,
  x: number,
  z: number,
  facing: "north" | "south" | "east" | "west",
  stall: Stall,
  floorY: number,
): void {
  const y = floorY + 1;
  world.setIfAir(x, y, z, WARM_TRIM);
  world.setIfAir(x, y + 1, z, stall.workstation);

  const dx = facing === "east" ? 1 : facing === "west" ? -1 : 0;
  const dz = facing === "south" ? 1 : facing === "north" ? -1 : 0;
  for (let i = 0; i < stall.goods.length; i++) {
    const gx = x - dx + (dz !== 0 ? i - 1 : 0);
    const gz = z - dz + (dx !== 0 ? i - 1 : 0);
    world.setIfAir(gx, y, gz, stall.goods[i]!);
    world.setIfAir(gx, y + 1, gz, P.bookshelf);
  }
  world.setIfAir(x + dx, floorY, z + dz, CARPET);
  lamp(world, x, y + 3, z);
}

function tradingAndArchive(world: World): void {
  const floorY = LEVEL;
  const z1 = PALACE_Z1 + 4;
  const z2 = DRUM.z - DRUM.radius - 4;
  const xWall = DRUM.x - DRUM.radius + 2;
  const xInner = DRUM.x + DRUM.radius - 2;

  let archiveIdx = 0;
  for (let z = z1 + 2; z <= z2 - 2; z += 5) {
    world.setIfAir(xWall, floorY + 1, z, P.lectern);
    world.setIfAir(xWall, floorY + 1, z + 1, P.enchantingTable);
    world.setIfAir(xWall, floorY + 2, z, P.bookshelf);
    world.setIfAir(xWall, floorY + 2, z + 1, P.bookshelf);
    world.setIfAir(xWall + 1, floorY, z, CARPET_EDGE);
    archiveIdx++;
    if (archiveIdx % 2 === 0) lamp(world, xWall + 2, floorY + 4, z);
  }

  let si = 0;
  for (let z = z1 + 3; z <= z2 - 3 && si < TRADE_STALLS.length; z += 4) {
    placeStall(world, xInner, z, "west", TRADE_STALLS[si]!, floorY);
    si++;
  }
}

function armoryAndSmithy(world: World): void {
  const floorY = LEVEL;
  const z1 = DRUM.z + DRUM.radius + 4;
  const z2 = PALACE_Z2 - 4;
  const mid = Math.round((z1 + z2) / 2);
  const x1 = DRUM.x - DRUM.radius + 2;
  const x2 = DRUM.x + DRUM.radius - 2;

  world.setIfAir(DRUM.x, floorY + 1, mid, P.anvil);
  world.setIfAir(DRUM.x - 2, floorY + 1, mid, P.blastFurnace);
  world.setIfAir(DRUM.x + 2, floorY + 1, mid, P.grindstone);
  world.setIfAir(DRUM.x, floorY + 1, mid - 2, P.smithingTable);
  lamp(world, DRUM.x, floorY + 5, mid);

  for (let z = z1 + 2; z <= mid - 4; z += 3) {
    world.setIfAir(x1, floorY + 1, z, P.ironBars);
    world.setIfAir(x1, floorY + 2, z, P.ironBars);
    world.setIfAir(x1 + 1, floorY + 1, z, P.chest);
  }
  for (let z = mid + 4; z <= z2 - 2; z += 3) {
    world.setIfAir(x2, floorY + 1, z, P.ironBars);
    world.setIfAir(x2, floorY + 2, z, P.ironBars);
    world.setIfAir(x2 - 1, floorY + 1, z, P.barrel);
  }
}

function kitchen(world: World): void {
  const floorY = LEVEL;
  const x1 = DRUM.x + DRUM.radius + 2;
  const x2 = PALACE_X2 - 3;
  const z1 = DRUM.z + 2;
  const z2 = DRUM.z + 12;
  if (x2 <= x1 + 2) return;

  for (let z = z1; z <= z2; z++) {
    for (let x = x1; x <= x2; x++) {
      world.setIfAir(x, floorY, z, (x + z) % 2 === 0 ? WARM : P.smoothStone);
    }
  }
  world.setIfAir(x1 + 1, floorY + 1, z1 + 1, P.smoker);
  world.setIfAir(x1 + 2, floorY + 1, z1 + 1, P.furnace);
  world.setIfAir(x1 + 3, floorY + 1, z1 + 1, P.craftingTable);
  world.setIfAir(x1 + 4, floorY + 1, z1 + 1, P.cauldron);
  for (let x = x1 + 1; x <= Math.min(x2 - 1, x1 + 5); x++) {
    world.setIfAir(x, floorY + 1, z2 - 1, P.barrel);
    world.setIfAir(x, floorY + 2, z2 - 1, P.chest);
  }
  lamp(world, Math.round((x1 + x2) / 2), floorY + 4, Math.round((z1 + z2) / 2));
}

function treasury(world: World): void {
  const floorY = LEVEL;
  const x1 = DRUM.x + DRUM.radius + 2;
  const x2 = PALACE_X2 - 3;
  const z1 = DRUM.z - 12;
  const z2 = DRUM.z - 2;
  if (x2 <= x1 + 2) return;

  for (let z = z1; z <= z2; z++) {
    for (let x = x1; x <= x2; x++) {
      const edge = x === x1 || x === x2 || z === z1 || z === z2;
      world.setIfAir(x, floorY, z, edge ? WARM_TRIM : P.goldBlock);
      if (edge) {
        world.setIfAir(x, floorY + 1, z, P.ironBars);
        world.setIfAir(x, floorY + 2, z, P.ironBars);
      }
    }
  }
  const midZ = Math.round((z1 + z2) / 2);
  world.set(x1, floorY + 1, midZ, AIR);
  world.set(x1, floorY + 2, midZ, AIR);
  world.setIfAir(x1 + 2, floorY + 1, midZ, P.chest);
  world.setIfAir(x1 + 3, floorY + 1, midZ, P.chest);
  world.setIfAir(x1 + 2, floorY + 1, midZ + 1, P.netheriteBlock);
  lamp(world, x1 + 3, floorY + 3, midZ);
}

function barracks(world: World): void {
  const floorY = LEVEL;
  const x1 = HALL_X2 + 2;
  const x2 = DRUM.x - DRUM.radius - 2;
  const z1 = HALL_Z1 + 2;
  const z2 = HALL_Z1 + 10;
  if (x2 <= x1 + 1) return;

  for (let z = z1; z <= z2; z += 3) {
    for (let x = x1; x <= x2; x += 3) {
      world.setIfAir(x, floorY + 1, z, CARPET);
      world.setIfAir(x, floorY + 1, z + 1, CARPET_EDGE);
      world.setIfAir(x, floorY + 2, z, WARM_TRIM);
      world.setIfAir(x + 1, floorY + 1, z, P.chest);
    }
  }
  lamp(world, Math.round((x1 + x2) / 2), floorY + 4, Math.round((z1 + z2) / 2));
}

function councilAnnex(world: World): void {
  const floorY = LEVEL;
  const mid = Math.round((HALL_Z1 + HALL_Z2) / 2);
  const cx = HALL_X1 + 4;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = 0; dx <= 2; dx++) {
      world.setIfAir(cx + dx, floorY + 1, mid + dz, P.darkOakPlanks);
    }
  }
  for (const dz of [-3, 3]) {
    for (let dx = 0; dx <= 2; dx++) {
      world.setIfAir(cx + dx, floorY + 1, mid + dz, P.darkOakSlab);
    }
  }
  world.setIfAir(cx + 1, floorY + 2, mid, P.seaLantern);
}

/**
 * Main entry: surface Veil Castle interior enrichment.
 * Call after `furnishRotunda` / wing doors so shells exist.
 */
export function buildVeilCastleInterior(world: World): void {
  tradingAndArchive(world);
  armoryAndSmithy(world);
  kitchen(world);
  treasury(world);
  barracks(world);
  councilAnnex(world);

  world.protect(DRUM.x, VEIL_COURT.z, 28);
  world.protect(Math.round((PALACE_X1 + PALACE_X2) / 2), VEIL_COURT.z, 40);
}
