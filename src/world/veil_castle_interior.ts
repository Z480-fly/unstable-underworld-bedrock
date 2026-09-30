/**
 * Veil Castle interior — V1 + V2.
 *
 * V1: trading/archive, armory/smithy, kitchen, treasury, barracks, council.
 * V2: royal quarters, expanded library, dining, kitchen complex, military
 *     quarter, war room, expanded treasury, staff areas, guest suites,
 *     ceremonial Eye chambers, service passages. Prison omitted (would
 *     collide with undercroft — do not dig below Y46).
 *
 * Blocks only. No entities, villagers, or trades.
 *
 * Geometry constants match veil_castle.ts (keep in sync until exported).
 * Decorative writes use setIfAir unless intentionally opening a doorway.
 */

import { AIR, P, type BlockState } from "./blocks.ts";
import type { World } from "./world.ts";
import { LEVEL, VEIL_COURT } from "./veil_castle.ts";

/** Same values as veil_castle.ts (not yet exported there — keep in sync). */
const PALACE_X1 = -171;
const PALACE_X2 = -131;
const PALACE_Z1 = 98;
const PALACE_Z2 = 168;
const HALL_X1 = -169;
const HALL_X2 = -155;
const HALL_Z1 = 112;
const HALL_Z2 = 154;
const DRUM = { x: -146, z: 133, radius: 9 };

const WARM: BlockState = P.smoothSandstone;
const WARM_TRIM: BlockState = P.chiseledSandstone;
const CARPET: BlockState = P.purpleConcrete;
const CARPET_EDGE: BlockState = P.magentaConcrete;

function lamp(world: World, x: number, y: number, z: number): void {
  world.setIfAir(x, y, z, P.seaLantern);
}

function carpetSpot(world: World, x: number, z: number, y: number = LEVEL): void {
  world.setIfAir(x, y, z, CARPET);
}

function table(world: World, x: number, z: number, w: number, d: number, y: number = LEVEL + 1): void {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      world.setIfAir(x + dx, y, z + dz, P.darkOakPlanks);
      if ((dx === 0 || dx === w - 1) && (dz === 0 || dz === d - 1)) {
        world.setIfAir(x + dx, y - 1, z + dz, P.darkOakFence);
      }
    }
  }
}

function bookWall(world: World, x: number, z: number, height: number, y0: number = LEVEL + 1): void {
  for (let h = 0; h < height; h++) world.setIfAir(x, y0 + h, z, P.bookshelf);
}

function bedPad(world: World, x: number, z: number, y: number = LEVEL + 1): void {
  world.setIfAir(x, y, z, CARPET);
  world.setIfAir(x, y, z + 1, CARPET_EDGE);
  world.setIfAir(x, y + 1, z, WARM_TRIM);
  world.setIfAir(x + 1, y, z, P.chest);
}

interface Stall {
  id: string;
  workstation: BlockState;
  goods: BlockState[];
}

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

