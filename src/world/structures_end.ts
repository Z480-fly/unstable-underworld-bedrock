/**
 * End / glass-eye builders (split module so the detail pass can land cleanly).
 */
import { bs, P, type BlockState } from "./blocks.ts";
import type { World } from "./world.ts";
import { Rng } from "./noise.ts";

/** Static end gateway beam (no teleport NBT). */
export function endGatewayMarker(world: World, x: number, y: number, z: number, height = 6): void {
  for (let dy = 0; dy < height; dy++) {
    world.set(x, y + dy, z, P.endGateway);
  }
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    world.set(x + dx, y, z + dz, P.obsidian);
  }
  world.set(x, y - 1, z, P.obsidian);
  world.set(x, y + height, z, P.obsidian);
}

/** Full 5x5 end portal platform with eyes; optional broken frames. */
export function endPortalPlatform(world: World, cx: number, y: number, cz: number, broken = false): void {
  const rng = new Rng((cx * 53 + cz * 97 + y) ^ 0xe9d);
  const sides: Array<{ dx: number; dz: number; dir: number }> = [];
  for (let i = -1; i <= 1; i++) {
    sides.push({ dx: i, dz: -2, dir: 2 });
    sides.push({ dx: i, dz: 2, dir: 0 });
    sides.push({ dx: -2, dz: i, dir: 1 });
    sides.push({ dx: 2, dz: i, dir: 3 });
  }
  for (const [dx, dz, dir] of [[-2, -2, 1], [2, -2, 3], [-2, 2, 1], [2, 2, 3]] as const) {
    sides.push({ dx, dz, dir });
  }
  for (const s of sides) {
    if (broken && rng.chance(0.28)) continue;
    const eye = broken ? rng.chance(0.45) : true;
    world.set(cx + s.dx, y, cz + s.dz, bs("minecraft:end_portal_frame", { direction: s.dir, end_portal_eye_bit: eye }));
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      world.set(cx + dx, y, cz + dz, P.endPortal);
    }
  }
}

/** Tall stained-glass spire with a glowing "eye" hub. */
export function glassEyeSpire(world: World, cx: number, cz: number, baseY: number, height: number): void {
  const glasses = [
    P.greenGlass, P.limeGlass, P.purpleGlass, P.cyanGlass,
    P.lightBlueGlass, P.magentaGlass, P.tintedGlass, P.blackGlass,
  ];
  const frame = P.obsidian;
  for (let y = baseY; y < baseY + height - 6; y++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > 1) continue;
        const g = glasses[((y + dx + dz) % glasses.length + glasses.length) % glasses.length]!;
        world.set(cx + dx, y, cz + dz, g);
      }
    }
    world.set(cx, y, cz, frame);
  }
  const eyeY = baseY + height - 5;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        const d = Math.hypot(dx, dy * 0.85, dz);
        if (d > 4.2 || d < 1.5) continue;
        if (d > 3.4) world.set(cx + dx, eyeY + dy, cz + dz, frame);
        else {
          const g = glasses[(((dx * 7 + dy * 3 + dz * 11) % glasses.length) + glasses.length) % glasses.length]!;
          world.set(cx + dx, eyeY + dy, cz + dz, g);
        }
      }
    }
  }
  world.set(cx, eyeY, cz, P.endPortalFrameEye);
  world.set(cx, eyeY + 1, cz, P.seaLantern);
  world.set(cx, eyeY - 1, cz, P.seaLantern);
  world.column(cx, cz, eyeY + 5, eyeY + 8, P.cryingObsidian);
  world.set(cx, eyeY + 9, cz, P.endRod);
}

/**
 * Flat "eye" oculus: concentric stained-glass iris rings around a literal
 * pupil (an eyed end-portal frame), glowing from a sea lantern above it.
 * Horizontal, unlike glassEyeSpire's vertical sphere - use it as a floor
 * medallion or set into a roof/dome so it reads as an eye looking straight
 * up or down.
 */
export function eyeOculus(
  world: World,
  cx: number,
  cz: number,
  y: number,
  radius: number,
  glasses: BlockState[],
  frame: BlockState = P.obsidian,
): void {
  const pupilR = Math.max(1, Math.round(radius * 0.28));
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const x = cx + dx;
      const z = cz + dz;
      if (d <= pupilR - 1) {
        world.set(x, y, z, P.obsidian);
        continue;
      }
      if (d <= pupilR || d >= radius - 1) {
        world.set(x, y, z, frame);
        continue;
      }
      const band = Math.floor(((d - pupilR) / Math.max(0.01, radius - pupilR - 1)) * glasses.length);
      world.set(x, y, z, glasses[Math.min(glasses.length - 1, Math.max(0, band))]!);
    }
  }
  world.set(cx, y, cz, P.endPortalFrameEye);
  world.set(cx, y + 1, cz, P.seaLantern);
}

/**
 * A portal frame split down the middle: obsidian + a lit nether portal on
 * one half, an eyed end-portal frame + end_portal on the other, with a
 * corrupted seam column (alternating crying obsidian / end rod) where the
 * two halves collide.
 *
 * Purely decorative, like every other portal block in the realm - nothing
 * drives it from a script - and deliberately "wrong": a vertical end-portal
 * frame never happens in vanilla, which is the point. This is a splice that
 * failed, not a working dual portal.
 */
export function hybridPortal(world: World, cx: number, y: number, cz: number, alongX = true): void {
  const half = 4;
  const height = 5;
  const rng = new Rng((cx * 191 + cz * 733 + y) ^ 0x4a1f);
  for (let i = -half; i <= half; i++) {
    const isEndSide = i > 0;
    const px = alongX ? cx + i : cx;
    const pz = alongX ? cz : cz + i;
    for (let j = -1; j <= height; j++) {
      const py = y + j;
      if (i === 0) {
        world.set(px, py, pz, j % 2 === 0 ? P.cryingObsidian : isEndSide ? P.endRod : P.obsidian);
        continue;
      }
      const edge = i === -half || i === half || j === -1 || j === height;
      if (edge) {
        world.set(
          px,
          py,
          pz,
          isEndSide
            ? bs("minecraft:end_portal_frame", { direction: alongX ? 2 : 1, end_portal_eye_bit: rng.chance(0.6) })
            : P.obsidian,
        );
      } else {
        world.set(px, py, pz, isEndSide ? P.endPortal : P.portal);
      }
    }
  }
}
