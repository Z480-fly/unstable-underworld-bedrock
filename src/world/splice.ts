/**
 * The Splice: the great glazed hall, full of machines that were cut in half and
 * welded back together.
 *
 * The reference hall is a black deepslate shell hung with sheets of rainbow
 * glass, lit from inside, with workstations down the middle - and several of
 * those workstations are visibly *wrong*: a crafting table run into an
 * enchanting table, the pair dropped into an end-portal frame, a brewing stand
 * standing in the middle of an anvil. Nothing about that combination exists in
 * vanilla, which is the point. This is a world built out of blocks that were
 * broken and reassembled by people who did not have the sense to check.
 *
 * So the builders here are "fused blocks": a function that takes a
 * workstation and *splices* it into the middle of a ring of end-portal frames
 * so it reads as a block that was cut and put back together rather than as a
 * block that was placed.
 */
import { AIR, bs, P, type BlockState } from "./blocks.ts";
import { LANDMARKS, type RectRegion } from "./layout.ts";
import { hash2, Rng } from "./noise.ts";
import { BLACKSTONE_STYLE, areaGround, pad } from "./structures.ts";
import { eyeWindow, glassMosaic, prismPillar, seaLanternPost, PRISM, VIVID_PRISM } from "./structures_glass.ts";
import type { World } from "./world.ts";

function rect(x1: number, z1: number, x2: number, z2: number): RectRegion {
  return { kind: "rect", x1, z1, x2, z2 };
}

/** The rainbow set the reference hangs on its walls. */
const RAINBOW: BlockState[] = [
  P.redGlass,
  P.orangeGlass,
  P.yellowGlass,
  P.limeGlass,
  P.greenGlass,
  P.cyanGlass,
  P.lightBlueGlass,
  P.blueGlass,
  P.purpleGlass,
  P.magentaGlass,
  P.pinkGlass,
];

/**
 * A fused workstation: the block itself, sat inside a broken ring of
 * end-portal frames so it reads as having been cut out of one thing and pushed
 * into another.
 *
 * The frames are deliberately *incomplete* - a full ring would look deliberate,
 * and a three-quarter ring with a crying-obsidian break looks like a splice
 * that did not fully take. This is the "easy corrupted block" the request asked
 * for: it needs no new block, only a new arrangement of real ones.
 */
export function splicedStation(
  world: World,
  x: number,
  y: number,
  z: number,
  block: BlockState,
  seed: number,
  opts: { halo?: BlockState; halo2?: BlockState } = {},
): void {
  const rng = new Rng(seed);
  const halo = opts.halo ?? P.endPortalFrameEye;
  const halo2 = opts.halo2 ?? P.cryingObsidian;
  world.set(x, y, z, block);
  // The four cardinal frames, then a randomised fifth-and-a-bit: a full ring
  // is a machine, a broken ring is a wound.
  const ring: Array<[number, number, 0 | 1 | 2 | 3]> = [
    [0, -1, 2],
    [0, 1, 0],
    [-1, 0, 1],
    [1, 0, 3],
  ];
  for (const [dx, dz, dir] of ring) {
    const eye = rng.chance(0.65);
    world.set(x + dx, y, z + dz, bs("minecraft:end_portal_frame", { direction: dir, end_portal_eye_bit: eye }));
  }
  // Diagonals: half are more frames, half are the corruption itself.
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const pick = rng.next();
    if (pick < 0.45) {
      world.set(x + dx, y, z + dz, halo2);
    } else if (pick < 0.7) {
      world.set(x + dx, y, z + dz, rng.chance(0.5) ? halo : P.obsidian);
    }
  }
  // A short chimney of glass above the splice, so the station also lights.
  if (rng.chance(0.7)) {
    for (let i = 1; i <= 2; i++) {
      world.set(x, y + i, z, rng.chance(0.5) ? halo : P.purpleGlass);
    }
  }
}

/**
 * A crafting table that has been run into an enchanting table: the two blocks
 * share one space, the crafting table's grid on the lower half and the
 * enchanting table's book on the upper, both inside end-portal frames.
 */
export function fusedCraftingEnchanting(world: World, x: number, y: number, z: number, seed: number): void {
  world.set(x, y, z, P.craftingTable);
  // The enchanting table's top, stacked straight onto the crafting table's
  // grid. Vanilla never stacks these; that is the whole joke.
  world.set(x, y + 1, z, P.enchantingTable);
  world.set(x, y + 2, z, P.obsidian);
  const ring: Array<[number, number, 0 | 1 | 2 | 3]> = [
    [0, -1, 2],
    [0, 1, 0],
    [-1, 0, 1],
    [1, 0, 3],
  ];
  const rng = new Rng(seed);
  for (const [dx, dz, dir] of ring) {
    world.set(
      x + dx,
      y + 1,
      z + dz,
      bs("minecraft:end_portal_frame", { direction: dir, end_portal_eye_bit: rng.chance(0.6) }),
    );
  }
  // Enchantment glinting out of the seam, and corruption pooling at the base.
  world.set(x, y + 3, z, P.limeGlass);
  world.set(x + 1, y, z + 1, P.cryingObsidian);
  world.set(x - 1, y, z - 1, rng.chance(0.5) ? P.soulFire : P.magma);
  world.set(x, y - 1, z, P.netheriteBlock);
}

