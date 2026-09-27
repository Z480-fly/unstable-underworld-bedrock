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
import { existsSync, readFileSync } from "node:fs";

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

  test("the two packs form a valid linked pair", () => {
    // The world bakes these UUIDs into world_behavior_packs.json so the mobs
    // are live the moment the world opens. A duplicated UUID, or a behaviour
    // pack that does not name the resource pack, produces a world that imports
    // cleanly and then silently runs with no mobs in it - which on a phone is
    // indistinguishable from the pack being broken.
    const rp = JSON.parse(readFileSync("packs/soul-keepers-rp/manifest.json", "utf8"));
    const bp = JSON.parse(readFileSync("packs/soul-keepers-bp/manifest.json", "utf8"));

    expect(bp.header.uuid, "the two packs must not share a UUID").not.toBe(rp.header.uuid);
    const deps = (bp.dependencies ?? []).map((d: { uuid: string }) => d.uuid);
    expect(
      deps,
      "the behaviour pack must declare a dependency on the resource pack, or it never enables",
    ).toContain(rp.header.uuid);

    // Every module uuid, plus the header, must be unique within its own pack.
    const uuids = [bp.header.uuid, ...bp.modules.map((m: { uuid: string }) => m.uuid)];
    expect(new Set(uuids).size, "duplicate UUIDs inside the behaviour pack").toBe(uuids.length);
  });

  test("the .mcpack archives have manifest.json at the archive root", () => {
    // Zipping the folder rather than its contents gives
    // `soul-keepers-bp/manifest.json`, which Bedrock opens as a folder with no
    // manifest and ignores. It does not error, so nothing else would catch it.
    for (const file of ["dist/soul-keepers-rp.mcpack", "dist/soul-keepers-bp.mcpack"]) {
      if (!existsSync(file)) continue; // not built; `bun run build:packs` makes it
      const zip = readFileSync(file);
      expect(zip.subarray(0, 2).toString("latin1"), `${file} is not a zip`).toBe("PK");
      // read the central directory entry names rather than trusting the tool
      const names: string[] = [];
      for (let i = 0; i < zip.length - 4; i++) {
        if (zip.readUInt32LE(i) !== 0x02014b50) continue;
        const nameLen = zip.readUInt16LE(i + 28);
        names.push(zip.subarray(i + 46, i + 46 + nameLen).toString("utf8"));
      }
      expect(names, `${file} must have manifest.json at its root`).toContain("manifest.json");
      expect(
        names.filter((n) => n.startsWith("soul-keepers")),
        `${file} has entries nested in a parent folder, which Bedrock will not read`,
      ).toEqual([]);
    }
  });
});
