import { describe, expect, test } from "bun:test";
import { entryContentTypeToFormatMap } from "mcbe-leveldb";
import { AIR, GRAVITY_BLOCK_NAMES, P } from "./blocks.ts";
import { CONFIG, WORLD_HEIGHT, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z } from "./config.ts";
import { LANDMARKS } from "./layout.ts";
import { generateTerrain } from "./terrain.ts";
import { buildAllAreas } from "./areas.ts";
import { canopyCoverage, CANOPY_BAND } from "./sky_canopy.ts";
import { SHEETS as CANOPY_SHEETS } from "./sky_canopy.ts";
import { beaconCourse, beaconMast, BEACON_COLOURS, BEACON_CROWN_Y } from "./beacons.ts";
import { VEIL_COURT } from "./veil_castle.ts";
import { serializeSubChunk } from "../bedrock/subchunk.ts";
import { buildSceneWorld } from "./scene.ts";
import { World } from "./world.ts";

/** The full generation pipeline, in the order build.ts runs it. */
function generateWorld(): World {
  return buildSceneWorld().world;
}

/**
 * Blocks that count as "a built walkable surface" for the reachability test.
 * The footpaths are paved in glazing, so the glass variants are in here too -
 * without them the path pass would look like it had built nothing.
 */
const PAVED: ReadonlySet<string> = new Set([
  P.polishedDeepslate.name,
  P.cobbledDeepslate.name,
  P.deepslateTiles.name,
  P.crackedDeepslateBricks.name,
  P.polishedBlackstone.name,
  P.blackstone.name,
  P.blackstoneBricks.name,
  P.deepslateBricks.name,
  P.stoneBrick.name,
  P.coarseDirt.name,
  P.greenGlass.name,
  P.limeGlass.name,
  P.cyanGlass.name,
  P.purpleGlass.name,
  P.magentaGlass.name,
  P.lightBlueGlass.name,
]);

async function parseSubChunk(payload: Buffer): Promise<number[]> {
  const parsed = (await entryContentTypeToFormatMap.SubChunkPrefix.parse(payload)) as unknown as {
    value: { layers: { value: { value: Array<{ block_indices: { value: { value: number[] } } }> } } };
  };
  return parsed.value.layers.value.value[0]!.block_indices.value.value;
}

describe("chunk buffer", () => {
  test("palette index 0 is air so untouched space is empty", () => {
    const world = new World();
    const chunk = world.chunkOrCreate(0, 0);
    expect(chunk.palette[0]!.name).toBe(AIR.name);
    expect(chunk.isSubChunkEmpty(0)).toBe(true);
    expect(chunk.isSubChunkEmpty(7)).toBe(true);

    world.set(1, 40, 1, P.goldBlock);
    expect(chunk.isSubChunkEmpty(2)).toBe(false); // y 32..47
    expect(chunk.isSubChunkEmpty(1)).toBe(true);
  });

  test("uniform subchunks survive the empty check", () => {
    const world = new World();
    const chunk = world.chunkOrCreate(1, 1);
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        for (let y = 16; y < 32; y++) world.set(16 + x, y, 16 + z, P.deepslate);
      }
    }
    expect(chunk.isSubChunkEmpty(1)).toBe(false);
    const slice = chunk.subChunkSlice(1);
    expect(slice.palette.length).toBe(1);
    expect(slice.palette[0]!.name).toBe(P.deepslate.name);
    expect(slice.ids.every((id) => id === 0)).toBe(true);
  });

  test("writes outside the realm are ignored", () => {
    const world = new World();
    world.set(10000, 40, 10000, P.goldBlock);
    expect(world.get(10000, 40, 10000)).toBeUndefined();
    expect(world.set).toBeTruthy();
  });

  test("serializes subchunks in Bedrock's XZY order", async () => {
    // Regression test: the buffer is laid out Y-major, Bedrock stores a
    // subchunk Y-fastest. Writing the buffer layout straight into the payload
    // swaps the X and Y axes and the imported world comes out as striped
    // terrain. The block at (3, 40, 5) must land at Bedrock index
    // (3 << 8) | (5 << 4) | (40 & 15) = 852 and nowhere else.
    const world = new World();
    world.set(3, 40, 5, P.goldBlock);
    const slice = world.chunk(0, 0)!.subChunkSlice(2); // y 32..47
    const payload = serializeSubChunk(slice.ids, slice.palette, { version: 9, subChunkIndex: 2 });
    const indices = await parseSubChunk(payload);

    const expected = (3 << 8) | (5 << 4) | (40 & 15);
    expect(indices[expected]).toBe(slice.palette.findIndex((b) => b.name === P.goldBlock.name));
    expect(indices.filter((id) => id !== indices[0])).toEqual([indices[expected]]);
  });

  test("never writes a gravity block into the world", () => {
    const world = new World();
    // The palette still *names* gravel/sand (the terrain code asks for them as
    // the shade of ground it wants), but they must never reach the buffer.
    for (const block of [P.gravel, P.sand]) {
      expect(GRAVITY_BLOCK_NAMES.has(block.name)).toBe(true);
    }
    // The stand-in keeps the *role* of the original: gravel is the ash-grey
    // wasteland ground (-> tuff, canon "almost everything is gray or black"),
    // sand only appears in the escape-room parkour (-> the green glazing).
    world.set(1, 40, 1, P.gravel);
    world.set(2, 40, 1, P.sand);
    expect(world.get(1, 40, 1)!.name).toBe(P.tuff.name);
    expect(world.get(2, 40, 1)!.name).toBe(P.greenGlass.name);

    const generated = generateWorld();
    const offenders = new Set<string>();
    for (const chunk of generated.allChunks()) {
      for (const block of chunk.palette) {
        if (GRAVITY_BLOCK_NAMES.has(block.name)) offenders.add(block.name);
      }
    }
    expect([...offenders]).toEqual([]);
  });
});

