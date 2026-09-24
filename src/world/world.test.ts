import { describe, expect, test } from "bun:test";
import { AIR, P } from "./blocks.ts";
import { CONFIG, WORLD_HEIGHT } from "./config.ts";
import { LANDMARKS } from "./layout.ts";
import { generateTerrain } from "./terrain.ts";
import { buildAllAreas } from "./areas.ts";
import { World } from "./world.ts";

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

  test("vertical range stays inside the generated buffer", () => {
    const world = new World();
    const stats = generateTerrain(world);
    expect(stats.maxY).toBeLessThan(WORLD_HEIGHT);
    expect(stats.minY).toBeGreaterThanOrEqual(0);
  });
});
