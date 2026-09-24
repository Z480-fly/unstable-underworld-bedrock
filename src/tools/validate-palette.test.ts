import { describe, expect, test } from "bun:test";
import { validatePalette } from "./validate-palette.ts";
import { buildLevelDat, parseLevelDat } from "../bedrock/leveldat.ts";
import { CONFIG } from "../world/config.ts";

describe("palette", () => {
  test("every block state exists in Bedrock 1.26.51", () => {
    const result = validatePalette();
    expect(result.problems).toEqual([]);
    expect(result.blockCount).toBeGreaterThan(80);
  });
});

describe("level.dat", () => {
  test("round-trips through the NBT parser with the values we set", async () => {
    const buffer = buildLevelDat({
      levelName: "Unit Test World",
      spawn: { x: 1, y: 48, z: 2 },
      seed: "12345",
    });
    expect(buffer.readUInt32LE(0)).toBe(10);
    expect(buffer.readUInt32LE(4)).toBe(buffer.length - 8);

    const { data } = await parseLevelDat(buffer);
    const value = data.value as Record<string, { value: unknown }>;
    expect(value.LevelName!.value).toBe("Unit Test World");
    expect(value.SpawnY!.value).toBe(48);
    expect(value.Generator!.value).toBe(1);
    expect(value.commandsEnabled!.value).toBe(1);
    expect(value.showcoordinates!.value).toBe(0);
    expect(value.domobspawning!.value).toBe(0);
    expect(value.FlatWorldLayers!.value).toContain("minecraft:air");
    expect(CONFIG.chunkVersion).toBeGreaterThanOrEqual(40);
  });
});
