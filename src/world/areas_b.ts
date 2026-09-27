import { AIR, P } from "./blocks.ts";
import { LANDMARKS, type RectRegion } from "./layout.ts";
import { Rng } from "./noise.ts";
import {
  BLACKSTONE_STYLE,
  DEEPSLATE_STYLE,
  STONE_STYLE,
  areaGround,
  house,
  lampPost,
  pad,
  portalFrame,
  brokenEndPortal,
  statue,
  tower,
  glazedPanel,
  roseWindow,
  shopInterior,
  brokenSplitTable,
  portalPillar,
  portalRibbon,
  splitTable,
  voidWindow,
} from "./structures.ts";
import { glassEyeSpire, eyeOculus, hybridPortal } from "./structures_end.ts";
import { eyeWindow, glassMosaic, prismPillar, seaLanternPost, PRISM, SOUL_GREEN, VIVID_PRISM } from "./structures_glass.ts";
import type { World } from "./world.ts";

function rect(x1: number, z1: number, x2: number, z2: number): RectRegion {
  return { kind: "rect", x1, z1, x2, z2 };
}

/**
 * The polished-andesite collar around one gate set into a wall.
 *
 * A frame written straight onto a wall face reads as a block stuck to a wall;
 * a frame with a dark stone reveal around it reads as an opening. The collar is
 * one block wider than the frame on every side and one course above and below,
 * which is the difference between a doorway and a decoration.
 */
function surroundGate(world: World, x: number, y: number, z: number): void {
  for (let dy = -1; dy <= 5; dy++) {
    for (let dz = -3; dz <= 3; dz++) {
      if (Math.abs(dz) === 3 || dy === -1 || dy === 5) world.set(x, y + dy, z + dz, P.polishedAndesite);
    }
  }
}

export function buildVillage(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.village.center;
  const style = STONE_STYLE;
  const level = areaGround(world, LANDMARKS.village.footprint);
  pad(world, rect(cx - 28, cz - 18, cx + 28, cz + 18), level, P.coarseDirt, P.dirt);
  for (let i = 0; i < 6; i++) {
    const ruined = i % 2 === 0;
    const hx = cx - 18 + (i % 3) * 14;
    const hz = cz - 8 + Math.floor(i / 3) * 14;
    house(world, hx, hz, 9, 7, level, 5, style, { face: 2, ruined });
    // Houses that survived get dressed as stalls - shelving, a counter, a
    // furnace at work. Ruined ones stay empty; there's nothing left to sell.
    if (!ruined) shopInterior(world, hx, hz, 9, 7, level, style, { face: 2 });
  }
  // Two more stalls south of the original row, on the same 14-block grid -
  // "more buildings" without crowding the existing footprint or the tower.
  for (const hx of [cx - 18, cx - 4]) {
    const hz = cz + 14;
    house(world, hx, hz, 9, 7, level, 5, style, { face: 2, ruined: false });
    shopInterior(world, hx, hz, 9, 7, level, style, { face: 2 });
  }
  tower(world, cx + 20, cz, 3, level, 12, style, { round: true, crown: true });
}

export function buildFrostPocket(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.frostPocket.center;
  const level = areaGround(world, LANDMARKS.frostPocket.footprint);
  pad(world, rect(cx - 28, cz - 28, cx + 28, cz + 28), level, P.snowBlock, P.packedIce);
  world.disc(cx - 12, cz + 8, 12, level, P.ice);
  world.disc(cx - 12, cz + 8, 9, level, P.packedIce);
  world.disc(cx - 12, cz + 8, 4, level, P.blueIce);
}

export function buildTomb(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.tomb.center;
  const style = DEEPSLATE_STYLE;
  const level = areaGround(world, LANDMARKS.tomb.footprint);
  pad(world, rect(cx - 28, cz - 28, cx + 28, cz + 28), level, P.deepslateTiles, P.deepslate);
  const pitX = cx;
  const pitZ = cz;
  const pitDepth = 12;
  for (let y = level; y >= level - pitDepth; y--) {
    world.disc(pitX, pitZ, 16, y, P.deepslate);
  }
  world.disc(pitX, pitZ, 16, level - pitDepth + 5, P.blackConcrete);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    statue(world, pitX + Math.round(Math.cos(a) * 12), pitZ + Math.round(Math.sin(a) * 12), level - pitDepth + 6, 1, style);
  }
  world.set(pitX, level - pitDepth + 6, pitZ, P.sculkCatalyst);
}

