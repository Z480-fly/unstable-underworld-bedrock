import { describe, expect, test } from "bun:test";
import { entryContentTypeToFormatMap } from "mcbe-leveldb";
import { AIR, GRAVITY_BLOCK_NAMES, P } from "./blocks.ts";
import { CONFIG, WORLD_HEIGHT, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z } from "./config.ts";
import { LANDMARKS } from "./layout.ts";
import { generateTerrain } from "./terrain.ts";
import { buildAllAreas } from "./areas.ts";
import { serializeSubChunk } from "../bedrock/subchunk.ts";
import { buildSceneWorld } from "./scene.ts";
import { World } from "./world.ts";

/** The full generation pipeline, in the order build.ts runs it. */
function generateWorld(): World {
  return buildSceneWorld().world;
}

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

  test("every landmark actually builds something", () => {
    // A landmark that silently produced no geometry is invisible on a top-down
    // map and only shows up in game, so each one is fingerprinted by a block
    // that only it places. The tomb's rooms sit *below* the ground and the pads
    // sit flush with it, so the whole footprint volume is scanned.
    const signatures: Record<string, string> = {
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
    };
    const world = generateWorld();
    for (const landmark of Object.values(LANDMARKS)) {
      const signature = signatures[landmark.id]!;
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
