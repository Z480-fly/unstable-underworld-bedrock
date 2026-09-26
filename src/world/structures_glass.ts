/**
 * Stained-glass builders - the glazing the Soul Keepers made, hung and grown.
 *
 * Canon: "almost everything is gray or black, with really the only vibrant
 * color being the green visible on some structures" (Soul Keepers). Everything
 * built out of real blocks in this map is the same deal, and glass is the one
 * material allowed to break it, so this module is deliberately the loudest file
 * in the generator: mosaic murals, eye windows, prism pillars and the giant
 * glass trees.
 *
 * Every builder here is purely decorative. No redstone, no scripts, no
 * behaviour: the reference screenshots are static builds, so these are static
 * builds too.
 */
import { AIR, P, type BlockState } from "./blocks.ts";
import { hash2, hash3, Rng } from "./noise.ts";
import type { World } from "./world.ts";

/** The full glazing set, in the order the mosaic hash walks it. */
export const PRISM: BlockState[] = [
  P.purpleGlass,
  P.magentaGlass,
  P.cyanGlass,
  P.lightBlueGlass,
  P.limeGlass,
  P.greenGlass,
  P.pinkGlass,
  P.tintedGlass,
  P.grayGlass,
  P.blackGlass,
];

/** The loud subset used where the reference is at its most saturated. */
export const VIVID_PRISM: BlockState[] = [
  P.purpleGlass,
  P.magentaGlass,
  P.cyanGlass,
  P.lightBlueGlass,
  P.greenGlass,
  P.limeGlass,
  P.pinkGlass,
];

/** Canon green - the only colour the Soul Keepers put on whole structures. */
export const SOUL_GREEN: BlockState[] = [P.greenGlass, P.limeGlass, P.cyanGlass, P.greenGlass];

/**
 * Deterministic colour for one mosaic cell. Hashing the cell's own coordinates
 * (rather than walking an index) means the same mural regenerates identically
 * and two murals never share a pattern.
 */
export function prismAt(glasses: BlockState[], x: number, y: number, z: number, seed: number): BlockState {
  return glasses[Math.floor(hash3(x, y, z, seed) * glasses.length) % glasses.length]!;
}

/**
 * A stained-glass mosaic set into a wall face, framed in masonry.
 *
 * The wall is `alongX ? z = cz : x = cx` and the panel spans `2*halfW+1` across
 * by `2*halfH+1` up, centred on (cx, cy, cz). A 1-block masonry border and a
 * lattice every 4 cells keep it reading as *glazing in a frame* rather than as
 * a noise field, which is what the reference walls do.
 */
export function glassMosaic(
  world: World,
  cx: number,
  cy: number,
  cz: number,
  halfW: number,
  halfH: number,
  alongX: boolean,
  glasses: BlockState[],
  frame: BlockState,
  seed: number,
): void {
  for (let u = -halfW; u <= halfW; u++) {
    for (let v = -halfH; v <= halfH; v++) {
      const border = u === -halfW || u === halfW || v === -halfH || v === halfH;
      const lattice = u % 4 === 0 || v % 4 === 0;
      const x = alongX ? cx + u : cx;
      const z = alongX ? cz : cz + u;
      const y = cy + v;
      world.set(x, y, z, border || lattice ? frame : prismAt(glasses, x, y, z, seed));
    }
  }
}

/**
 * The big eye window: a pale sclera, a banded iris of glazing, a black pupil
 * with a lit catchlight, and a masonry lid around the almond outline.
 *
 * `alongX` picks the wall (`true` = the panel faces along Z at `cz`). Sized in
 * blocks rather than scaled, so callers control the span directly.
 */