describe("terrain", () => {
  test("is deterministic for a fixed seed", () => {
    const a = new World();
    generateTerrain(a);
    const b = new World();
    generateTerrain(b);
    let checksumA = 0;
    let checksumB = 0;
    for (let i = 0; i < a.surface.length; i += 97) {
      checksumA = (checksumA + a.surface[i]! * (i + 1)) % 1_000_003;
      checksumB = (checksumB + b.surface[i]! * (i + 1)) % 1_000_003;
    }
    expect(checksumA).toBe(checksumB);
    expect(checksumA).toBeGreaterThan(0);
  });

  test("keeps every landmark on solid land", () => {
    const world = new World();
    generateTerrain(world);
    buildAllAreas(world);
    for (const landmark of Object.values(LANDMARKS)) {
      // After the landmarks are built their centres must be walkable ground.
      const surface = world.surfaceAt(landmark.center.x, landmark.center.z);
      const block = world.get(landmark.center.x, surface, landmark.center.z);
      expect(surface, landmark.name).toBeGreaterThan(CONFIG.minY);
      expect(block?.name, `${landmark.name} at ${landmark.center.x},${landmark.center.z} y=${surface}`).not.toBe(AIR.name);
    }
  });

  test("the void gulf separates the Center from the Citadel", () => {
    const world = new World();
    generateTerrain(world);
    const gulfMid = Math.round((CONFIG.terrain.voidGulf.minX + CONFIG.terrain.voidGulf.maxX) / 2);
    expect(world.isLand(gulfMid, 40)).toBe(false);
    expect(world.isLand(0, 40)).toBe(true);
    expect(world.isLand(-160, 40)).toBe(true);
  });

  test("the west darkens toward the End", () => {
    // Canon: "The sky and void grow increasingly darker as the proximity to the
    // end shortens." Asserted on the real surface palette, because the ramp
    // used to begin past x=-215 - beyond the Citadel, the Tomb and the Portal
    // Lobby - so every built place in the west was exactly as light as the
    // east and the gradient only ever appeared on the empty rim.
    const world = new World();
    generateTerrain(world);
    const dark = new Set([
      P.blackstone.name,
      P.polishedBlackstone.name,
      P.basalt.name,
      P.cryingObsidian.name,
      P.blackConcrete.name,
    ]);
    const blackFraction = (fromX: number, toX: number): number => {
      let darkColumns = 0;
      let columns = 0;
      for (let z = -180; z <= 180; z += 2) {
        for (let x = fromX; x <= toX; x += 2) {
          if (!world.isLand(x, z)) continue;
          columns++;
          const block = world.get(x, world.surfaceAt(x, z), z);
          if (block && dark.has(block.name)) darkColumns++;
        }
      }
      expect(columns, `no land in x ${fromX}..${toX}`).toBeGreaterThan(200);
      return darkColumns / columns;
    };
    // Both bands sit clear of every landmark, so this is the wasteland itself.
    const west = blackFraction(-215, -196);
    const east = blackFraction(182, 212);
    // Soul flats and the obsidian/tuff tail keep even the darkest band under
    // 50%; what matters is that the far west is overwhelmingly black and the
    // east plainly is not.
    expect(west, `${(west * 100).toFixed(0)}% of the far-west ground is black rock`).toBeGreaterThan(
      0.35,
    );
    expect(east, `${(east * 100).toFixed(0)}% of the eastern ground is black rock`).toBeLessThan(0.3);
    expect(west).toBeGreaterThan(east + 0.15);
  });

  test("vertical range stays inside the generated buffer", () => {
    const world = new World();
    const stats = generateTerrain(world);
    expect(stats.maxY).toBeLessThan(WORLD_HEIGHT);
    expect(stats.minY).toBeGreaterThanOrEqual(0);
  });

  test("the wilderness between the landmarks is a ruined plain", () => {
    // Canon: "an endless plain of broken structures". If a future detail pass is
    // tuned down, or the ruins get excluded by an over-wide landmark margin, the
    // map silently goes back to being bare noise, so hold the coverage in a
    // band: enough masonry standing to read as ruined, not so much that the
    // plain is a wall.
    const world = generateWorld();
    let columns = 0;
    let carrying = 0;
    for (let z = -190; z <= 190; z += 2) {
      for (let x = -190; x <= 190; x += 2) {
        if (!world.inRealm(x, z) || !world.isLand(x, z)) continue;
        let inLandmark = false;
        for (const landmark of Object.values(LANDMARKS)) {
          const f = landmark.footprint;
          if (x >= f.x1 && x <= f.x2 && z >= f.z1 && z <= f.z2) {
            inLandmark = true;
            break;
          }
        }
        if (inLandmark) continue;
        columns++;
        const surface = world.surfaceAt(x, z);
        for (let y = surface + 1; y <= Math.min(CONFIG.maxY, surface + 24); y++) {
          const block = world.get(x, y, z);
          if (block && block.name !== AIR.name) {
            carrying++;
            break;
          }
        }
      }
    }
    const fraction = carrying / columns;
    expect(fraction, `${(fraction * 100).toFixed(1)}% of the plain carries standing detail`).toBeGreaterThan(0.04);
    expect(fraction).toBeLessThan(0.25);
  });

  test("the plate is torn: cracks open onto the void, the rim sheds, and detail reaches the edge", () => {
    // Three properties of the finished plain, all of which were silently false
    // before: the fracture pass stopped carving at the first protected column
    // (so it opened nothing), and every detail pass stopped 30 blocks short of
    // the plate on each side (so a third of the walkable plain carried no ruin
    // at all). Each is asserted on the real world rather than on a helper, so a
    // future retune cannot quietly undo it.
    const world = generateWorld();
    const orthogonal = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const ring = [...orthogonal, [1, 1], [1, -1], [-1, 1], [-1, -1]];

    let mouths = 0;
    let rimColumns = 0;
    for (let z = WORLD_MIN_Z; z <= WORLD_MAX_Z; z++) {
      for (let x = WORLD_MIN_X; x <= WORLD_MAX_X; x++) {
        if (!world.inRealm(x, z)) continue;
        if (world.isLand(x, z)) continue;
        let land = 0;
        for (const [dx, dz] of ring) {
          const nx = x + dx!;
          const nz = z + dz!;
          if (world.inRealm(nx, nz) && world.isLand(nx, nz)) land++;
        }
        if (land < 6) {
          // Material hanging in the void just off the plate - the rim shedding.
          if (land > 0) rimColumns++;
          continue;
        }
        // A crack that tore clean through: open to the void from top to bottom.
        let air = 0;
        for (let y = 0; y < CONFIG.maxY; y++) {
          const block = world.get(x, y, z);
          if (block && block.name !== AIR.name) break;
          air++;
        }
        if (air >= 12) mouths++;
      }
    }
    expect(mouths, `${mouths} cracks in the plate open onto the void`).toBeGreaterThan(20);
    expect(rimColumns, `${rimColumns} torn columns hang beside the plate`).toBeGreaterThan(500);

    // The outer band of the plate - beyond the square the old passes stopped at.
    let outer = 0;
    let outerCarrying = 0;
    for (let z = WORLD_MIN_Z; z <= WORLD_MAX_Z; z++) {
      for (let x = WORLD_MIN_X; x <= WORLD_MAX_X; x++) {
        if (!world.inRealm(x, z) || !world.isLand(x, z)) continue;
        if (Math.max(Math.abs(x), Math.abs(z)) <= 196) continue;
        let inLandmark = false;
        for (const landmark of Object.values(LANDMARKS)) {
          const f = landmark.footprint;
          if (x >= f.x1 && x <= f.x2 && z >= f.z1 && z <= f.z2) {
            inLandmark = true;
            break;
          }
        }
        if (inLandmark) continue;
        outer++;
        const surface = world.surfaceAt(x, z);
        for (let y = surface + 1; y <= Math.min(CONFIG.maxY, surface + 24); y++) {
          const block = world.get(x, y, z);
          if (block && block.name !== AIR.name) {
            outerCarrying++;
            break;
          }
        }
      }
    }
    const outerFraction = outerCarrying / outer;
    expect(outer, "the outer band of the plate is empty").toBeGreaterThan(1000);
    expect(
      outerFraction,
      `${(outerFraction * 100).toFixed(1)}% of the plate rim carries detail`,
    ).toBeGreaterThan(0.05);
    expect(outerFraction).toBeLessThan(0.35);
  });

  test("every landmark is reachable on foot from the road network", () => {
    // The hand-authored roads reach the inner map; this asserts the outer ring
    // is not stranded. A landmark whose nearest road is over the void gulf
    // (the Citadel chain, which is crossed by the glass bridges instead) is
    // exempt - that crossing is deliberate, and paving over the gulf would
    // destroy the void-castle sequence.
    const world = generateWorld();
    const gulf = CONFIG.terrain.voidGulf;
    const exempt = new Set(["citadel", "dungeonChain", "tomb"]);
    const stranded: string[] = [];
    for (const landmark of Object.values(LANDMARKS)) {
      if (exempt.has(landmark.id)) continue;
      // Walk outward from the landmark gate along the paved surface and see
      // whether the path network reaches a road column.
      const f = landmark.footprint;
      const gate = { x: Math.round((f.x1 + f.x2) / 2), z: f.z2 };
      let reached = false;
      for (let r = 6; r <= 160 && !reached; r += 2) {
        for (let a = 0; a < 16 && !reached; a++) {
          const ang = (a / 16) * Math.PI * 2;
          const px = Math.round(gate.x + Math.cos(ang) * r);
          const pz = Math.round(gate.z + Math.sin(ang) * r);
          if (!world.inRealm(px, pz) || !world.isLand(px, pz)) continue;
          if (px < gulf.minX && px > gulf.maxX) continue;
          const surface = world.surfaceAt(px, pz);
          const block = world.get(px, surface, pz);
          // A road or footpath surface: paved stone, not raw ground.
          if (block && PAVED.has(block.name)) reached = true;
        }
      }
      if (!reached) stranded.push(landmark.name);
    }
    expect(stranded, `no walkable route to: ${stranded.join(", ")}`).toEqual([]);
  });

  test("the footpaths are paved in stained glass, not stone", () => {
    // The path pass was originally paved in polished deepslate, which made it
    // indistinguishable from a road and lost the one thing the canon calls
    // vibrant in this realm. Assert the actual glass: a green centre line,
    // prism bands either side, and a deepslate kerb framing the glazing.
    const world = generateWorld();
    const glass = new Set([
      P.greenGlass.name,
      P.limeGlass.name,
      P.cyanGlass.name,
      P.purpleGlass.name,
      P.magentaGlass.name,
      P.lightBlueGlass.name,
    ]);
    let glassCells = 0;
    let centreLine = 0;
    let kerb = 0;
    for (let z = WORLD_MIN_Z; z <= WORLD_MAX_Z; z++) {
      for (let x = WORLD_MIN_X; x <= WORLD_MAX_X; x++) {
        if (!world.inRealm(x, z) || !world.isLand(x, z)) continue;
        const surface = world.surfaceAt(x, z);
        const block = world.get(x, surface, z);
        if (!block) continue;
        if (glass.has(block.name)) {
          glassCells++;
          // A centre-line cell has glazed neighbours on both sides of it.
          if ([-1, 1].every((d) => {
            const n = world.get(x + d, surface, z);
            return n !== undefined && glass.has(n.name);
          })) {
            centreLine++;
          }
        } else if (block.name === P.polishedDeepslate.name) {
          kerb++;
        }
      }
    }
    expect(glassCells, "no glazed footpath was laid").toBeGreaterThan(200);
    expect(centreLine, "the green centre line did not survive").toBeGreaterThan(40);
    expect(kerb, "the path has no deepslate kerb framing the glazing").toBeGreaterThan(100);
  });

  test("the glass trees are entirely glass - no leaves in the world at all", () => {
    // The reference's crowns are glazing, not foliage with glazing in it. The
    // trees were originally dark-oak leaves shot through with glass, which is
    // a different (and much quieter) object. Asserted on the whole world, not
    // just the grove, so a future "just add leaves back for texture" is caught.
    const world = generateWorld();
    const leaves = new Set([
      P.darkOakLeaves.name,
      P.oakLeaves.name,
      "minecraft:leaves",
      "minecraft:azalea_leaves",
    ]);
    let leafBlocks = 0;
    let glassAbove = 0;
    for (const chunk of world.allChunks()) {
      for (const block of chunk.palette) {
        if (leaves.has(block.name)) leafBlocks++;
        if (/stained_glass$|_glass$/.test(block.name)) glassAbove++;
      }
    }
    expect(leafBlocks, `${leafBlocks} leaf blocks reached the world`).toBe(0);
    expect(glassAbove, "the world lost its glazing").toBeGreaterThan(30);
  });

  test("the cathedral has layered glass sheets stacked in the sky", () => {
    // The reference's most distinctive image is stacked translucent sheets
    // floating overhead with green fronds on their rims. A single flat sheet
    // would pass a naive "is there glass up there" check, so this counts
    // distinct occupied heights: the layering is the whole point.
    const lm = LANDMARKS.cathedral;
    const world = generateWorld();
    const heights = new Set<number>();
    let skyGlass = 0;
    for (let z = lm.footprint.z1; z <= lm.footprint.z2; z++) {
      for (let x = lm.footprint.x1; x <= lm.footprint.x2; x++) {
        for (let y = 60; y < CONFIG.maxY; y++) {
          const block = world.get(x, y, z);
          if (!block) continue;
          if (!/stained_glass$/.test(block.name)) continue;
          skyGlass++;
          heights.add(y);
        }
      }
    }
    expect(skyGlass, "no glass above the cathedral").toBeGreaterThan(5000);
    // Five sheets, so at least five distinct Y levels carry glass.
    expect(heights.size, `glass occupies only ${heights.size} distinct heights`).toBeGreaterThanOrEqual(5);
  });

  test("every landmark has a lit green-glass path reaching its gate", () => {
    // The request was a path to *every* structure, not only to the ones the
    // hand-authored roads missed. Asserted per-landmark: within a short walk of
    // the landmark's gate there must be green glass paving, and a glowstone
    // course under it, because stained glass does not light itself.
    const world = generateWorld();
    const missing: string[] = [];
    for (const lm of Object.values(LANDMARKS)) {
      const f = lm.footprint;
      // Scan the whole footprint boundary, not just four edge midpoints: a path
      // is laid from whichever point on the edge is nearest the road, which for
      // an off-centre landmark is a corner, and checking only the midpoints
      // would report a perfectly good path as missing.
      const gates: Array<{ x: number; z: number }> = [];
      for (let x = f.x1; x <= f.x2; x += 4) {
        gates.push({ x, z: f.z1 }, { x, z: f.z2 });
      }
      for (let z = f.z1; z <= f.z2; z += 4) {
        gates.push({ x: f.x1, z }, { x: f.x2, z });
      }
      let found = false;
      // The path signature is green glass sitting directly on glowstone. Plain
      // green glass is not enough: the landmarks themselves are glazed, so
      // matching on colour alone would pass on a building's own windows and
      // never prove a path was laid.
      outer: for (const gate of gates) {
        for (let r = 2; r <= 30; r++) {
          for (let a = 0; a < 24; a++) {
            const ang = (a / 24) * Math.PI * 2;
            const px = Math.round(gate.x + Math.cos(ang) * r);
            const pz = Math.round(gate.z + Math.sin(ang) * r);
            if (!world.inRealm(px, pz) || !world.isLand(px, pz)) continue;
            const s = world.surfaceAt(px, pz);
            if (world.get(px, s, pz)?.name !== P.greenGlass.name) continue;
            if (world.get(px, s - 1, pz)?.name !== P.glowstone.name) continue;
            found = true;
            break outer;
          }
        }
      }
      if (!found) missing.push(`${lm.id} (no lit green-glass path at any gate)`);
    }
    expect(missing, `unreachable or unlit: ${missing.join("; ")}`).toEqual([]);
  });

  test("a lit green-glass avenue runs west from the Underworld into Purgatory", () => {
    // Purgatory occupies world x -896..-353, immediately west of the realm edge
    // at -352. The avenue has to actually reach the threshold, not stop at the
    // island's coast with a gap over the void.
    const world = generateWorld();
    const centreZ = 40;
    let greenRun = 0;
    let best = 0;
    let lit = 0;
    for (let x = -352; x <= -200; x++) {
      if (!world.isLand(x, centreZ)) {
        greenRun = 0;
        continue;
      }
      const s = world.surfaceAt(x, centreZ);
      if (world.get(x, s, centreZ)?.name !== P.greenGlass.name) {
        greenRun = 0;
        continue;
      }
      greenRun++;
      if (greenRun > best) best = greenRun;
      if (world.get(x, s - 1, centreZ)?.name === P.glowstone.name) lit++;
    }
    expect(best, "no unbroken green-glass run along z=40").toBeGreaterThan(40);
    // The avenue has to arrive at the very edge of the realm.
    expect(best, `the avenue only runs ${best} blocks west`).toBeGreaterThan(120);
    expect(lit, "the avenue is not lit from below").toBeGreaterThan(100);
  });

  test("the Splice has fused workstations - blocks spliced into portal frames", () => {
    // The "corrupted block that is easy to make" the request asked for: real
    // blocks in an impossible arrangement. Assert on the actual fusion - a
    // crafting table with an enchanting table stacked on it, ringed by end
    // portal frames - because that is the whole point of the build.
    const lm = LANDMARKS.splice;
    const world = generateWorld();
    let fusions = 0;
    let frames = 0;
    for (let z = lm.footprint.z1; z <= lm.footprint.z2; z++) {
      for (let x = lm.footprint.x1; x <= lm.footprint.x2; x++) {
        if (world.get(x, world.surfaceAt(x, z) + 1, z)?.name !== P.craftingTable.name) continue;
        if (world.get(x, world.surfaceAt(x, z) + 2, z)?.name !== P.enchantingTable.name) continue;
        fusions++;
        for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          if (world.get(x + dx, world.surfaceAt(x, z) + 2, z + dz)?.name === "minecraft:end_portal_frame") frames++;
        }
      }
    }
    expect(fusions, "no crafting-table-into-enchanting-table fusions").toBeGreaterThan(3);
    expect(frames, "the fusions are not ringed in end-portal frames").toBeGreaterThan(8);
  });

  test("every landmark actually builds something", () => {
    // A landmark that silently produced no geometry is invisible on a top-down
    // map and only shows up in game, so each one is fingerprinted by a block
    // that only it places. The tomb's rooms sit *below* the ground and the pads
    // sit flush with it, so the whole footprint volume is scanned.
    const world = generateWorld();
    for (const landmark of Object.values(LANDMARKS)) {
      const signature = SIGNATURES[landmark.id]!;
      expect(signature, `no signature block registered for ${landmark.id}`).toBeTruthy();
      const f = landmark.footprint;
      let found = 0;
      let raised = 0;
      for (let z = f.z1; z <= f.z2; z++) {
        for (let x = f.x1; x <= f.x2; x++) {
          const surface = world.surfaceAt(x, z);
          for (let y = 0; y < CONFIG.maxY; y++) {
            const block = world.get(x, y, z);
            if (!block) break;
            if (block.name === signature) found++;
            if (y > surface && block.name !== AIR.name) raised++;
          }
        }
      }
      expect(found, `${landmark.name} never placed a ${signature}`).toBeGreaterThan(0);
      expect(raised, `${landmark.name} has nothing built above the ground`).toBeGreaterThan(0);
    }
  });
});