function kitchenV1(world: World): void {
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

function treasuryV1(world: World): void {
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

function barracksV1(world: World): void {
  const floorY = LEVEL;
  const x1 = HALL_X2 + 2;
  const x2 = DRUM.x - DRUM.radius - 2;
  const z1 = HALL_Z1 + 2;
  const z2 = HALL_Z1 + 10;
  if (x2 <= x1 + 1) return;
  for (let z = z1; z <= z2; z += 3) {
    for (let x = x1; x <= x2; x += 3) {
      bedPad(world, x, z, floorY + 1);
    }
  }
  lamp(world, Math.round((x1 + x2) / 2), floorY + 4, Math.round((z1 + z2) / 2));
}

function councilV1(world: World): void {
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

function grandLibraryV2(world: World): void {
  const z1 = PALACE_Z1 + 5;
  const z2 = DRUM.z - DRUM.radius - 5;
  const cx = DRUM.x;
  for (let z = z1 + 3; z <= z2 - 3; z += 6) {
    table(world, cx - 1, z, 3, 2);
    world.setIfAir(cx, LEVEL + 2, z, P.lectern);
    lamp(world, cx, LEVEL + 5, z);
  }
  for (let z = z1 + 1; z <= z2 - 1; z += 3) {
    bookWall(world, cx - 4, z, 3);
    bookWall(world, cx + 4, z, 3);
  }
  for (const z of [z1 + 1, z2 - 2]) {
    world.setIfAir(cx - 5, LEVEL + 1, z, P.enchantingTable);
    world.setIfAir(cx + 5, LEVEL + 1, z, P.bookshelf);
    world.setIfAir(cx + 5, LEVEL + 2, z, P.bookshelf);
    carpetSpot(world, cx, z);
  }
}

function diningHallV2(world: World): void {
  const z1 = DRUM.z + DRUM.radius + 5;
  const z2 = PALACE_Z2 - 6;
  const cx = DRUM.x;
  const mid = Math.round((z1 + z2) / 2);
  table(world, cx - 3, z1 + 2, 7, 2);
  for (let dx = -3; dx <= 3; dx++) {
    world.setIfAir(cx + dx, LEVEL + 1, z1 + 4, P.darkOakSlab);
  }
  lamp(world, cx, LEVEL + 6, z1 + 3);
  for (const tz of [mid - 3, mid + 3, z2 - 4]) {
    table(world, cx - 5, tz, 2, 3);
    table(world, cx + 4, tz, 2, 3);
  }
  for (let z = mid - 2; z <= mid + 2; z++) {
    world.setIfAir(cx + 6, LEVEL + 1, z, WARM_TRIM);
    world.setIfAir(cx + 6, LEVEL + 2, z, P.barrel);
  }
}

function kitchenComplexV2(world: World): void {
  const x1 = DRUM.x + DRUM.radius + 2;
  const x2 = PALACE_X2 - 3;
  if (x2 <= x1 + 2) return;
  const z1 = DRUM.z + 13;
  const z2 = DRUM.z + 18;
  for (let z = z1; z <= z2; z++) {
    for (let x = x1; x <= Math.min(x1 + 6, x2); x++) {
      world.setIfAir(x, LEVEL, z, (x + z) % 2 === 0 ? WARM : P.smoothStone);
    }
  }
  world.setIfAir(x1 + 1, LEVEL + 1, z1 + 1, P.craftingTable);
  world.setIfAir(x1 + 2, LEVEL + 1, z1 + 1, P.smoker);
  world.setIfAir(x1 + 3, LEVEL + 1, z1 + 1, P.cauldron);
  for (let x = x1 + 1; x <= x1 + 4; x++) {
    world.setIfAir(x, LEVEL + 1, z2 - 1, P.barrel);
  }
  lamp(world, x1 + 2, LEVEL + 4, z1 + 2);
  for (let x = DRUM.x + 2; x <= x1; x += 2) {
    carpetSpot(world, x, DRUM.z + 10);
  }
}

function militaryQuarterV2(world: World): void {
  const z1 = DRUM.z + DRUM.radius + 4;
  const z2 = PALACE_Z2 - 4;
  const mid = Math.round((z1 + z2) / 2);
  const x1 = DRUM.x - DRUM.radius + 2;
  table(world, x1 + 1, z2 - 5, 3, 2);
  world.setIfAir(x1 + 2, LEVEL + 2, z2 - 4, P.lectern);
  world.setIfAir(x1 + 1, LEVEL + 1, z2 - 6, P.chest);
  lamp(world, x1 + 2, LEVEL + 4, z2 - 5);
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = 0; dx <= 3; dx++) {
      world.setIfAir(x1 + dx, LEVEL, mid + 6 + dz, CARPET_EDGE);
    }
  }
  for (let z = mid - 2; z <= mid + 2; z += 2) {
    world.setIfAir(x1, LEVEL + 1, z, P.barrel);
    world.setIfAir(x1, LEVEL + 2, z, P.barrel);
  }
}

function warRoomV2(world: World): void {
  const mid = Math.round((HALL_Z1 + HALL_Z2) / 2);
  const cx = HALL_X1 + 8;
  table(world, cx, mid - 2, 5, 5);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = 1; dx <= 3; dx++) {
      world.setIfAir(cx + dx, LEVEL + 2, mid + dz, (dx + dz) % 2 === 0 ? P.greenGlass : P.blackGlass);
    }
  }
  world.setIfAir(cx + 2, LEVEL + 3, mid, P.lodestone);
  lamp(world, cx + 2, LEVEL + 5, mid);
  bookWall(world, cx - 1, mid - 3, 2);
  bookWall(world, cx + 5, mid + 3, 2);
}

