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
/**
 * A layered glass sky: overlapping translucent sheets hung over a region, with
 * green fronds trailing off their rims.
 *
 * This is the reference's most distinctive image - big violet and blue sheets
 * floating in stacked layers, moss growing along their edges, seen from below.
 * It is built as several *separate* layers at different heights rather than one
 * slab, because the whole read is the parallax between the layers.
 *
 * Each layer is an irregular disc rather than a circle: the rim is eaten away
 * by noise so no two layers share a silhouette, and a percentage of the cells
 * are dropped outright so you can see the layer above through the one below.
 */
export function glassSky(
  world: World,
  cx: number,
  cz: number,
  baseY: number,
  opts: {
    layers?: number;
    radius?: number;
    layerGap?: number;
    sheetThickness?: number;
    glasses?: BlockState[];
    underGlass?: BlockState[];
    frondChance?: number;
    seed?: number;
    /**
     * Protect the columns under the sheets from the terrain-decay passes.
     *
     * True is right for a sheet hung over a *landmark*: the cathedral's sky
     * sits on top of a building, and the detail pass must not reach under it.
     * False is required for the realm-wide canopy, which drifts over open
     * ground: protecting every column it passes over would switch off ruins,
     * fractures and detail scatter across most of the plate, quietly gutting
     * the whole wasteland for the sake of a sky that is 60 blocks up.
     */
    protectGround?: boolean;
  } = {},
): void {
  const layers = opts.layers ?? 5;
  const radius = opts.radius ?? 40;
  const layerGap = opts.layerGap ?? 7;
  const thickness = opts.sheetThickness ?? 1;
  // Clamp the whole stack to fit under the ceiling rather than dropping it.
  // Silently returning on an out-of-range sky looked like the build passing
  // while the landmark quietly had no sky over it at all.
  const ceiling = 124;
  if (baseY >= ceiling) return;
  const maxLayers = Math.max(1, Math.floor((ceiling - baseY) / layerGap));
  const layerCount = Math.min(layers, maxLayers);
  const top = baseY + layerCount * layerGap;
  const glasses = opts.glasses ?? [P.purpleGlass, P.blueGlass, P.lightBlueGlass, P.cyanGlass, P.magentaGlass];
  const under = opts.underGlass ?? [P.purpleGlass, P.blueGlass, P.purpleGlass];
  const frondChance = opts.frondChance ?? 0.1;
  const seed = opts.seed ?? 0x5c1a;

  for (let layer = 0; layer < layerCount; layer++) {
    const y = baseY + layer * layerGap;
    // Each layer is offset and a different size, so they never stack into a
    // single flat ceiling when seen from below.
    const offsetX = Math.round(Math.sin(layer * 1.7) * radius * 0.22);
    const offsetZ = Math.round(Math.cos(layer * 1.3) * radius * 0.22);
    const r = Math.round(radius * (0.55 + layer * 0.11));
    const lx = cx + offsetX;
    const lz = cz + offsetZ;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dz) / r;
        if (d > 1) continue;
        const x = lx + dx;
        const z = lz + dz;
        // Irregular rim: the outer third of each sheet is eaten away.
        if (d > 0.62 && hash3(x, y, z, seed + layer * 31) < (d - 0.62) * 1.5) continue;
        // Punch holes so the layer above shows through this one.
        if (hash3(x, y, z, seed + layer * 57) < 0.12) continue;
        const block = hash3(x, y, z, seed + layer * 13) < 0.45 ? prismAt(under, x, y, z, seed + layer) : prismAt(glasses, x, y, z, seed + layer);
        for (let t = 0; t < thickness; t++) {
          world.set(x, y + t, z, t === 0 ? block : prismAt(glasses, x, y + t, z, seed + layer + 3));
        }
        // Green fronds hanging off the rim, the moss the reference shows
        // growing along every sheet's edge.
        if (d > 0.55 && hash3(x, y, z, seed + layer * 71) < frondChance * d) {
          const drop = 2 + Math.floor(hash3(x, y, z, seed + layer * 91) * 6);
          for (let f = 1; f <= drop; f++) {
            const pick = hash3(x, f, z, seed + layer) < 0.5 ? P.greenGlass : P.limeGlass;
            world.set(x, y - f, z, pick);
          }
        }
      }
    }
  }
  if (opts.protectGround ?? true) world.protect(cx, cz, radius + 2);
}

/**
 * A gothic arch: two fluted piers, a pointed arch between them, and a crown of
 * spires - the reference's ruined cathedral, built in dark stone with a green
 * light burning in the opening.
 */