describe("the Sunken City and the Warden's Deep Dark", () => {
  test("builds a real sculk bowl for the arena, not just a ring on a plate", () => {
    const world = generateWorld();
    const { x: cx, z: cz } = LANDMARKS.wardenArena.center;
    const rim = world.surfaceAt(cx + 21, cz);
    const floor = world.surfaceAt(cx, cz);
    expect(floor, "the middle of the arena should be sunk below its rim").toBeLessThan(rim - 10);
    // the bowl must actually be a bowl: descend outward on both axes
    expect(world.surfaceAt(cx, cz + 10)).toBeLessThan(rim);
    expect(world.surfaceAt(cx - 10, cz)).toBeLessThan(rim);
  });

  test("sculks the floor of the pit", () => {
    const world = generateWorld();
    const { x: cx, z: cz } = LANDMARKS.wardenArena.center;
    let sculk = 0;
    for (let dz = -12; dz <= 12; dz++)
      for (let dx = -12; dx <= 12; dx++) {
        const s = world.surfaceAt(cx + dx, cz + dz);
        for (let y = s; y <= s + 1 && y < CONFIG.maxY; y++)
          if (world.get(cx + dx, y, cz + dz)?.name === P.sculk.name) sculk++;
      }
    expect(sculk, "the pit floor should be spreading with sculk").toBeGreaterThan(200);
  });

  test("places the shrieker disarmed, so opening the world cannot spawn a warden", () => {
    // can_summon:false matters here - a world that spawns a boss on load is
    // hostile, and the arena is meant to be found on the player's terms.
    expect(P.sculkShrieker.states).toMatchObject({ can_summon: false });
  });
});