function treasuryV2(world: World): void {
  const x1 = DRUM.x + DRUM.radius + 2;
  const x2 = PALACE_X2 - 3;
  if (x2 <= x1 + 2) return;
  const z1 = DRUM.z - 18;
  const z2 = DRUM.z - 13;
  if (z1 < PALACE_Z1 + 3) return;
  for (let z = z1; z <= z2; z++) {
    for (let x = x1; x <= Math.min(x1 + 5, x2); x++) {
      const edge = x === x1 || x === Math.min(x1 + 5, x2) || z === z1 || z === z2;
      world.setIfAir(x, LEVEL, z, edge ? WARM_TRIM : P.ironBlock);
      if (edge) world.setIfAir(x, LEVEL + 1, z, P.ironBars);
    }
  }
  const mz = Math.round((z1 + z2) / 2);
  world.set(x1, LEVEL + 1, mz, AIR);
  world.setIfAir(x1 + 2, LEVEL + 1, mz, P.chest);
  world.setIfAir(x1 + 3, LEVEL + 1, mz, P.barrel);
  table(world, x1 + 1, z2 + 1, 2, 1);
  world.setIfAir(x1 + 1, LEVEL + 2, z2 + 1, P.seaLantern);
}

function royalQuartersV2(world: World): void {
  const x1 = DRUM.x + DRUM.radius + 2;
  const x2 = PALACE_X2 - 4;
  if (x2 <= x1 + 3) return;
  const za0 = DRUM.z - 28;
  const za1 = DRUM.z - 22;
  if (za0 > PALACE_Z1 + 2) {
    for (let z = za0; z <= za1; z++) {
      for (let x = x1; x <= x1 + 5; x++) carpetSpot(world, x, z);
    }
    bedPad(world, x1 + 1, za0 + 1);
    bedPad(world, x1 + 3, za0 + 1);
    table(world, x1 + 1, za1 - 1, 3, 1);
    bookWall(world, x1 + 5, za0 + 2, 3);
    bookWall(world, x1 + 5, za0 + 4, 3);
    lamp(world, x1 + 2, LEVEL + 4, za0 + 3);
  }
  const zb0 = DRUM.z - 21;
  if (zb0 > PALACE_Z1 + 2) {
    table(world, x1 + 1, zb0 + 1, 3, 2);
    world.setIfAir(x1 + 2, LEVEL + 2, zb0 + 1, P.lectern);
    bookWall(world, x1 + 5, zb0 + 1, 3);
    bookWall(world, x1 + 5, zb0 + 3, 3);
    lamp(world, x1 + 2, LEVEL + 4, zb0 + 2);
  }
  const zg0 = DRUM.z + 20;
  const zg1 = DRUM.z + 24;
  if (zg1 < PALACE_Z2 - 2) {
    for (let z = zg0; z <= zg1; z++) {
      for (let x = x1; x <= x1 + 4; x++) carpetSpot(world, x, z);
    }
    bedPad(world, x1 + 1, zg0 + 1);
    table(world, x1 + 1, zg1 - 1, 2, 1);
    lamp(world, x1 + 2, LEVEL + 4, zg0 + 2);
  }
}

function staffAreasV2(world: World): void {
  const x1 = HALL_X2 + 2;
  const x2 = DRUM.x - DRUM.radius - 2;
  if (x2 <= x1 + 1) return;
  const z1 = HALL_Z1 + 12;
  const z2 = HALL_Z1 + 18;
  for (let z = z1; z <= z2; z += 3) {
    for (let x = x1; x <= x2; x += 3) {
      bedPad(world, x, z);
    }
  }
  for (let x = x1; x <= x2; x += 2) {
    world.setIfAir(x, LEVEL + 1, z2 + 1, P.barrel);
  }
  lamp(world, Math.round((x1 + x2) / 2), LEVEL + 4, z1 + 3);
}