/** A brewing stand standing inside an anvil, with a cauldron spliced on top. */
export function fusedBrewingAnvil(world: World, x: number, y: number, z: number, seed: number): void {
  const rng = new Rng(seed);
  world.set(x, y, z, P.anvil);
  world.set(x, y + 1, z, P.brewingStand);
  world.set(x, y + 2, z, P.cauldron);
  // Soul fire licking out of the cauldron where the anvil's horn should be.
  world.set(x + 1, y + 2, z, P.soulFire);
  world.set(x - 1, y + 2, z, rng.chance(0.5) ? P.endRod : P.cryingObsidian);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    world.set(x + dx, y, z + dz, rng.chance(0.5) ? P.endPortalFrameEye : P.cryingObsidian);
  }
}

export function buildSplice(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.splice.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.splice.footprint);
  const rng = new Rng(0x5911ce);
  pad(world, rect(cx - 44, cz - 44, cx + 44, cz + 44), level, P.polishedBlackstone, P.deepslate);

  const halfW = 30;
  const halfD = 38;
  const height = 20;
  const top = level + height;

  // --- the shell ------------------------------------------------------------
  // Deepslate brick walls with a glazed band, exactly the reference's read:
  // black masonry, rainbow glass, hard light behind it.
  for (let z = cz - halfD; z <= cz + halfD; z++) {
    for (let y = level + 1; y <= top; y++) {
      for (const x of [cx - halfW, cx + halfW]) {
        const band = y >= level + 5 && y <= top - 4;
        world.set(
          x,
          y,
          z,
          band
            ? (y - level) % 4 === 0
              ? P.obsidian
              : RAINBOW[Math.floor(hash2(x + y, z, 0x11) * RAINBOW.length) % RAINBOW.length]!
            : y === top
              ? P.chiseledDeepslate
              : style.wall,
        );
      }
    }
  }
  for (let x = cx - halfW; x <= cx + halfW; x++) {
    for (let y = level + 1; y <= top; y++) {
      for (const z of [cz - halfD, cz + halfD]) {
        const band = y >= level + 5 && y <= top - 4;
        world.set(
          x,
          y,
          z,
          band
            ? (y - level) % 4 === 0
              ? P.obsidian
              : RAINBOW[Math.floor(hash2(x, z + y, 0x22) * RAINBOW.length) % RAINBOW.length]!
            : y === top
              ? P.chiseledDeepslate
              : style.wall,
        );
      }
    }
  }
  world.fill(cx - halfW, level, cz - halfD, cx + halfW, level, cz + halfD, style.floor);
  // Ribbed ceiling: the reference's roof is a coffered grid, not a flat slab.
  for (let z = cz - halfD + 2; z <= cz + halfD - 2; z += 4) {
    for (let x = cx - halfW + 2; x <= cx + halfW - 2; x += 4) {
      world.set(x, top, z, P.glowstone);
      world.set(x, top + 1, z, P.endRod);
    }
  }
  for (let x = cx - halfW; x <= cx + halfW; x += 4) {
    world.set(x, top + 1, cz - halfD, P.chiseledDeepslate);
    world.set(x, top + 1, cz + halfD, P.chiseledDeepslate);
  }

  // --- the great sheets ----------------------------------------------------
  // Free-hanging rainbow panels down both long walls, the reference's signature.
  for (let i = -3; i <= 3; i++) {
    const px = cx + i * 8;
    if (Math.abs(i) < 1) continue; // keep the centre aisle clear
    for (const wallZ of [cz - halfD + 1, cz + halfD - 1]) {
      glassMosaic(world, px, level + 12, wallZ, 3, 4, true, RAINBOW, P.obsidian, 0x3000 + i * 17);
    }
  }
  // The great eye on the north gable, facing the entrance.
  eyeWindow(world, cx, level + 12, cz - halfD, 9, 5, true, P.obsidian, 0x3300, VIVID_PRISM);

  // --- the workstations ----------------------------------------------------
  // Two rows of fused machines down the hall, alternating the two splices.
  for (let i = -3; i <= 3; i++) {
    const z = cz + i * 9;
    if (Math.abs(i) <= 1) continue;
    const px = cx - 12;
    if (i % 2 === 0) fusedCraftingEnchanting(world, px, level + 1, z, 0x4000 + i);
    else fusedBrewingAnvil(world, px, level + 1, z, 0x4100 + i);
    // The mirror row on the far side, so the aisle between them is walkable.
    const qx = cx + 12;
    if (i % 2 === 0) fusedBrewingAnvil(world, qx, level + 1, z, 0x4200 + i);
    else fusedCraftingEnchanting(world, qx, level + 1, z, 0x4300 + i);
    // A lectern and a barrel of stock between them, so the machines look used.
    world.set(cx - 4, level + 1, z, P.lectern);
    world.set(cx + 4, level + 1, z, P.barrel);
    if (rng.chance(0.6)) world.set(cx + 5, level + 1, z, P.undyedShulkerBox);
  }

  // --- the altar ------------------------------------------------------------
  // A stepped dais at the north end carrying the worst splice in the building:
  // a crafting table, an enchanting table and an end-portal frame, welded
  // together in one column and lit from below.
  for (let step = 0; step < 3; step++) {
    const r = 9 - step * 2;
    world.disc(cx, cz - halfD + 8, r, level + 1 + step, step === 0 ? P.chiseledDeepslate : P.polishedBlackstone);
  }
  const altarY = level + 4;
  world.set(cx, altarY, cz - halfD + 8, P.craftingTable);
  world.set(cx, altarY + 1, cz - halfD + 8, P.enchantingTable);
  world.set(cx, altarY + 2, cz - halfD + 8, P.anvil);
  for (const [dx, dz, dir] of [[0, -1, 2], [0, 1, 0], [-1, 0, 1], [1, 0, 3]] as const) {
    world.set(cx + dx, altarY + 1, cz - halfD + 8 + dz, bs("minecraft:end_portal_frame", { direction: dir, end_portal_eye_bit: true }));
  }
  world.set(cx, altarY + 3, cz - halfD + 8, P.glowstone);
  world.set(cx, altarY - 1, cz - halfD + 8, P.sculkCatalyst);
  world.disc(cx, cz - halfD + 8, 3, altarY, P.glass);

  // --- the aisle -----------------------------------------------------------
  // A green-glass aisle between the machine rows, lit from underneath, so the
  // hall is walkable and the path system has something to meet.
  for (let z = cz - halfD + 12; z <= cz + halfD - 4; z++) {
    for (let x = cx - 2; x <= cx + 2; x++) {
      const onWay = Math.abs(x - cx) <= 2;
      world.set(x, level + 1, z, onWay ? (x === cx ? P.greenGlass : P.limeGlass) : P.soulSoil);
      if (onWay) world.set(x, level, z, P.glowstone);
    }
  }
  for (let i = 0; i <= 8; i++) {
    const z = cz - halfD + 16 + i * 8;
    prismPillar(world, cx - 6, z, level + 1, 9, VIVID_PRISM, 0x5000 + i);
    prismPillar(world, cx + 6, z, level + 1, 9, VIVID_PRISM, 0x5100 + i);
  }
  seaLanternPost(world, cx - 9, cz + halfD - 3, level, 5);
  seaLanternPost(world, cx + 9, cz + halfD - 3, level, 5);

  // --- the entrance --------------------------------------------------------
  for (let y = level + 1; y <= level + 6; y++) {
    for (let x = cx - 3; x <= cx + 3; x++) world.set(x, y, cz + halfD, AIR);
  }
  for (let i = -3; i <= 3; i++) {
    world.set(cx + i, level + 7, cz + halfD, i % 2 === 0 ? P.greenGlass : P.chiseledDeepslate);
  }

  // --- creepy fill ---------------------------------------------------------
  // Warped growth eating the corners, sculk in the floor, and glass chips
  // everywhere: the reference's hall is beautiful and wrong, not clean.
  for (let i = 0; i < 260; i++) {
    const px = cx + rng.int(-halfW, halfW);
    const pz = cz + rng.int(-halfD, halfD);
    if (!world.inRealm(px, pz)) continue;
    // Stay off the aisle and the altar.
    if (Math.abs(px - cx) < 4 && pz > cz - halfD + 10) continue;
    const surface = world.surfaceAt(px, pz);
    if (surface < level || surface > level + 1) continue;
    const pick = rng.int(0, 9);
    if (pick === 0) world.set(px, surface + 1, pz, P.warpedWart);
    else if (pick === 1) world.set(px, surface + 1, pz, P.warpedNylium);
    else if (pick === 2) world.set(px, surface, pz, P.sculk);
    else if (pick === 3) world.set(px, surface + 1, pz, P.cryingObsidian);
    else if (pick === 4) world.set(px, surface + 1, pz, P.amethyst);
    else if (pick === 5) world.set(px, surface, pz, P.chippedAnvil);
    else if (pick === 6) world.set(px, surface, pz, P.damagedAnvil);
    else if (pick === 7) world.set(px, surface, pz, P.magma);
    else if (pick === 8) world.set(px, surface + 1, pz, P.endRod);
    else world.set(px, surface, pz, PRISM[rng.int(0, PRISM.length - 1)]!);
  }
  // Sculk veins creeping up the inside of the walls.
  for (let i = 0; i < 40; i++) {
    const side = rng.int(0, 3);
    const px = side === 0 ? cx - halfW + 1 : side === 1 ? cx + halfW - 1 : cx + rng.int(-halfW, halfW);
    const pz = side === 2 ? cz - halfD + 1 : side === 3 ? cz + halfD - 1 : cz + rng.int(-halfD, halfD);
    world.set(px, level + 1 + rng.int(0, 8), pz, P.sculkVein);
  }

  world.protect(cx, cz, Math.max(halfW, halfD) + 2);
}