describe("the Sunken City's glazing", () => {
  // The city used to be deepslate from the plate up, which on a phone read as
  // a grey slab in the middle of the most colour-saturated map in the
  // Underworld. The fix faces the world with glass instead - and the whole
  // reason that fix is safe is the pair of assertions at the bottom of this
  // block: the Warden's pit is *not* glazed. Bright glass only reads as bright
  // next to something that stayed dark.
  const LEVEL = 44;
  const PLATE = { x1: 234, z1: 250, x2: 326, z2: 330 };
  /** The Warden's pit under the city's middle. */
  const PIT = { x: 282, z: 292, radius: 21 };

  const countIn = (world: World, x1: number, z1: number, x2: number, z2: number, y1: number, y2: number, match: (name: string) => boolean): number => {
    let n = 0;
    for (let z = z1; z <= z2; z++) {
      for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
          const name = world.get(x, y, z)?.name;
          if (name && match(name)) n++;
        }
      }
    }
    return n;
  };
  const isGlass = (name: string): boolean => name.includes("stained_glass");
  const isDeepslate = (name: string): boolean => name.includes("deepslate");

  test("the plate's outer face is a glazed foundation, not a wall of rock", () => {
    const world = generateWorld();
    // Only the perimeter columns, and only the band the player sees from the
    // void ring: level-10 to level.
    let glass = 0;
    let rock = 0;
    for (let z = PLATE.z1; z <= PLATE.z2; z++) {
      for (let x = PLATE.x1; x <= PLATE.x2; x++) {
        const onRim = x === PLATE.x1 || x === PLATE.x2 || z === PLATE.z1 || z === PLATE.z2;
        if (!onRim) continue;
        for (let y = LEVEL - 10; y <= LEVEL; y++) {
          const name = world.get(x, y, z)?.name;
          if (!name) continue;
          if (isGlass(name)) glass++;
          else if (isDeepslate(name)) rock++;
        }
      }
    }
    expect(glass, "the city's outward face should be mostly glazing").toBeGreaterThan(1500);
    // The mullions and the cornice are deepslate on purpose, so this is a
    // "most of it", not a "all of it". If deepslate ever wins this is the
    // assertion that says the rim went back to being a rock face.
    expect(glass, "glazing should outnumber the deepslate framing on the rim").toBeGreaterThan(rock);
  });

  test("the plaza is paved in glass inlay rather than plain cobble", () => {
    const world = generateWorld();
    // A diagonal inlay every 7 blocks, over the whole plate top.
    const glass = countIn(world, PLATE.x1, PLATE.z1, PLATE.x2, PLATE.z2, LEVEL, LEVEL, isGlass);
    expect(glass, "the plate top should be inlaid with glass, not left as bare cobble").toBeGreaterThan(500);
  });

  test("each hall has a glazed vault, a glazed band and an eye in the end wall", () => {
    const world = generateWorld();
    const { x: cx, z: cz } = LANDMARKS.ancientCity.center;
    const halls: Array<[number, number, number, number]> = [
      [cx - 34, cz - 30, cx - 12, cz - 6],
      [cx - 6, cz - 32, cx + 20, cz - 8],
      [cx - 28, cz + 8, cx + 4, cz + 30],
    ];
    for (const [x1, z1, x2, z2] of halls) {
      // the vault is one course at level+7; it should be mostly glass
      const vault = countIn(world, x1, z1, x2, z2, LEVEL + 7, LEVEL + 7, isGlass);
      expect(vault, `the hall at ${x1},${z1} should have a glazed vault`).toBeGreaterThan(150);
      // ...and the wall band at level+4..6. A quarter of the band is mullion
      // and a quarter is structural rib, so this is "most of the band", not
      // "all of it" - the deepslate is what keeps it reading as Ancient City.
      const band = countIn(world, x1, z1, x2, z2, LEVEL + 4, LEVEL + 6, isGlass);
      expect(band, `the hall at ${x1},${z1} should have a glazed wall band`).toBeGreaterThan(60);
      // ...and the eye, whose pupil is black glass dead centre of the end wall
      const pupil = world.get(x1, LEVEL + 4, Math.round((z1 + z2) / 2))?.name;
      expect(pupil, `the hall at ${x1},${z1} should have an eye window in its end wall`).toBe(
        P.blackGlass.name,
      );
    }
  });

  test("the spine corridor is a glazed avenue, not an 80-block tunnel", () => {
    const world = generateWorld();
    const { x: cx, z: cz } = LANDMARKS.ancientCity.center;
    // The roof course of the corridor, along its whole length.
    const glass = countIn(world, cx - 40, cz - 1, cx + 40, cz + 1, LEVEL + 6, LEVEL + 6, isGlass);
    expect(glass, "the spine's vault should be glazed along its length").toBeGreaterThan(100);
  });

  test("NEGATIVE: the Warden's pit stays dark - the glazing must not reach it", () => {
    // This is the constraint the whole rework hangs off. If a future pass
    // widens the plaza inlay or the rim glazing, this is what stops the one
    // genuinely frightening place in the city from being paved in purple.
    //
    // Two details this has to get right, both of which are easy to get wrong:
    // the bowl is a *disc*, so testing the bounding square counts the four
    // corners, which are plaza and are supposed to be glazed; and the top of
    // the range has to stop at level-4, because the plate caps the bowl with
    // four blocks of rock at level-4..level (see the note in
    // `probe-city.ts`) and that cap is the plaza surface, not the pit.
    const world = generateWorld();
    let glass = 0;
    for (let dz = -PIT.radius; dz <= PIT.radius; dz++) {
      for (let dx = -PIT.radius; dx <= PIT.radius; dx++) {
        if (Math.hypot(dx, dz) > PIT.radius) continue;
        for (let y = LEVEL - 30; y <= LEVEL - 4; y++) {
          if (isGlass(world.get(PIT.x + dx, y, PIT.z + dz)?.name ?? "")) glass++;
        }
      }
    }
    expect(glass, "no glazing may be laid inside the Warden's bowl").toBe(0);
  });

  test("NEGATIVE: the Warden himself is still down there - pit, sculk and all", () => {
    const world = generateWorld();
    const floor = world.surfaceAt(PIT.x, PIT.z);
    expect(floor, "the pit is still sunk below the city").toBeLessThan(LEVEL - 10);
    let sculk = 0;
    let catalyst = 0;
    for (let dz = -PIT.radius; dz <= PIT.radius; dz++) {
      for (let dx = -PIT.radius; dx <= PIT.radius; dx++) {
        if (Math.hypot(dx, dz) > PIT.radius) continue;
        const s = world.surfaceAt(PIT.x + dx, PIT.z + dz);
        for (let y = s; y <= s + 1 && y < CONFIG.maxY; y++) {
          const name = world.get(PIT.x + dx, y, PIT.z + dz)?.name;
          if (name === P.sculk.name) sculk++;
          if (name === P.sculkCatalyst.name) catalyst++;
        }
      }
    }
    expect(sculk, "the bowl's floor must still be spreading with sculk").toBeGreaterThan(100);
    expect(catalyst, "the bowl's rim must still be ringed with catalyst").toBeGreaterThan(5);
    expect(world.get(PIT.x, floor, PIT.z)?.name, "the shrieker is still at the bottom").toBe(
      P.sculkShrieker.name,
    );
  });
});


/**
 * The block each landmark is fingerprinted by - one that only it places.
 * Module scope so the "did it build?" test and the "was it paved over?" test
 * cannot drift apart.
 */
