import { describe, expect, test } from "bun:test";
import { entryContentTypeToFormatMap } from "mcbe-leveldb";
import { AIR, GRAVITY_BLOCK_NAMES, P } from "./blocks.ts";
import { CONFIG, WORLD_HEIGHT, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z } from "./config.ts";
import { LANDMARKS } from "./layout.ts";
import { generateTerrain } from "./terrain.ts";
import { buildAllAreas } from "./areas.ts";
import { canopyCoverage, CANOPY_BAND } from "./sky_canopy.ts";
import { SHEETS as CANOPY_SHEETS } from "./sky_canopy.ts";
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
  portalLobby: P.portal.name,
  glassworks: P.greenGlass.name,
  portalField: P.cryingObsidian.name,
  endRuin: P.endPortal.name,
  glassGrove: P.purpleGlass.name,
  cathedral: P.blueGlass.name,
  splice: P.enchantingTable.name,
  ancientCity: P.chiseledDeepslate.name,
  wardenArena: P.sculkShrieker.name,
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