export function eyeWindow(
  world: World,
  cx: number,
  cy: number,
  cz: number,
  halfW: number,
  halfH: number,
  alongX: boolean,
  frame: BlockState,
  seed: number,
  glasses: BlockState[] = VIVID_PRISM,
): void {
  for (let u = -halfW; u <= halfW; u++) {
    for (let v = -halfH; v <= halfH; v++) {
      const x = alongX ? cx + u : cx;
      const z = alongX ? cz : cz + u;
      const y = cy + v;
      const du = u / halfW;
      const dv = v / halfH;
      // Almond outline: widest across the middle, pinching at the corners,
      // which is what makes it read as an eye and not as a disc.
      const d = Math.abs(dv) <= 1 - Math.abs(du) * 0.55 ? Math.hypot(du * 0.75, dv) : 99;
      let block: BlockState;
      if (d > 0.9) block = frame; // the lid / outer rim
      else if (d < 0.3) block = P.blackGlass; // pupil
      else if (d < 0.42) block = d > 0.36 ? P.blackGlass : prismAt(glasses, x, y, z, seed);
      else if (Math.hypot(du + 0.22, dv + 0.2) < 0.12) block = P.whiteGlass; // catchlight
      else if (d > 0.72) block = prismAt(glasses, x, y, z, seed + 11); // iris band
      else block = (u + v) % 3 === 0 ? P.whiteGlass : prismAt(glasses, x, y, z, seed + 23);
      world.set(x, y, z, block);
    }
  }
}

/**
 * A free-standing prism pillar: a stacked, banded glass column that glows from
 * inside. These are the drop-shaped markers the reference sets around its
 * plazas, so they are tapered, banded and capped with a light rather than
 * being plain glass sticks.
 */
export function prismPillar(
  world: World,
  x: number,
  z: number,
  baseY: number,
  height: number,
  glasses: BlockState[],
  seed: number,
): void {
  const rng = new Rng((x * 6151 + z * 3571 + baseY) ^ 0x9e37);
  for (let i = 0; i < height; i++) {
    const y = baseY + i;
    // Taper: 3x3 at the foot, 1x1 at the cap, so it reads as a lit obelisk.
    const radius = i < 3 || i > height - 5 ? 1 : 0;
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (i % 7 === 3) {
          world.set(x + dx, y, z + dz, P.obsidian); // the banding
          continue;
        }
        if (Math.abs(dx) + Math.abs(dz) === 2 && rng.chance(0.5)) continue;
        world.set(x + dx, y, z + dz, prismAt(glasses, x + dx, y, z + dz, seed));
      }
    }
  }
  world.set(x, baseY + height, z, P.seaLantern);
  world.set(x, baseY + height + 1, z, P.glowstone);
  world.set(x, baseY - 1, z, P.polishedBlackstone);
}

/**
 * A lantern-topped post of the kind the reference lines its plazas with: a
 * dark-oak mast, a sea-lantern head, and a glowstone under it so the light
 * actually reaches the ground.
 */
export function seaLanternPost(world: World, x: number, z: number, baseY: number, height = 4): void {
  for (let i = 0; i < height; i++) world.set(x, baseY + i, z, P.darkOakLog);
  world.set(x, baseY + height, z, P.seaLantern);
  world.set(x, baseY + height + 1, z, P.glowstone);
  world.set(x, baseY - 1, z, P.polishedBlackstone);
}

/**
 * The giant glass tree.
 *
 * A dark-oak trunk with buttress roots, a ribbed bole, and a wide canopy of
 * dark leaves shot through with stained glass so the whole crown glows - the
 * reference's centrepiece, where the glazing is grown rather than built.
 *
 * `glassiness` is the chance a canopy cell is glazing instead of leaf, which is
 * what makes the crown read as a lamp rather than as a tree with confetti in it.
 */