const SIGNATURES: Record<string, string> = {
  breach: P.obsidian.name,
  ruinedCastle: P.portal.name,
  fields: P.wheat.name,
  ashenReaches: P.lava.name,
  center: P.goldBlock.name,
  graveyard: "minecraft:polished_blackstone_brick_slab",
  ruins: P.chiseledDeepslate.name,
  mazeValley: P.deepslateBricks.name,
  village: P.coarseDirt.name,
  frostPocket: P.blueIce.name,
  tomb: P.sculkCatalyst.name,
  dungeonChain: P.gildedBlackstone.name,
  citadel: P.bookshelf.name,
  portalLobby: P.polishedAndesite.name,
  glassworks: P.greenGlass.name,
  portalField: P.cryingObsidian.name,
  endRuin: P.endPortal.name,
  glassGrove: P.purpleGlass.name,
  cathedral: P.blueGlass.name,
  splice: P.enchantingTable.name,
  ancientCity: P.chiseledDeepslate.name,
  wardenArena: P.sculkShrieker.name,
  veilCastle: P.smoothQuartz.name,
};

describe("landmark footprints", () => {
  // The Warden's arena was originally sited at (214,208), which overlapped the
  // Glassworks by 1 517 columns. The Glassworks is built later, so its floor
  // was laid straight over the sculk pit and sealed it - the arena existed in
  // the generator and was completely invisible in the world. Neither the audit
  // nor the existing landmark test noticed, because both only check that a
  // landmark built *something*; neither asks whether a later build buried it.
  //
  // Footprint rectangles are padded bounds and legitimately abut each other
  // (breach/frostPocket, mazeValley/village and others have always touched),
  // so "the rectangles overlap" is NOT the defect and is not what is asserted.
  // The defect is a landmark whose own centre is buried - i.e. something was
  // built over the top of it. That is what sealing looked like, and it is
  // detectable: a real landmark has geometry rising above its centre.
  test("no landmark has been paved over by a later build", () => {
    // The invariant that was actually violated, checked the way the player
    // experiences it: is the landmark's own signature material still present
    // in the part of its footprint that is uniquely its own?
    //
    // Open-air landmarks (the maze, the village, the tomb) have sky at their
    // centre, and the Splice is flat-topped by design, so neither "has an
    // interior" nor "rises above its neighbours" is a valid test. What
    // *is* always true is that the thing you built the landmark out of is
    // still there, in quantity, in its own footprint.
    const world = generateWorld();
    const gone: string[] = [];
    for (const landmark of Object.values(LANDMARKS)) {
      const f = landmark.footprint;
      if (f.kind !== "rect") continue;
      const signature = SIGNATURES[landmark.id]!;
      let found = 0;
      for (let z = f.z1; z <= f.z2; z++) {
        for (let x = f.x1; x <= f.x2; x++) {
          // scan the whole column, not just up to the surface: a landmark
          // that builds above ground (or below it, like the tomb) is the norm
          for (let y = 0; y < CONFIG.maxY; y++) {
            const b = world.get(x, y, z);
            if (!b) break;
            if (b.name === signature) found++;
          }
        }
      }
      if (found === 0) gone.push(`${landmark.id} (no ${signature} anywhere in its own footprint)`);
    }
    expect(gone, `landmarks paved over by a later build: ${gone.join("; ")}`).toEqual([]);
  });

  test("the warden arena's bowl is not sealed by a later build", () => {
    // Regression: the pit must still be the lowest thing at its own centre,
    // and a shrieker must sit at the bottom of it. A floor written over the
    // top leaves both of these true in the generator but false in the world.
    const world = generateWorld();
    const { x: cx, z: cz } = LANDMARKS.wardenArena.center;
    const floor = world.surfaceAt(cx, cz);
    const rim = world.surfaceAt(cx - 22, cz);
    expect(floor, "the pit floor should be well below the rim").toBeLessThan(rim - 15);

    let shrieker = 0;
    for (let y = 0; y < CONFIG.maxY; y++) {
      if (world.get(cx, y, cz)?.name === P.sculkShrieker.name) shrieker++;
    }
    expect(shrieker, "the shrieker should still be sitting at the bottom of the pit").toBe(1);
  });
});

describe("the sky canopy", () => {
  // The Cathedral hung a five-sheet glass sky over its own footprint, which is
  // right for a landmark and wrong for a sky: you walked out of the arch and
  // the ceiling stopped at the edge of the building. The canopy is the same
  // treatment spread over the whole realm, so these assert the property that
  // actually matters - that glass is overhead *everywhere*, not just in one
  // place, and that it did not cost the realm its ground detail to get there.
  test("glass hangs over the whole realm, not just the Cathedral", () => {
    const world = generateWorld();
    const { covered, total } = canopyCoverage(world, 24);
    // Comfortably under 1.0: the sheets are bounded discs with holes in them,
    // and the image depends on there being sky you can see through. If this
    // ever approaches 1.0 the canopy has become a lid and lost the parallax.
    expect(total).toBeGreaterThan(0);
    expect(covered / total, "the canopy should cover most of the plate").toBeGreaterThan(0.8);
    expect(covered / total, "the canopy must stay a canopy, not become a lid").toBeLessThan(0.99);
  });

  test("every sheet is inside the legal band and clear of the ceiling", () => {
    // The build ceiling is y=127 and the tallest thing in the realm is a
    // 34-block glass tree on a surface that reaches y=91, so the band is only
    // 24 blocks tall. A five-layer stack at gap 5 needs 25 and does not fit.
    //
    // This failure is invisible by construction: `glassSky` clamps an
    // overflowing stack instead of throwing, so an over-tall sheet does not
    // complain, it just quietly loses its top layer. The first draft of the
    // sheet table had 16 of 19 sheets over-tall and the only reason it was
    // caught is this assertion.
    const world = generateWorld();
    const overflowing = CANOPY_SHEETS.filter((s) => s.y + s.layers * s.layerGap > CANOPY_BAND.ceiling);
    expect(
      overflowing.map((s) => `${s.x},${s.z} (top y${s.y + s.layers * s.layerGap})`),
      "no sheet's stack may overflow the band, or glassSky silently truncates it",
    ).toEqual([]);
    const belowBand = CANOPY_SHEETS.filter((s) => s.y < CANOPY_BAND.floor);
    expect(belowBand, "no sheet may hang below the canopy band").toEqual([]);

    // And the payoff: a representative sheet kept *every* layer it was asked
    // for. glassSky clamps rather than throws, so a lost layer is silent -
    // this counts distinct occupied heights over the realm's centre and wants
    // the full spread the sheet list asks for.
    const centre = CANOPY_SHEETS[0]!;
    const heights = new Set<number>();
    for (let z = centre.z - centre.radius; z <= centre.z + centre.radius; z += 3) {
      for (let x = centre.x - centre.radius; x <= centre.x + centre.radius; x += 3) {
        for (let y = CANOPY_BAND.floor; y <= CANOPY_BAND.ceiling; y++) {
          const name = world.get(x, y, z)?.name;
          if (name && name.includes("stained_glass")) {
            heights.add(y);
            break;
          }
        }
      }
    }
    expect(
      heights.size,
      "the centre sheet should have kept every layer it was given",
    ).toBeGreaterThanOrEqual(centre.layers - 1);
  });

  test("the band hangs low enough to read at the lowest render distance", () => {
    // The band started at y100..y124, which clears every landmark and is
    // invisible on a phone: at minimum render distance a ceiling eight blocks
    // higher is the first thing past the far end of the view. It is now
    // y92..y116 - one block above the highest ground in the realm - and this
    // is the assertion that keeps it there.
    expect(CANOPY_BAND.floor, "the canopy should start just above the highest terrain").toBeLessThanOrEqual(96);
    expect(CANOPY_BAND.ceiling, "the band should still clear the build ceiling").toBeLessThanOrEqual(CONFIG.maxY - 8);
    const low = CANOPY_SHEETS.filter((s) => s.y <= CANOPY_BAND.floor + 4).length;
    expect(
      low,
      "most sheets should hang in the bottom of the band, not drift up out of sight",
    ).toBeGreaterThan(CANOPY_SHEETS.length / 2);
  });

  test("the canopy did not protect the ground and kill the detail pass", () => {
    // The one genuinely dangerous failure mode here. `glassSky` protects the
    // columns beneath a sheet by default, which is correct over a building and
    // catastrophic for a canopy drifting over open ground: it would switch off
    // ruins, ground fractures and detail scatter across most of the plate.
    //
    // The invariant is the *pairing*, not a raw count of unprotected ground:
    // a column can be under the canopy and still be open to the detail pass,
    // because the canopy is 60 blocks up and has no business claiming the
    // ground. Columns that are protected are protected by the landmark
    // underneath them, which is correct and not this test's business.
    const world = generateWorld();
    let underGlassOpen = 0;
    for (let z = -260; z <= 260; z += 11) {
      for (let x = -260; x <= 260; x += 11) {
        if (!world.inRealm(x, z)) continue;
        let under = false;
        for (let y = CANOPY_BAND.floor; y <= CANOPY_BAND.ceiling; y++) {
          const name = world.get(x, y, z)?.name;
          if (name && name.includes("stained_glass")) {
            under = true;
            break;
          }
        }
        if (under && !world.isProtected(x, z)) underGlassOpen++;
      }
    }
    expect(
      underGlassOpen,
      "columns under the canopy must still be open to ruins, fractures and detail",
    ).toBeGreaterThan(500);
  });
});

