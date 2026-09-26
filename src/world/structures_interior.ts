/**
 * Interior dressing for existing building footprints (village houses, stalls).
 *
 * Split module, same reasoning as the End builders in structures.ts: this lands
 * as its own file so it can be reviewed/reverted independently of the shell
 * builders.
 *
 * Every write goes through `setIfAir`, so dressing can never punch through a
 * wall, replace a door opening, or float a block where the shell (house(),
 * tower(), etc.) already placed something solid. Call this *after* the shell
 * that defines cx/cz/width/depth/baseY, with the same arguments.
 */
import { P, type BlockState } from "./blocks.ts";
import type { BuildStyle } from "./structures.ts";
import type { World } from "./world.ts";

export function shopInterior(
  world: World,
  cx: number,
  cz: number,
  width: number,
  depth: number,
  baseY: number,
  style: BuildStyle,
  opts: { face?: 0 | 1 | 2 | 3; goods?: BlockState[] } = {},
): void {
  const hw = width >> 1;
  const hd = depth >> 1;
  const y = baseY + 1;
  const face = opts.face ?? 2;
  const goods = opts.goods ?? [P.barrel, P.bookshelf, P.chest];
  const alongZWall = face === 2 || face === 3;

  // Counter facing the door, one row in from the wall it faces.
  if (alongZWall) {
    const counterZ = face === 2 ? cz + hd - 2 : cz - hd + 2;
    for (let x = cx - hw + 2; x <= cx + hw - 2; x++) world.setIfAir(x, y, counterZ, style.accent);
  } else {
    const counterX = face === 0 ? cx + hw - 2 : cx - hw + 2;
    for (let z = cz - hd + 2; z <= cz + hd - 2; z++) world.setIfAir(counterX, y, z, style.accent);
  }

  // Back-wall shelving, two rows high, alternating stock blocks.
  if (alongZWall) {
    const backZ = face === 2 ? cz - hd + 1 : cz + hd - 1;
    for (let x = cx - hw + 1; x <= cx + hw - 1; x++) {
      const good = goods[Math.abs(x) % goods.length]!;
      world.setIfAir(x, y, backZ, good);
      world.setIfAir(x, y + 1, backZ, P.bookshelf);
    }
  } else {
    const backX = face === 0 ? cx - hw + 1 : cx + hw - 1;
    for (let z = cz - hd + 1; z <= cz + hd - 1; z++) {
      const good = goods[Math.abs(z) % goods.length]!;
      world.setIfAir(backX, y, z, good);
      world.setIfAir(backX, y + 1, z, P.bookshelf);
    }
  }

  // A crafting table + furnace tucked in a back corner - a stall at work.
  world.setIfAir(cx - hw + 1, y, cz + hd - 1, P.craftingTable);
  world.setIfAir(cx - hw + 1, y + 1, cz + hd - 1, style.light);
  world.setIfAir(cx + hw - 1, y, cz - hd + 1, P.furnace);

  // Overhead light so the interior isn't pitch dark.
  world.setIfAir(cx, y + 2, cz, style.light);
}