export function gothicArch(
  world: World,
  cx: number,
  cz: number,
  baseY: number,
  height: number,
  halfSpan: number,
  style: { wall: BlockState; trim: BlockState; floor: BlockState },
  glasses: BlockState[] = VIVID_PRISM,
  seed = 0xa2c4,
): void {
  const top = baseY + height;
  // Piers: square towers with a fluted face and a banded cornice.
  for (const side of [-1, 1]) {
    const px = cx + side * halfSpan;
    for (let y = baseY; y <= top; y++) {
      const taper = y > baseY + height * 0.6 ? 1 : 0;
      const r = halfSpan >= 6 ? 3 - taper : 2;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r) continue; // chamfer
          const x = px + dx;
          const z = cz + dz;
          // Flutes: vertical grooves down the face.
          const flute = dz % 2 === 0 && Math.abs(dx) === r;
          world.set(x, y, z, flute ? style.trim : y === top ? style.trim : y % 9 === 0 ? style.trim : style.wall);
        }
      }
    }
    // Spire above each pier.
    const spireTop = top + Math.round(height * 0.42);
    for (let y = top + 1; y <= spireTop; y++) {
      const t = (y - top) / (spireTop - top);
      const r = Math.max(0, Math.round(3 * (1 - t)));
      if (r === 0) {
        world.set(px, y, cz, style.trim);
        continue;
      }
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) world.set(px + dx, y, cz + dz, style.wall);
      }
    }
    world.set(px, spireTop + 1, cz, P.glowstone);
    // Banners of glazing down the inner face of each pier.
    glassMosaic(world, px - side * 2, baseY + Math.round(height * 0.42), cz, 1, Math.round(height * 0.26), false, glasses, style.trim, seed + side);
  }

  // The arch itself: a pointed opening spanning pier to pier.
  const inner = halfSpan - 2;
  const archY = baseY + Math.round(height * 0.55);
  for (let x = cx - inner; x <= cx + inner; x++) {
    const t = Math.abs(x - cx) / Math.max(1, inner);
    // Pointed profile: a shallow curve rising to a peak at the centre.
    const rise = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * height * 0.3);
    for (let y = archY; y <= archY + rise; y++) {
      for (let dz = -1; dz <= 1; dz++) {
        world.set(x, y, cz + dz, (y - archY) === rise ? style.trim : style.wall);
      }
    }
  }
  // Relieving arch: a second course above the first, tying the piers together.
  for (let x = cx - inner - 1; x <= cx + inner + 1; x++) {
    const t = Math.abs(x - cx) / Math.max(1, inner + 1);
    const rise = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * height * 0.3);
    for (let dz = -1; dz <= 1; dz++) {
      world.set(x, archY + rise + 1, cz + dz, style.trim);
      world.set(x, archY + rise + 2, cz + dz, style.wall);
    }
  }

  // The green light burning in the opening, and the glazing fan above it.
  for (let x = cx - inner + 2; x <= cx + inner - 2; x++) {
    for (let y = baseY + 1; y <= archY + 2; y++) {
      const t = Math.abs(x - cx) / Math.max(1, inner);
      if (Math.sqrt(Math.max(0, 1 - t * t)) * height * 0.3 < 4) continue;
      world.set(x, y, cz, (y - baseY) % 5 === 0 ? P.limeGlass : P.greenGlass);
    }
  }
  eyeWindow(world, cx, archY + Math.round(height * 0.16), cz, Math.max(3, inner - 4), 3, true, style.trim, seed, glasses);

  // Floor: a glazed processional way leading under the arch.
  for (let z = cz - halfSpan - 10; z <= cz + halfSpan + 10; z++) {
    for (let x = cx - 3; x <= cx + 3; x++) {
      world.set(x, baseY, z, Math.abs(x - cx) === 3 ? style.floor : (x + z) % 4 === 0 ? P.greenGlass : P.polishedBlackstone);
    }
  }
  world.protect(cx, cz, halfSpan + 12);
}

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
    /**
     * Make the canopy *entirely* glass. The reference's trees are glazed
     * crowns, not trees with glass in them: no leaf at all, every canopy cell
     * drawn from the prism, so the crown reads as one hanging sheet of colour.
     */
    allGlass?: boolean;
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
  const glassiness = opts.allGlass ? 1 : opts.glassiness ?? 0.22;
  const allGlass = opts.allGlass === true;
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
        // `allGlass` must be absolute, not a density: the density formula falls
        // off toward the rim, so a "mostly glass" canopy still dropped leaf on
        // its outer shell - which is exactly where the silhouette is read.
        const glass = allGlass || hash3(x, y, z, seed + 7) < glassiness * (1.25 - d * 0.5);
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