describe("the split tables and the collapsed seam", () => {
  // These six helpers (splitTable, brokenSplitTable, glassSplitTable,
  // portalRibbon, voidWindow, portalPillar) arrived with no call sites at all -
  // correct code, and invisible in the world. Wiring them in is only worth
  // anything if they are still standing afterwards, and "still standing" is
  // exactly what the Splice's own fill pass and the path painter are both
  // capable of undoing: the fill writes to the surface column, and the path
  // painter writes AIR one block above it. So each of these asserts the
  // geometry is in the *generated world*, not just in the helper.
  const countBlock = (world: World, name: string, x1: number, z1: number, x2: number, z2: number): number => {
    let n = 0;
    for (let z = z1; z <= z2; z++) {
      for (let x = x1; x <= x2; x++) {
        for (let y = 0; y < CONFIG.maxY; y++) {
          if (world.get(x, y, z)?.name === name) n++;
        }
      }
    }
    return n;
  };

  test("the Splice's split table rows survived its own detail pass", () => {
    const world = generateWorld();
    const { x: cx, z: cz } = LANDMARKS.splice.center;
    // Ten tables: five rows of two, either side of the aisle. Each row is 11
    // blocks apart and the benches are 3 wide, so nothing overlaps and the
    // counts are a clean check that none was filled over.
    const west = { x1: cx - 22, z1: cz - 26, x2: cx - 18, z2: cz + 26 };
    const east = { x1: cx + 18, z1: cz - 26, x2: cx + 22, z2: cz + 26 };
    const tables = (name: string): number =>
      countBlock(world, name, west.x1, west.z1, west.x2, west.z2)
      + countBlock(world, name, east.x1, east.z1, east.x2, east.z2);

    // Every variant keeps its portal slice - that is the part that makes it a
    // splice rather than two tables standing next to each other. All ten.
    expect(tables(P.portal.name), "each split table should have kept its portal slice").toBe(10);
    // Six of the ten rows are whole or glazed and carry a crafting table; the
    // two ruined rows carry one only some of the time, so the floor is eight.
    expect(tables(P.craftingTable.name), "the Splice should carry its split table benches")
      .toBeGreaterThanOrEqual(8);
  });

  test("the Portal Field's seam, pillars and windows all produced geometry", () => {
    const world = generateWorld();
    const { x: cx, z: cz } = LANDMARKS.portalField.center;
    // The ribbon runs the width of the field at two fixed z values; if the
    // path painter had run across it, the count would be a stub, not a line.
    expect(
      countBlock(world, P.portal.name, cx - 33, cz - 34, cx + 33, cz - 32),
      "the north ribbon should run the full width of the field",
    ).toBeGreaterThanOrEqual(60);
    expect(
      countBlock(world, P.portal.name, cx - 33, cz + 26, cx + 33, cz + 28),
      "the south ribbon should run the full width of the field",
    ).toBeGreaterThanOrEqual(60);
    // The four standing stumps: a pillar is solid deepslate from the base up,
    // so four of them is unmistakably more than the gate frames contribute.
    const westStumps = countBlock(world, P.deepslateBricks.name, cx - 33, cz - 24, cx - 27, cz - 16);
    expect(westStumps, "the standing portal pillars should still be built").toBeGreaterThanOrEqual(20);
    // The windows: tinted glass either side of a lit portal core.
    const glass = countBlock(world, P.purpleGlass.name, cx - 36, cz - 10, cx - 30, cz + 2)
      + countBlock(world, P.purpleGlass.name, cx + 30, cz - 2, cx + 36, cz + 10);
    expect(glass, "the sheared void windows should still be glazed").toBeGreaterThanOrEqual(4);
  });
});

/**
 * "Every landmark gets a colour beacon, its own colour, so I can see it in the
 * sky."
 *
 * The failure modes this block exists to catch are all invisible in a build log
 * and all of them still leave glass at the column, so none of them would be
 * caught by counting glass:
 *
 *  - a mast anchored on a *canopy sheet* rather than on the landmark, which is
 *    four blocks tall and stands in the sky;
 *  - two landmarks sharing a colour pair, so the beacon tells you nothing;
 *  - a crown at the same height as the sheets it is supposed to be seen
 *    against, so the one thing above the glass is behind it.
 */
describe("the sky beacons", () => {
  test("every landmark has one, and no two are the same colour", () => {
    expect(
      Object.keys(BEACON_COLOURS).sort(),
      "every landmark needs a beacon colour, and no others",
    ).toEqual(Object.keys(LANDMARKS).sort());

    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [id, colours] of Object.entries(BEACON_COLOURS)) {
      const pair = `${colours.main.name}|${colours.accent.name}`;
      const other = seen.get(pair);
      if (other) clashes.push(`${id} and ${other} are both ${colours.label}`);
      seen.set(pair, id);
      // A label is what the map tool and the notes print; an empty one means
      // somebody added a landmark and forgot to describe its colour.
      expect(colours.label, `${id} has no colour label`).toBeTruthy();
    }
    expect(clashes, `beacons that cannot be told apart: ${clashes.join("; ")}`).toEqual([]);
  });

  test("each mast is a banded column in that landmark's own colour", () => {
    const world = generateWorld();
    for (const id of Object.keys(LANDMARKS) as Array<keyof typeof LANDMARKS>) {
      const mast = beaconMast(world, id);
      const colours = BEACON_COLOURS[id];
      // The crown is the beacon's own colour, dead centre of the cap.
      expect(
        world.get(mast.x, mast.crownY, mast.z)?.name,
        `${id}'s crown should be ${colours.main.name}`,
      ).toBe(colours.main.name);
      // ...crowned with light, or it is a coloured stripe and not a beacon.
      expect(world.get(mast.x, mast.crownY + 1, mast.z)?.name, `${id} has no lantern`).toBe(P.seaLantern.name);
      expect(world.get(mast.x, mast.crownY + 2, mast.z)?.name, `${id} has no glowstone`).toBe(P.glowstone.name);

      // The shaft: banded, and carrying the accent somewhere along it.
      let bands = 0;
      let accents = 0;
      for (let y = mast.baseY; y < mast.crownY; y++) {
        const name = world.get(mast.x, y, mast.z)?.name;
        if (name === P.obsidian.name) bands++;
        if (name === colours.accent.name) accents++;
      }
      expect(bands, `${id}'s mast has no dark banding`).toBeGreaterThan(1);
      expect(accents, `${id}'s mast never shows its accent colour`).toBeGreaterThan(0);
      // The banding has to be the shared one, or every mast is unique again.
      expect(beaconCourse(colours, 0).name, "banding must be the shared obsidian course").toBe(P.obsidian.name);
    }
  });

  test("every crown stands clear of the canopy, so no beacon is behind glass", () => {
    // The whole point of the pass. A crown at or below the top of the canopy is
    // a mast you can only see through a sheet, which is the state the world was
    // in before this existed.
    const world = generateWorld();
    for (const id of Object.keys(LANDMARKS) as Array<keyof typeof LANDMARKS>) {
      const mast = beaconMast(world, id);
      expect(mast.crownY, `${id}'s crown is behind the canopy`).toBeGreaterThan(CANOPY_BAND.ceiling);
      expect(mast.crownY + 2, `${id}'s crown runs past the build ceiling`).toBeLessThan(CONFIG.maxY);
    }
    expect(BEACON_CROWN_Y, "the crown height should itself clear the canopy").toBeGreaterThan(CANOPY_BAND.ceiling);
  });

  test("NEGATIVE: a mast is anchored on its landmark, never on the sky", () => {
    // The bug this catches is subtle and total. `glassSky` hangs green fronds
    // two to eight blocks below every sheet, so glass reaches down to y84: a
    // mast anchored by "the highest block in this column" finds a frond, in
    // every landmark's centre column at once, and the whole world grows a
    // 28-block mast hanging in the canopy with nothing under it. It still puts
    // glass at the column, so only an explicit floor catches it.
    const world = generateWorld();
    const stranded: string[] = [];
    for (const id of Object.keys(LANDMARKS) as Array<keyof typeof LANDMARKS>) {
      const mast = beaconMast(world, id);
      if (mast.baseY >= CANOPY_BAND.floor) stranded.push(`${id} (base y${mast.baseY})`);
    }
    expect(stranded, `beacons anchored in the sky: ${stranded.join("; ")}`).toEqual([]);
  });

  test("NEGATIVE: the beacons are thin enough not to thin the sky", () => {
    // 23 shafts have to be invisible as a change to the canopy. Coverage is the
    // blunt half of that check; the sharp half is the block count, because the
    // obvious "improvement" - widening the mast into a lattice so it reads from
    // further off - multiplies this by an order of magnitude and would still
    // leave coverage looking fine.
    const world = generateWorld();
    const { covered, total } = canopyCoverage(world);
    expect(covered / total, "the sky lost too much of its glass to the beacons").toBeGreaterThan(0.8);
    let beaconBlocks = 0;
    for (const id of Object.keys(LANDMARKS) as Array<keyof typeof LANDMARKS>) {
      const mast = beaconMast(world, id);
      beaconBlocks += mast.crownY + 3 - mast.baseY;
    }
    expect(
      beaconBlocks,
      `${beaconBlocks} blocks of beacon for ${Object.keys(LANDMARKS).length} landmarks - a mast has stopped being a mast`,
    ).toBeLessThan(1400);
  });
});