export function buildAshenReaches(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.ashenReaches.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.ashenReaches.footprint);
  pad(world, rect(cx - 40, cz - 40, cx + 40, cz + 40), level, P.blackstone, P.netherrack);
  for (let z = cz - 16; z <= cz + 16; z++) {
    for (let x = cx - 20; x <= cx + 20; x++) {
      if (Math.hypot(x - cx, z - cz) < 18) world.set(x, level - 1, z, P.lava);
    }
  }
  world.disc(cx + 10, cz - 8, 5, level, P.blackstone);
  tower(world, cx + 10, cz - 8, 3, level, 8, style, { round: true, crown: true });
}

export function buildRuinedCastle(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.ruinedCastle.center;
  const style = STONE_STYLE;
  const level = areaGround(world, LANDMARKS.ruinedCastle.footprint);
  pad(world, rect(cx - 22, cz - 22, cx + 22, cz + 22), level, P.cobbledDeepslate, P.deepslate);
  house(world, cx, cz, 20, 16, level, 8, style, { ruined: true, face: 2 });
  for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]] as const) {
    tower(world, cx + dx, cz + dz, 3, level, 10, style, { round: false, crown: true });
  }
  portalFrame(world, cx, level + 1, cz + 8, true, true);
  brokenEndPortal(world, cx - 10, level + 1, cz - 8);
}

export function buildGlassworks(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.glassworks.center;
  const style = BLACKSTONE_STYLE;
  const level = areaGround(world, LANDMARKS.glassworks.footprint);
  pad(world, rect(cx - 36, cz - 42, cx + 36, cz + 42), level, P.polishedBlackstone, P.deepslate);

  const glazing = [P.greenGlass, P.limeGlass, P.cyanGlass, P.lightBlueGlass, P.whiteGlass, P.grayGlass, P.purpleGlass, P.magentaGlass, P.tintedGlass, P.pinkGlass];
  const frame = P.polishedBlackstone;
  const halfW = 15;
  const halfD = 30;
  const height = 18;
  const top = level + height;

  for (let z = cz - halfD; z <= cz + halfD; z++) {
    for (let y = level + 1; y <= top; y++) {
      world.set(cx - halfW, y, z, style.wall);
      world.set(cx + halfW, y, z, style.wall);
    }
  }
  for (let x = cx - halfW; x <= cx + halfW; x++) {
    for (let y = level + 1; y <= top; y++) {
      world.set(x, y, cz - halfD, style.wall);
      world.set(x, y, cz + halfD, style.wall);
    }
  }
  world.fill(cx - halfW, level, cz - halfD, cx + halfW, level, cz + halfD, style.floor);

  for (const z1 of [cz - halfD + 8, cz - 8, cz + 8]) {
    glazedPanel(world, rect(cx - halfW, z1, cx - halfW, z1 + 8), level + 3, top - 4, glazing, frame);
    glazedPanel(world, rect(cx + halfW, z1, cx + halfW, z1 + 8), level + 3, top - 4, glazing, frame);
  }
  roseWindow(world, cx, cz - halfD, level + 13, 8, true, glazing, frame);
  roseWindow(world, cx, cz + halfD, level + 13, 8, true, glazing, frame);

  for (let y = level + 3; y <= level + 16; y++) {
    const r = y % 3 === 0 ? 2 : 1;
    world.disc(cx, cz, r, y, y % 4 === 0 ? P.limeGlass : P.greenGlass);
  }
  world.set(cx, level + 17, cz, P.glowstone);

  // The color shaft above now has a literal eye looking up at it from the
  // hall floor - the Soul Keepers' own work, set into the floor they glaze.
  eyeOculus(world, cx, cz, level, 6, glazing);
  // ...and two smaller oculi set into the side aisles, so the hall floor reads
  // as a face looking up at the shaft.
  eyeOculus(world, cx - 22, cz, level, 4, glazing);
  eyeOculus(world, cx + 22, cz, level, 4, glazing);

  // A colonnade of glass-eye spires down both long sides, not just at the
  // corners: the glazing hall's signature silhouette.
  glassEyeSpire(world, cx - 32, cz + 8, level + 1, 20);
  glassEyeSpire(world, cx + 32, cz - 6, level + 1, 17);
  glassEyeSpire(world, cx - 32, cz - 26, level + 1, 18);
  glassEyeSpire(world, cx + 32, cz + 26, level + 1, 21);
  glassEyeSpire(world, cx - 32, cz - 8, level + 1, 23);
  glassEyeSpire(world, cx + 32, cz + 10, level + 1, 19);

  // Stained-glass lancets flanking the two rose windows, so the end walls are
  // glazed from floor to vault instead of only at the rose.
  for (const wallZ of [cz - halfD, cz + halfD]) {
    glazedPanel(world, rect(cx - 27, wallZ, cx - 12, wallZ), level + 3, top - 4, glazing, frame);
    glazedPanel(world, rect(cx + 12, wallZ, cx + 27, wallZ), level + 3, top - 4, glazing, frame);
  }

  for (let i = 0; i < 5; i++) {
    lampPost(world, cx - 20 + i * 10, cz - halfD - 6, level, style.light, 4);
  }

  // An outdoor glazing yard north of the hall: three open-fronted pavilions
  // whose end walls are entirely mosaic, with a great eye on the middle one.
  // The reference hangs sheets of glazing on open frames like this, and the
  // hall alone did not read as "a place where glass is made".
  for (let i = -1; i <= 1; i++) {
    const px = cx + i * 22;
    const pz = cz - halfD - 20;
    const ground = world.surfaceAt(px, pz);
    for (let x = px - 8; x <= px + 8; x++) {
      for (let z = pz - 6; z <= pz + 6; z++) {
        const edge = x === px - 8 || x === px + 8 || z === pz - 6 || z === pz + 6;
        if (edge) world.set(x, ground + 1, z, style.accent);
        else world.set(x, ground + 1, z, style.floor);
      }
    }
    world.rectWalls(px - 8, pz - 6, px + 8, pz + 6, ground + 2, ground + 10, style.accent);
    world.rectWalls(px - 8, pz - 6, px + 8, pz + 6, ground + 11, ground + 11, style.trim);
    glassMosaic(world, px, ground + 6, pz - 6, 7, 3, true, PRISM, style.trim, 0x2200 + i * 91);
    glassMosaic(world, px, ground + 6, pz + 6, 7, 3, true, PRISM, style.trim, 0x2400 + i * 91);
    if (i === 0) eyeWindow(world, px, ground + 6, pz - 6, 6, 3, true, style.trim, 0x2600);
    prismPillar(world, px - 6, pz, ground + 2, 8, VIVID_PRISM, 0x2700 + i);
    prismPillar(world, px + 6, pz, ground + 2, 8, VIVID_PRISM, 0x2800 + i);
    seaLanternPost(world, px, pz + 8, ground + 1, 4);
    world.protect(px, pz, 9);
  }
}