export function glassTree(
  world: World,
  cx: number,
  cz: number,
  baseY: number,
  opts: {
    height?: number;
    trunkRadius?: number;
    canopyRadius?: number;
    canopyLayers?: number;
    glassiness?: number;
    glasses?: BlockState[];
    leaf?: BlockState;
    seed?: number;
    eyeAt?: boolean;
  } = {},
): void {
  const height = opts.height ?? 30;
  const trunkRadius = opts.trunkRadius ?? 4;
  const canopyRadius = opts.canopyRadius ?? 13;
  const canopyLayers = opts.canopyLayers ?? 9;
  const glassiness = opts.glassiness ?? 0.22;
  const glasses = opts.glasses ?? PRISM;
  const leaf = opts.leaf ?? P.darkOakLeaves;
  const seed = opts.seed ?? 0x9a11;
  const crownY = baseY + height;

  // Roots: eight buttresses flaring out from the foot, footing into the ground.
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    for (let r = 1; r <= trunkRadius + 5; r++) {
      const x = cx + Math.round(Math.cos(ang) * r);
      const z = cz + Math.round(Math.sin(ang) * r);
      const top = r <= 2 ? baseY + 3 : baseY + Math.max(1, 4 - (r >> 1));
      for (let y = top - 3; y <= top; y++) {
        if (r > trunkRadius && y < top) continue;
        world.set(x, y, z, y === top ? P.darkOakLog : P.polishedDeepslate);
      }
      world.setSurface(x, z, Math.max(world.surfaceAt(x, z), top));
      world.setLand(x, z, true);
    }
  }

  // Bole: a hollow taper with a vertical rib of polished deepslate, so the
  // trunk reads as round from a distance instead of as a square column.
  for (let y = baseY; y <= crownY; y++) {
    const t = (y - baseY) / Math.max(1, height);
    const radius = Math.max(1, Math.round(trunkRadius * (1 - t * 0.55)));
    world.cylinder(cx, cz, radius + 1, y, y, P.darkOakLog, true);
    for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2;
      world.set(
        cx + Math.round(Math.cos(ang) * (radius + 1)),
        y,
        cz + Math.round(Math.sin(ang) * (radius + 1)),
        P.polishedDeepslate,
      );
    }
  }

  // Branches: six reaching up and out from the top third of the bole.
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2 + 0.4;
    const startY = baseY + Math.round(height * 0.62) + (a % 3) * 3;
    const reach = Math.round(canopyRadius * 0.75);
    for (let s = 0; s <= reach; s++) {
      const x = cx + Math.round(Math.cos(ang) * s);
      const z = cz + Math.round(Math.sin(ang) * s);
      const y = startY + Math.round(s * 0.45);
      world.set(x, y, z, P.darkOakLog);
      if (s % 3 === 0) {
        world.set(x, y + 1, z, P.darkOakLog);
        world.set(x, y - 1, z, P.darkOakLog);
      }
    }
  }

  // Canopy: a squashed dome of leaves, eroded with noise so the silhouette is
  // lumpy rather than a perfect hemisphere, then shot through with glass.
  for (let layer = 0; layer < canopyLayers; layer++) {
    const t = layer / (canopyLayers - 1);
    const y = crownY - Math.round(canopyLayers / 2) + layer;
    const radius = Math.round(canopyRadius * Math.sin(t * Math.PI) * 1.05);
    if (radius <= 0) continue;
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d = Math.hypot(dx, dz) / radius;
        if (d > 1) continue;
        const x = cx + dx;
        const z = cz + dz;
        // Erode the outer shell so the crown has holes and lumps.
        if (d > 0.55 && hash3(x, y, z, seed + 3) < (d - 0.55) * 0.9) continue;
        const glass = hash3(x, y, z, seed + 7) < glassiness * (1.25 - d * 0.5);
        world.set(x, y, z, glass ? prismAt(glasses, x, y, z, seed) : leaf);
      }
    }
  }

  // Hanging glass: curtains dropping out of the underside, which is what makes
  // the crown read as glazing rather than as a tree with confetti in it.
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    const r = Math.round(canopyRadius * (0.5 + hash2(i, seed, seed + 13) * 0.4));
    const x = cx + Math.round(Math.cos(ang) * r);
    const z = cz + Math.round(Math.sin(ang) * r);
    const drop = 3 + Math.floor(hash2(i, seed, seed + 17) * 7);
    for (let d = 1; d <= drop; d++) {
      world.set(x, crownY - canopyLayers - d, z, prismAt(glasses, x, d, z, seed + 29));
    }
  }

  // Crown light: the tree is a lamp, so it needs a visible source.
  world.disc(cx, cz, 2, crownY + 1, P.glowstone);
  world.set(cx, crownY + 2, cz, P.glowstone);
  world.column(cx, cz, crownY + 3, crownY + 4, P.darkOakLog);
  world.set(cx, crownY + 5, cz, P.seaLantern);

  if (opts.eyeAt) {
    // The tree's own eye: a window in the bole, looking back down its path.
    const eyeY = baseY + Math.round(height * 0.45);
    eyeWindow(world, cx, eyeY, cz, 3, 2, false, P.obsidian, seed);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      world.set(cx + dx, eyeY + 3, cz + dz, P.cryingObsidian);
    }
  }

  world.protect(cx, cz, canopyRadius + 2);
}