/**
 * The Veil Castle: the reference's great pale palace, sited on the paved plaza
 * in the placement screenshot.
 */
describe("the Veil Castle", () => {
  const LEVEL = 46;
  const court = VEIL_COURT;

  const countIn = (
    world: World,
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    y1: number,
    y2: number,
    match: (name: string) => boolean,
  ): number => {
    let n = 0;
    for (let z = z1; z <= z2; z++) {
      for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
          const name = world.get(x, y, z)?.name;
          if (name && match(name)) n++;
        }
      }
    }
    return n;
  };
  const inFootprint = (world: World, match: (name: string) => boolean, y1 = 45, y2 = CONFIG.maxY): number => {
    const f = LANDMARKS.veilCastle.footprint;
    return countIn(world, f.x1, f.z1, f.x2, f.z2, y1, y2, match);
  };

  test("stands on the exact point the placement screenshot gave", () => {
    // `Position: -179, 46, 133`. The player was standing on a paved plaza; the
    // plaza is now the castle's forecourt, so the two coordinates have to be
    // walkable ground at plaza level rather than inside a wall.
    expect(court).toEqual({ x: -179, z: 133 });
    const world = generateWorld();
    const name = world.get(court.x, LEVEL, court.z)?.name;
    // Dead on the approach axis, so the placement point is the purple carpet
    // itself rather than the pale stone either side of it. Either is the
    // castle; neither is bare ground.
    expect(
      name === P.purpleConcrete.name || name === P.magentaConcrete.name || name === P.smoothStone.name,
      `the placement point is ${name}, which is neither castle paving nor its carpet`,
    ).toBe(true);
    expect(world.surfaceAt(court.x, court.z), "the forecourt should be at plaza level").toBe(LEVEL);
    // ...and open above it: a castle built on the screenshot's spot that roofs
    // over the spot is not on the spot.
    expect(world.get(court.x, LEVEL + 1, court.z)?.name, "the forecourt should be open sky").toBe(AIR.name);
  });

  test("is the pale thing in a grey map: quartz, sandstone, and blue roofs", () => {
    const world = generateWorld();
    // The canon palette is grey and black; this is the one landmark that is
    // not, and it has to be unmistakably so rather than a grey building with a
    // few white blocks on it.
    expect(inFootprint(world, (n) => n === P.smoothQuartz.name), "no quartz").toBeGreaterThan(3000);
    expect(inFootprint(world, (n) => n === P.quartz.name), "no quartz block").toBeGreaterThan(1500);
    expect(inFootprint(world, (n) => n === P.smoothSandstone.name), "no sandstone").toBeGreaterThan(1500);
    expect(inFootprint(world, (n) => n === P.chiseledSandstone.name), "no sandstone trim").toBeGreaterThan(800);
    // The roofs: blue on the halls and spires, teal banded round the dome.
    expect(inFootprint(world, (n) => n === P.blueConcrete.name), "no blue roofs").toBeGreaterThan(1500);
    expect(inFootprint(world, (n) => n === P.lightBlueConcrete.name), "no pale blue roofs").toBeGreaterThan(1000);
    expect(inFootprint(world, (n) => n === P.cyanConcrete.name), "the dome is not banded").toBeGreaterThan(200);
  });

  test("hangs green roundels on the facade, the way the reference does", () => {
    const world = generateWorld();
    // The signature motif: a big circular green-glass window in a sandstone
    // ring. Three of them over the great hall's west face, on the approach
    // axis, plus the one over the east gate.
    expect(inFootprint(world, (n) => n.includes("green_stained_glass")), "no green roundel glass").toBeGreaterThan(600);
    expect(inFootprint(world, (n) => n.includes("lime_stained_glass")), "no lime in the roundels").toBeGreaterThan(400);
    // A ring is sandstone; a filled disc is not, and a disc is what you get if
    // the radius test is off by one.
    expect(inFootprint(world, (n) => n === P.chiseledSandstone.name)).toBeGreaterThan(800);
  });

  test("carries a purple carpet from the causeway, through the gate, into the hall", () => {
    const world = generateWorld();
    // The reference's strongest single image is the approach: a purple carpet
    // running the length of a bridge to a black doorway. So it has to be one
    // unbroken run, not three disconnected patches.
    let run = 0;
    let best = 0;
    for (let x = -211; x <= -156; x++) {
      const name = world.get(x, LEVEL, court.z)?.name;
      if (name === P.purpleConcrete.name || name === P.magentaConcrete.name) {
        run++;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    expect(best, "the purple approach is not one unbroken run to the gate").toBeGreaterThan(50);
    // ...and it is carried right through the hall to the dais at the back.
    let inside = 0;
    for (let x = -169; x <= -156; x++) {
      const name = world.get(x, LEVEL, court.z)?.name;
      if (name === P.purpleConcrete.name || name === P.magentaConcrete.name) inside++;
    }
    expect(inside, "the carpet stops at the threshold instead of going through it").toBeGreaterThan(10);
  });

  test("raises a drum and a dome that push up into the canopy band", () => {
    // A castle whose spires stop below the glass reads as a model of a castle.
    // The dome is deliberately allowed into the canopy band, so the one place
    // the sky is thickest is also the place the castle is tallest.
    const world = generateWorld();
    let top = 0;
    for (let dz = -12; dz <= 12; dz++) {
      for (let dx = -12; dx <= 12; dx++) {
        for (let y = CONFIG.maxY - 1; y >= LEVEL; y--) {
          const name = world.get(LANDMARKS.veilCastle.center.x + 40 + dx, y, court.z + dz)?.name;
          if (name && name !== AIR.name) {
            top = Math.max(top, y);
            break;
          }
        }
      }
    }
    expect(top, "the drum and dome should reach into the canopy band").toBeGreaterThan(CANOPY_BAND.floor);
    // The dome's blue, sampled on its axis rather than by counting the roofs.
    let dome = 0;
    for (let y = LEVEL + 40; y <= LEVEL + 58; y++) {
      const name = world.get(-146, y, court.z)?.name;
      if (name === P.blueConcrete.name || name === P.cyanConcrete.name || name === P.lightBlueConcrete.name) dome++;
    }
    expect(dome, "the drum has no dome on top of it").toBeGreaterThan(12);
  });

  test("NEGATIVE: it does not build over the portal lobby next door", () => {
    // The castle's footprint and the lobby's are 16 blocks apart and the
    // castle's `pad` ramps four blocks further, so this is one arithmetic slip
    // away from paving the lobby's great door in sandstone.
    const world = generateWorld();
    const lobby = LANDMARKS.portalLobby.footprint;
    expect(
      countIn(world, lobby.x1, lobby.z1, lobby.x2, lobby.z2, LEVEL, CONFIG.maxY, (n) => n === P.smoothQuartz.name),
      "the castle's quartz has reached into the portal lobby",
    ).toBe(0);
    // And the lobby's own signature stone is not inside the castle either.
    expect(
      countIn(
        world,
        LANDMARKS.veilCastle.footprint.x1,
        LANDMARKS.veilCastle.footprint.z1,
        LANDMARKS.veilCastle.footprint.x2,
        LANDMARKS.veilCastle.footprint.z2,
        LEVEL,
        CONFIG.maxY,
        (n) => n === P.polishedAndesite.name,
      ),
      "the portal lobby has built into the castle",
    ).toBe(0);
  });
});