function guestQuartersV2(world: World): void {
  const x1 = DRUM.x + DRUM.radius + 2;
  const x2 = Math.min(x1 + 5, PALACE_X2 - 3);
  const z0 = DRUM.z + 25;
  const z1 = DRUM.z + 29;
  if (z1 >= PALACE_Z2 - 2 || x2 <= x1 + 2) return;
  for (let z = z0; z <= z1; z++) {
    for (let x = x1; x <= x2; x++) carpetSpot(world, x, z);
  }
  bedPad(world, x1 + 1, z0 + 1);
  table(world, x1 + 1, z1 - 1, 2, 1);
  bookWall(world, x2, z0 + 2, 2);
  lamp(world, x1 + 2, LEVEL + 4, z0 + 2);
}

function eyeChambersV2(world: World): void {
  const cx = HALL_X2 - 2;
  const z = HALL_Z1 + 8;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 0; dx++) {
      world.setIfAir(cx + dx, LEVEL, z + dz, P.blackGlass);
    }
  }
  world.setIfAir(cx - 1, LEVEL + 1, z, P.seaLantern);
  world.setIfAir(cx - 1, LEVEL + 2, z, P.greenGlass);
  lamp(world, cx, LEVEL + 4, z);
  const sx = DRUM.x;
  const sz = DRUM.z + DRUM.radius + 1;
  world.setIfAir(sx, LEVEL + 1, sz, P.obsidian);
  world.setIfAir(sx, LEVEL + 2, sz, P.greenGlass);
  world.setIfAir(sx, LEVEL + 3, sz, P.seaLantern);
  carpetSpot(world, sx - 1, sz);
  carpetSpot(world, sx + 1, sz);
}

function servicePassagesV2(world: World): void {
  const x = DRUM.x + DRUM.radius + 1;
  for (let z = DRUM.z - 10; z <= DRUM.z + 10; z += 2) {
    carpetSpot(world, x, z);
  }
  for (let z = PALACE_Z1 + 6; z <= PALACE_Z2 - 6; z += 4) {
    if (Math.abs(z - DRUM.z) < DRUM.radius) continue;
    carpetSpot(world, DRUM.x + DRUM.radius - 1, z);
  }
}

function corridorDetailV2(world: World): void {
  for (let z = PALACE_Z1 + 8; z < DRUM.z - DRUM.radius - 4; z += 8) {
    world.setIfAir(DRUM.x - 3, LEVEL + 1, z, P.quartzPillar);
    world.setIfAir(DRUM.x - 3, LEVEL + 2, z, P.quartzPillar);
    world.setIfAir(DRUM.x + 3, LEVEL + 1, z, P.quartzPillar);
    world.setIfAir(DRUM.x + 3, LEVEL + 2, z, P.quartzPillar);
    lamp(world, DRUM.x, LEVEL + 6, z);
  }
  for (let z = DRUM.z + DRUM.radius + 6; z < PALACE_Z2 - 6; z += 8) {
    world.setIfAir(DRUM.x - 3, LEVEL + 1, z, P.quartzPillar);
    world.setIfAir(DRUM.x - 3, LEVEL + 2, z, P.quartzPillar);
    world.setIfAir(DRUM.x + 3, LEVEL + 1, z, P.quartzPillar);
    world.setIfAir(DRUM.x + 3, LEVEL + 2, z, P.quartzPillar);
    lamp(world, DRUM.x, LEVEL + 6, z);
  }
}

/** Surface Veil Castle interior (V1 + V2). Call after buildVeilCastle, before undercroft. */
export function buildVeilCastleInterior(world: World): void {
  tradingAndArchive(world);
  armoryAndSmithy(world);
  kitchenV1(world);
  treasuryV1(world);
  barracksV1(world);
  councilV1(world);

  grandLibraryV2(world);
  diningHallV2(world);
  kitchenComplexV2(world);
  militaryQuarterV2(world);
  warRoomV2(world);
  treasuryV2(world);
  royalQuartersV2(world);
  staffAreasV2(world);
  guestQuartersV2(world);
  eyeChambersV2(world);
  servicePassagesV2(world);
  corridorDetailV2(world);

  world.protect(DRUM.x, VEIL_COURT.z, 28);
  world.protect(Math.round((PALACE_X1 + PALACE_X2) / 2), VEIL_COURT.z, 40);
}
