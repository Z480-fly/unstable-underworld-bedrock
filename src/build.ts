/**
 * Build entry point.
 *
 *   bun run src/build.ts [--subchunk-version=9] [--no-zip]
 *
 * Generates the whole realm in memory, writes it into a Bedrock LevelDB, and
 * packs `level.dat` + `db/` + the icon into an importable `.mcworld`.
 */

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CHUNK_TAG, BedrockWorldDb } from "./bedrock/world-writer.ts";
import { buildLevelDat } from "./bedrock/leveldat.ts";
import { serializeSubChunk } from "./bedrock/subchunk.ts";
import { collectChunkHeights, serializeData2D, serializeData3D } from "./bedrock/data3d.ts";
import { ZipWriter } from "./bedrock/zip.ts";
import { CONFIG, CHUNKS_X, CHUNKS_Z, REALM } from "./world/config.ts";
import { renderMapImage } from "./world/icon.ts";
import { SPAWN } from "./world/layout.ts";
import { buildSceneWorld } from "./world/scene.ts";
import type { World } from "./world/world.ts";

interface BuildOptions {
  subChunkVersion: 8 | 9;
  zip: boolean;
  worldName: string;
}

function parseArgs(argv: string[]): BuildOptions {
  const options: BuildOptions = {
    subChunkVersion: CONFIG.subChunkVersion,
    zip: true,
    worldName: "Underworld Simulator Remastered",
  };
  for (const arg of argv) {
    if (arg.startsWith("--subchunk-version=")) {
      const value = Number(arg.split("=")[1]);
      options.subChunkVersion = value === 8 ? 8 : 9;
    } else if (arg === "--no-zip") {
      options.zip = false;
    } else if (arg.startsWith("--name=")) {
      options.worldName = arg.split("=").slice(1).join("=");
    }
  }
  return options;
}

async function listFilesRecursive(directory: string, prefix = ""): Promise<Array<{ path: string; data: Buffer }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: Array<{ path: string; data: Buffer }> = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(full, relative)));
    } else {
      files.push({ path: relative, data: await readFile(full) });
    }
  }
  return files;
}

function findSafeSpawn(world: World): { x: number; y: number; z: number } {
  const baseX = Math.floor(SPAWN.x);
  const baseZ = Math.floor(SPAWN.z);
  for (let radius = 0; radius < 48; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const x = baseX + dx;
        const z = baseZ + dz;
        if (!world.isLand(x, z)) continue;
        const y = world.surfaceAt(x, z);
        const ground = world.get(x, y, z);
        if (!ground || ground.name === "minecraft:air") continue;
        const above1 = world.get(x, y + 1, z);
        const above2 = world.get(x, y + 2, z);
        if (above1 && above1.name !== "minecraft:air") continue;
        if (above2 && above2.name !== "minecraft:air") continue;
        return { x, y: y + 1, z };
      }
    }
  }
  return { x: baseX, y: world.surfaceAt(baseX, baseZ) + 2, z: baseZ };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const started = performance.now();
  const buildDir = join(process.cwd(), "build");
  const worldDir = join(buildDir, "world");
  const distDir = join(process.cwd(), "dist");

  await rm(worldDir, { recursive: true, force: true });
  await mkdir(join(worldDir, "db"), { recursive: true });
  await mkdir(distDir, { recursive: true });
  await mkdir(join(process.cwd(), "docs"), { recursive: true });

  const log = (message: string): void => {
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`[${seconds}s] ${message}`);
  };

  const { world } = buildSceneWorld(log);

  log("rendering map image...");
  const icon = renderMapImage(world, 768);
  await writeFile(join(process.cwd(), "docs", "map-preview.jpg"), icon);

  const spawn = findSafeSpawn(world);
  const levelDat = buildLevelDat({
    levelName: options.worldName,
    spawn,
    seed: String(CONFIG.seed),
  });
  await writeFile(join(worldDir, "level.dat"), levelDat);
  await writeFile(join(worldDir, "levelname.txt"), options.worldName, "utf8");
  await writeFile(join(worldDir, "world_icon.jpeg"), icon);

  log("writing chunks to LevelDB...");
  const db = await BedrockWorldDb.open(join(worldDir, "db"));
  let chunkCount = 0;
  let subChunkCount = 0;
  const subChunkLevels = CONFIG.maxY >> 4;

  let data3dCount = 0;
  for (const chunk of world.allChunks()) {
    chunkCount++;
    await db.putChunkVersion(chunk.cx, chunk.cz, CONFIG.chunkVersion);
    await db.putFinalizedState(chunk.cx, chunk.cz, 2);
    const heights = collectChunkHeights(
      (x, z) => world.surfaceAt(x, z),
      (x, z) => world.isLand(x, z),
      chunk.cx,
      chunk.cz,
    );
    await db.putData3D(chunk.cx, chunk.cz, serializeData3D(heights));
    await db.putData2D(chunk.cx, chunk.cz, serializeData2D(heights));
    data3dCount++;
    for (let subY = 0; subY <= subChunkLevels; subY++) {
      if (chunk.isSubChunkEmpty(subY)) continue;
      const slice = chunk.subChunkSlice(subY);
      const value = serializeSubChunk(slice.ids, slice.palette, {
        version: options.subChunkVersion,
        subChunkIndex: subY,
      });
      await db.putSubChunk(chunk.cx, chunk.cz, subY, value);
      subChunkCount++;
    }
  }

  for (let cx = REALM.minChunkX; cx <= REALM.maxChunkX; cx++) {
    for (let cz = REALM.minChunkZ; cz <= REALM.maxChunkZ; cz++) {
      if (world.chunk(cx, cz)) continue;
      await db.putChunkVersion(cx, cz, CONFIG.chunkVersion);
      await db.putFinalizedState(cx, cz, 2);
      const heights = collectChunkHeights(
        (x, z) => world.surfaceAt(x, z),
        (x, z) => world.isLand(x, z),
        cx,
        cz,
      );
      await db.putData3D(cx, cz, serializeData3D(heights));
      await db.putData2D(cx, cz, serializeData2D(heights));
      data3dCount++;
    }
  }
  log(`wrote Data3D/Data2D for ${data3dCount} chunks`);

  await db.put(Buffer.from("game_flatworldlayers", "utf8"), Buffer.from("[]", "utf8"));
  await db.compactAll();
  await db.close();
  log(`wrote ${chunkCount} chunks (${subChunkCount} subchunks) over ${CHUNKS_X}x${CHUNKS_Z} chunks`);

  if (!options.zip) {
    log("done (no zip requested)");
    return;
  }

  log("packing .mcworld...");
  const files = await listFilesRecursive(worldDir);
  const zip = new ZipWriter();
  for (const file of files) zip.addFile(file.path, file.data);
  const archive = zip.finish();
  const outPath = join(distDir, `${options.worldName.replace(/\s+/g, "-")}.mcworld`);
  await writeFile(outPath, archive);

  const dbSize = (await listFilesRecursive(join(worldDir, "db"))).reduce((sum, f) => sum + f.data.length, 0);
  const archiveStats = await stat(outPath);
  log(
    `wrote ${outPath}\n           db ${(dbSize / 1024 / 1024).toFixed(2)} MB -> ` +
      `${(archiveStats.size / 1024 / 1024).toFixed(2)} MB .mcworld`,
  );
  log("build complete");
}

await main();