/**
 * The Nether Portal Lobby, re-sited and re-faced from the screenshot.
 */
describe("the Nether Portal Lobby", () => {
  const count = (world: World, match: (name: string) => boolean): number => {
    const f = LANDMARKS.portalLobby.footprint;
    let n = 0;
    for (let z = f.z1; z <= f.z2; z++) {
      for (let x = f.x1; x <= f.x2; x++) {
        for (let y = 45; y < CONFIG.maxY; y++) {
          const name = world.get(x, y, z)?.name;
          if (name && match(name)) n++;
        }
      }
    }
    return n;
  };

  test("is a green-stone court around the coordinates the screenshot gave", () => {
    // `Position: -219, 45, 125`. Whatever the exact centre, that point has to
    // be inside the court and standing on its floor.
    const f = LANDMARKS.portalLobby.footprint;
    expect(-219).toBeGreaterThanOrEqual(f.x1);
    expect(-219).toBeLessThanOrEqual(f.x2);
    expect(125).toBeGreaterThanOrEqual(f.z1);
    expect(125).toBeLessThanOrEqual(f.z2);

    const world = generateWorld();
    const { x: cx, z: cz } = LANDMARKS.portalLobby.center;
    const floor = world.surfaceAt(cx, cz);
    const name = world.get(cx, floor, cz)?.name;
    expect(
      name === P.tuff.name || name === P.polishedTuff.name || name?.includes("stained_glass"),
      `the court floor at ${cx},${cz} is ${name}`,
    ).toBe(true);
    // The canon green, on the structure and not only in the lamps.
    expect(count(world, (n) => n === P.greenGlass.name), "no green glass in the lobby").toBeGreaterThan(300);
    expect(count(world, (n) => n === P.tuff.name), "no tuff in the lobby").toBeGreaterThan(300);
    expect(count(world, (n) => n === P.deepslate.name), "no deepslate in the lobby").toBeGreaterThan(300);
  });

  test("has a great dark-oak door in a polished-andesite frame", () => {
    const world = generateWorld();
    expect(count(world, (n) => n.includes("dark_oak")), "no dark-oak door").toBeGreaterThan(40);
    expect(count(world, (n) => n === P.polishedAndesite.name), "no andesite frame").toBeGreaterThan(300);
    // The screenshot's gold-ore glints in the green stone.
    expect(count(world, (n) => n === P.goldOre.name), "no gold ore in the walls").toBeGreaterThan(20);
  });

  test("still has twenty portals, set into its walls", () => {
    const world = generateWorld();
    // Twenty is the canon count and it is the landmark's reason for existing.
    // Asserted on portal *blocks*, not frames, because a frame that lost its
    // interior to the wall behind it would still count as a frame.
    const portals = count(world, (n) => n === P.portal.name);
    expect(portals, "the lobby has lost its portals").toBeGreaterThanOrEqual(100);
    // ...and they are in the walls, not standing loose on the floor: nothing
    // but the frame's own obsidian and glass may sit in the court's middle.
    const { x: cx, z: cz } = LANDMARKS.portalLobby.center;
    let loose = 0;
    for (let dz = -6; dz <= 6; dz++) {
      for (let dx = -6; dx <= 6; dx++) {
        for (let y = 45; y < CONFIG.maxY; y++) {
          if (world.get(cx + dx, y, cz + dz)?.name === P.portal.name) loose++;
        }
      }
    }
    expect(loose, "portals are standing in the middle of the court").toBe(0);
  });

  test("NEGATIVE: the old blackstone plaza is gone", () => {
    // The lobby used to be a polished-blackstone pad with loose frames on it.
    // The whole point of the re-siting is that it is now green deepslate and
    // tuff with the gates in the walls, so blackstone losing to andesite is
    // the assertion that the rebuild actually happened.
    const world = generateWorld();
    const black = count(world, (n) => n === P.blackstone.name || n === P.polishedBlackstone.name);
    const frame = count(world, (n) => n === P.polishedAndesite.name);
    expect(black, "there is still a blackstone plaza in the lobby").toBeLessThan(frame);
  });
});

/**
 * "Keep the Warden stuff, change the deepslate with the glass we've been
 * using."
 *
 * The arena is the one place where that instruction has a hard limit: the bowl
 * has to stay dark or there is nothing to be afraid of. So this block asserts
 * both halves - the plate is glazed, and the hole is not.
 */
describe("the Warden's arena, glazed", () => {
  const { x: cx, z: cz } = LANDMARKS.wardenArena.center;
  const LEVEL = 46;
  const RADIUS = 21;

  test("the plate's outer face is a glazed foundation, not a wall of rock", () => {
    const world = generateWorld();
    const f = LANDMARKS.wardenArena.footprint;
    let glass = 0;
    let rock = 0;
    for (let x = f.x1; x <= f.x2; x++) {
      for (const z of [f.z1, f.z2]) {
        for (let y = LEVEL - 10; y <= LEVEL; y++) {
          const name = world.get(x, y, z)?.name;
          if (!name) continue;
          if (name.includes("stained_glass")) glass++;
          else if (name.includes("deepslate")) rock++;
        }
      }
    }
    expect(glass, "the arena's outward face should be mostly glazing").toBeGreaterThan(300);
    expect(glass, "glazing should outnumber the deepslate framing on the rim").toBeGreaterThan(rock);
  });

  test("the ring walk around the lip is glazed, and it is standing on something", () => {
    const world = generateWorld();
    let glass = 0;
    let floating = 0;
    for (let i = 0; i < 720; i++) {
      const a = (i / 720) * Math.PI * 2;
      for (let radius = 22; radius <= 25; radius++) {
        const x = Math.round(cx + Math.cos(a) * radius);
        const z = Math.round(cz + Math.sin(a) * radius);
        if (world.get(x, LEVEL, z)?.name?.includes("stained_glass")) glass++;
        // The walk used to be radius 22 on a plate only 40 deep, so its north
        // and south arcs were written out over the void with nothing under
        // them. Every course of it has to be on land.
        if (!world.isLand(x, z) || world.surfaceAt(x, z) !== LEVEL) floating++;
      }
    }
    expect(glass, "the ring walk should be glazed the whole way round").toBeGreaterThan(400);
    expect(floating, "the ring walk is floating over the void").toBe(0);
  });

  test("NEGATIVE: no glazing reaches inside the bowl", () => {
    // The constraint the whole rework hangs off. A *disc*, not the bounding
    // square: the corners of the square are plate, and the plate is glazed on
    // purpose. And it stops four blocks below the rim, because that band is
    // the walk, not the pit.
    const world = generateWorld();
    let glass = 0;
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        if (Math.hypot(dx, dz) > RADIUS) continue;
        for (let y = LEVEL - 30; y <= LEVEL - 4; y++) {
          if (world.get(cx + dx, y, cz + dz)?.name?.includes("stained_glass")) glass++;
        }
      }
    }
    expect(glass, "no glazing may be laid inside the Warden's bowl").toBe(0);
  });

  test("NEGATIVE: the Warden himself is untouched - bowl, sculk, shrieker and all", () => {
    const world = generateWorld();
    const floor = world.surfaceAt(cx, cz);
    const rim = world.surfaceAt(cx + RADIUS, cz);
    expect(floor, "the bowl should still be sunk below its rim").toBeLessThan(rim - 10);
    let sculk = 0;
    let catalyst = 0;
    for (let dz = -RADIUS; dz <= RADIUS; dz++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        if (Math.hypot(dx, dz) > RADIUS) continue;
        const s = world.surfaceAt(cx + dx, cz + dz);
        for (let y = s; y <= s + 1 && y < CONFIG.maxY; y++) {
          const name = world.get(cx + dx, y, cz + dz)?.name;
          if (name === P.sculk.name) sculk++;
          if (name === P.sculkCatalyst.name) catalyst++;
        }
      }
    }
    expect(sculk, "the bowl's floor must still be spreading with sculk").toBeGreaterThan(100);
    expect(catalyst, "the bowl's rim must still be ringed with catalyst").toBeGreaterThan(5);
    let shrieker = 0;
    for (let y = 0; y < CONFIG.maxY; y++) {
      if (world.get(cx, y, cz)?.name === P.sculkShrieker.name) shrieker++;
    }
    expect(shrieker, "the shrieker should still be sitting at the bottom of the pit").toBe(1);
  });
});