export function buildPortalField(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.portalField.center;
  const level = areaGround(world, LANDMARKS.portalField.footprint);
  pad(world, rect(cx - 36, cz - 40, cx + 36, cz + 40), level, P.obsidian, P.blackstone);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 6; row++) {
      const px = cx - 24 + col * 24;
      const pz = cz - 28 + row * 10;
      const mode = (col + row) % 3;
      if (mode === 0) portalFrame(world, px, level + 1, pz, row % 2 === 0, false);
      else if (mode === 1) portalFrame(world, px, level + 1, pz, row % 2 === 0, true);
      else {
        world.column(px - 2, pz, level + 1, level + 3, P.obsidian);
        world.column(px + 2, pz, level + 1, level + 3, P.cryingObsidian);
      }
    }
  }
  // One splice that failed the other way: half nether portal, half end
  // portal, fused at a corrupted seam. South of the grid, clear of all 18
  // gates above.
  hybridPortal(world, cx, level + 1, cz + 34, true);

  // --- the collapsed seam ---------------------------------------------------
  // The field's own history, written on its floor: the line the portals used to
  // run along before they were cut, now a ribbon of dead portal blocks lying in
  // the obsidian. It runs east-west between the gate rows rather than through
  // them, so the walk across the field still reads as crossing a grid of gates
  // rather than following one seam.
  portalRibbon(world, cx - 32, cz - 33, cx + 32, cz - 33, level + 1);
  portalRibbon(world, cx - 32, cz + 27, cx + 32, cz + 27, level + 1);
  // A short spur off the north ribbon, the way a branch was tried and abandoned.
  portalRibbon(world, cx + 12, cz - 33, cx + 12, cz - 20, level + 1);

  // --- the standing stumps --------------------------------------------------
  // Four portal pillars left standing where their frames sheared off. Placed on
  // the gate grid's own diagonals so they read as the remains of gates rather
  // than as a separate monument, and tall enough to be landmarks from the far
  // side of the field.
  for (const [dx, dz] of [[-30, -20], [30, -20], [-30, 16], [30, 16]] as const) {
    portalPillar(world, cx + dx, cz + dz, level + 1, 6, DEEPSLATE_STYLE);
  }

  // --- the sheared windows --------------------------------------------------
  // Two void windows set into the field's edge: the frames a gate used to sit
  // in, still standing, with the portal behind the glass either lit or dead.
  voidWindow(world, cx - 33, cz - 4, level + 1, 4, false, DEEPSLATE_STYLE);
  voidWindow(world, cx + 33, cz + 4, level + 1, 4, false, DEEPSLATE_STYLE);

  // --- the abandoned ritual -------------------------------------------------
  // A row of split tables along the west edge, past the last gate. Whatever
  // was made here to cut the portals is broken: two of the three are ruined and
  // only the middle one still stands. Out of the way of every gate above.
  for (let i = 0; i < 3; i++) {
    const z = cz - 14 + i * 12;
    if (i === 1) brokenSplitTable(world, cx - 32, z, level + 1, false, DEEPSLATE_STYLE);
    else splitTable(world, cx - 32, z, level + 1, false, DEEPSLATE_STYLE);
  }
}

