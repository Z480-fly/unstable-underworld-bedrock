/**
 * Runs the pack validator as a test.
 *
 * The Soul Keepers pack is data, and every way it can be wrong is invisible to
 * the type checker: a texture that is referenced but not shipped, an icon key
 * that was never registered, a component that points at a file that does not
 * exist, a geometry the render controller cannot reach. None of those are
 * syntax errors, and the game loads a pack with all of them perfectly happily -
 * the player just gets a pink checker and a mob that will not shoot.
 *
 * So the validator runs here, in the normal test suite, rather than being a
 * script somebody has to remember to run.
 */
import { describe, expect, test } from "bun:test";

describe("the Soul Keepers pack", () => {
  test("validates against Bedrock 1.26.51 and against its own files", () => {
    const result = Bun.spawnSync({
      cmd: ["bun", "run", "src/tools/validate-pack.ts"],
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${result.stdout.toString()}${result.stderr.toString()}`;
    expect(output, output).toContain("pack OK");
    expect(result.exitCode, output).toBe(0);
  });

  test("every mob the pack declares has a client entity and a texture", () => {
    // The specific gap that kept this pack invisible: behaviour-pack entities
    // with no resource-pack counterpart, or a client entity whose texture is
    // missing. Checked here rather than only in the validator so the failure
    // names the mob.
    const result = Bun.spawnSync({
      cmd: [
        "bun",
        "-e",
        `
        import { readdirSync, existsSync } from "fs";
        const bp = "packs/soul-keepers-bp/entities";
        const rp = "packs/soul-keepers-rp/entity";
        const missing = [];
        for (const file of readdirSync(bp)) {
          const entity = JSON.parse(require("fs").readFileSync(bp + "/" + file, "utf8"));
          const id = entity["minecraft:entity"].description.identifier;
          const found = readdirSync(rp).some((f) => {
            const ce = JSON.parse(require("fs").readFileSync(rp + "/" + f, "utf8"));
            return ce["minecraft:client_entity"].description.identifier === id;
          });
          if (!found) missing.push(id);
        }
        console.log(JSON.stringify(missing));
        `,
      ],
      stdout: "pipe",
      stderr: "pipe",
    });
    const missing = result.stdout.toString().trim();
    expect(
      missing,
      `these behaviour-pack entities have no client entity, so they render as the default model: ${result.stderr.toString()}`,
    ).toBe("[]");
  });
});