/**
 * A glazed hall: blackstone walls with mosaic panels and a great eye window
 * set into the north face, a glowing floor medallion, and a colonnade of prism
 * pillars down both aisles.
 *
 * This is the reference's signature building, so it gets its own builder rather
 * than being a special case of `house` - the whole point is the glazing.
 */
export function glazedHall(
  world: World,
  cx: number,
  cz: number,
  halfW: number,
  halfD: number,
  level: number,
  height: number,
  style: { wall: BlockState; trim: BlockState; floor: BlockState },
  glasses: BlockState[] = PRISM,
  seed = 0x5117,
): void {
  const top = level + height;
  const frame = style.trim;
  // A glazed band runs from level+3 to two courses below the parapet; the band
  // is mullioned every 4 blocks so it reads as windows rather than as a hole.
  const bandLo = level + 3;
  const bandHi = top - 3;

  for (const x of [cx - halfW, cx + halfW]) {
    for (let z = cz - halfD; z <= cz + halfD; z++) {
      for (let y = level + 1; y <= top; y++) {
        const inBand = y >= bandLo && y <= bandHi;
        const mullion = (y - level) % 4 === 0;
        world.set(x, y, z, inBand ? (mullion ? frame : prismAt(glasses, x, y, z, seed)) : y === top ? frame : style.wall);
      }
    }
  }
  for (const z of [cz - halfD, cz + halfD]) {
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      for (let y = level + 1; y <= top; y++) {
        const inBand = y >= bandLo && y <= bandHi;
        const mullion = (y - level) % 4 === 0;
        world.set(x, y, z, inBand ? (mullion ? frame : prismAt(glasses, x, y, z, seed + 1)) : y === top ? frame : style.wall);
      }
    }
  }
  world.fill(cx - halfW, level, cz - halfD, cx + halfW, level, cz + halfD, style.floor);
  world.fill(cx - halfW, top, cz - halfD, cx + halfW, top, cz + halfD, P.endRod);
  world.rectWalls(cx - halfW, cz - halfD, cx + halfW, cz + halfD, top + 1, top + 1, frame);

  // The great eye on the north and south faces, and a mosaic frieze under it.
  const eyeY = level + Math.round(height * 0.55);
  eyeWindow(world, cx, eyeY, cz - halfD, Math.min(halfW - 2, 7), 4, true, frame, seed);
  eyeWindow(world, cx, eyeY, cz + halfD, Math.min(halfW - 2, 7), 4, true, frame, seed + 5);
  glassMosaic(world, cx, bandLo - 2, cz - halfD, halfW - 1, 1, true, glasses, frame, seed + 9);

  // Floor medallion: concentric glazing lit from below.
  for (let dz = -6; dz <= 6; dz++) {
    for (let dx = -6; dx <= 6; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > 6) continue;
      if (d < 1.5) {
        world.set(cx + dx, level + 1, cz + dz, P.seaLantern);
        continue;
      }
      world.set(cx + dx, level + 1, cz + dz, glasses[Math.floor(d / 1.5) % glasses.length]!);
    }
  }
  world.set(cx, level + 2, cz, P.glowstone);

  // Pillars down both aisles.
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    prismPillar(world, cx + i * 5, cz - Math.round(halfD / 2), level + 1, Math.round(height * 0.7), glasses, seed + i);
    prismPillar(world, cx + i * 5, cz + Math.round(halfD / 2), level + 1, Math.round(height * 0.7), glasses, seed + i + 40);
  }

  // Entrance: an open doorway on the south face with a lamp either side.
  for (let y = level + 1; y <= level + 4; y++) world.set(cx, y, cz + halfD, AIR);
  seaLanternPost(world, cx - 2, cz + halfD + 1, level, 4);
  seaLanternPost(world, cx + 2, cz + halfD + 1, level, 4);

  world.protect(cx, cz, Math.max(halfW, halfD) + 2);
}