/**
 * The Nether Portal Lobby.
 *
 * Re-sited and re-faced. It used to be a blackstone plaza twenty frames wide
 * on the open plain; the user sent a screenshot of `Position: -219, 45, 125`
 * showing a wall of *green* deepslate and tuff with a giant dark-oak door
 * standing in it, a black andesite frame around it, gold ore glinting in the
 * stone and the purple edge of an obsidian portal just off to the right - and
 * said the nether portal section needed to be there. So that is what this is
 * now: a walled green-stone court at those coordinates, entered through a
 * dark-oak door, with the twenty portals set into its walls rather than
 * standing loose on a floor.
 *
 * The castle's causeway arrives from the east at z = 133, so the court's long
 * axis runs east-west and the door is in the east wall, on the axis: you walk
 * the causeway, through the door, and the portals are all around you.
 */
export function buildPortalLobby(world: World): void {
  const { x: cx, z: cz } = LANDMARKS.portalLobby.center;
  const level = areaGround(world, LANDMARKS.portalLobby.footprint);
  const halfW = 10;
  const halfD = 26;
  // The green stone. Tuff for the field, deepslate for the coursing, and a
  // green-glass band at eye height so the canon colour is on the structure
  // rather than only in the lamps.
  pad(world, rect(cx - halfW, cz - halfD, cx + halfW, cz + halfD), level, P.tuff, P.deepslate);

  const top = level + 16;
  // --- the court shell ---------------------------------------------------------
  for (let x = cx - halfW; x <= cx + halfW; x++) {
    for (let y = level + 1; y <= top; y++) {
      for (const z of [cz - halfD, cz + halfD]) {
        const band = y >= level + 5 && y <= level + 7;
        const course = y % 4 === 0;
        const ore = (x * 7 + y * 13 + z) % 29 === 0;
        world.set(
          x,
          y,
          z,
          y === top
            ? P.chiseledDeepslate
            : ore
              ? P.goldOre
              : band
                ? (course ? P.polishedAndesite : P.greenGlass)
                : course
                  ? P.polishedAndesite
                  : P.deepslate,
        );
      }
    }
  }
  for (let z = cz - halfD + 1; z <= cz + halfD - 1; z++) {
    for (let y = level + 1; y <= top; y++) {
      for (const x of [cx - halfW, cx + halfW]) {
        const band = y >= level + 5 && y <= level + 7;
        const course = y % 4 === 0;
        const ore = (z * 11 + y * 5 + x) % 31 === 0;
        world.set(
          x,
          y,
          z,
          y === top
            ? P.chiseledDeepslate
            : ore
              ? P.goldOre
              : band
                ? (course ? P.polishedAndesite : P.greenGlass)
                : course
                  ? P.polishedAndesite
                  : P.deepslate,
        );
      }
    }
  }
  // Floor: tuf laid in courses with a green-glass spine down the axis, so the
  // twenty portals light the floor they all look out onto.
  for (let z = cz - halfD + 1; z <= cz + halfD - 1; z++) {
    for (let x = cx - halfW + 1; x <= cx + halfW - 1; x++) {
      const onAxis = Math.abs(z - cz) <= 1;
      world.set(x, level, z, onAxis ? P.greenGlass : (x + z) % 5 === 0 ? P.polishedTuff : P.tuff);
    }
  }

  // --- the great dark-oak door, in the east wall on the axis -------------------
  // Two blocks of black andesite frame it, and the lintel carries the Veil
  // Company's mark in green glass.
  const doorX = cx + halfW;
  for (let y = level + 1; y <= level + 10; y++) {
    for (let z = cz - 3; z <= cz + 3; z++) world.set(doorX, y, z, AIR);
  }
  for (let z = cz - 4; z <= cz + 4; z++) {
    for (let y = level + 1; y <= level + 11; y++) {
      const frame = Math.abs(z - cz) === 4 || y === level + 11;
      if (frame) world.set(doorX, y, z, P.polishedAndesite);
    }
  }
  // The door itself: a slab of dark oak, six wide and ten tall, standing in
  // the opening rather than filling it - the reference's door is ajar, and it
  // is enormous, which is the whole reason it reads as a *door* and not as a
  // hole with a plank in it.
  for (let y = level + 1; y <= level + 10; y++) {
    for (let z = cz - 3; z <= cz + 2; z++) {
      const stile = z === cz - 3 || z === cz + 2 || y === level + 1 || y === level + 10;
      const rail = y === level + 5 || y === level + 6;
      world.set(doorX, y, z, stile || rail ? P.darkOakLog : P.darkOakPlanks);
    }
  }
  // Iron banding and a ring handle, so the slab has something to catch light.
  for (const y of [level + 3, level + 8]) {
    for (let z = cz - 2; z <= cz + 1; z++) world.set(doorX, y, z, P.cobbledDeepslateWall);
  }
  for (const dz of [0, 1]) {
    world.set(doorX, level + 4, cz + dz, P.ironBars);
  }
  // A green-glass fanlight over the lintel.
  glassMosaic(world, doorX, level + 13, cz, 3, 1, false, SOUL_GREEN, P.polishedAndesite, 0x9051);
  for (const dz of [-4, 4]) {
    for (let y = level + 1; y <= level + 6; y++) world.set(doorX, y, cz + dz, P.polishedAndesite);
    world.set(doorX, level + 7, cz + dz, P.seaLantern);
  }

  // --- the twenty portals, set into the walls ---------------------------------
  // Ten along each long wall, spaced five apart so each frame has its own
  // course of green stone around it, alternating lit and sheared. A portal
  // standing free on a floor reads as a placed block; a portal *in* a wall of
  // green stone reads as a gate, which is what this place is.
  //
  // The spacing is the whole trick. Ten frames at the same z is ten frames in
  // the same hole, and the count of twenty would be satisfied by four.
  let placed = 0;
  for (const wallX of [cx - halfW + 1, cx + halfW - 1]) {
    for (let i = 0; i < 10; i++) {
      if (placed >= 16) break;
      const z = cz - 22 + i * 5;
      // Leave the doorway clear: the great dark-oak door is on the axis, and a
      // gate frame three blocks behind it is neither one thing nor the other.
      if (Math.abs(z - cz) <= 6) continue;
      portalFrame(world, wallX, level + 1, z, false, i % 3 === 0);
      surroundGate(world, wallX, level + 1, z);
      placed++;
    }
  }
  // Four more in the north and south walls, so twenty is twenty.
  for (const wallZ of [cz - halfD + 1, cz + halfD - 1]) {
    for (const dx of [-6, 6]) {
      if (placed >= 20) break;
      portalFrame(world, cx + dx, level + 1, wallZ, true, placed % 3 === 1);
      surroundGate(world, cx + dx, level + 1, wallZ);
      placed++;
    }
  }

  // --- the light ---------------------------------------------------------------
  for (let i = 0; i < 6; i++) {
    const z = cz - 20 + i * 8;
    lampPost(world, cx, z, level + 1, P.greenGlass, 4);
  }  for (const dx of [-6, 6]) {
    for (const dz of [-18, 18]) prismPillar(world, cx + dx, cz + dz, level + 1, 7, SOUL_GREEN, 0x9053 + dx);
  }
  // The tower that used to stand here is now the gate pier over the door: a
  // polished andesite crown on the east wall, lit, visible from the causeway.
  for (let y = top + 1; y <= top + 6; y++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) === 1 && Math.abs(dz) === 2) continue;
        world.set(doorX + dx, y, cz + dz, P.polishedAndesite);
      }
    }
  }
  world.set(doorX, top + 7, cz, P.glowstone);

  world.protect(cx, cz, Math.max(halfW, halfD) + 2);
}

function greenGlazingLocal(world: World, cx: number, cz: number, radius: number, y: number): void {
  const panes = [P.greenGlass, P.limeGlass, P.cyanGlass, P.purpleGlass];
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(ang) * radius);
    const pz = cz + Math.round(Math.sin(ang) * radius);
    world.set(px, y, pz, panes[a % panes.length]!);
  }
}
