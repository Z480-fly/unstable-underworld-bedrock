/**
 * Build entry: generate the Underworld map, write a Bedrock LevelDB, and
 * pack it into an importable `.mcworld`.
 *
 *   bun run src/build.ts [--subchunk-version=9] [--no-zip]
 */

import { mkdir, writeFile, stat, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { CONFIG, REALM, CHUNKS_X, CHUNKS_Z } from "./world/config.ts";
import { buildSceneWorld } from "./world/scene.ts";
import { renderMapImage } from "./world/icon.ts";
import { buildLevelDat } from "./bedrock/leveldat.ts";
import { BedrockWorldDb } from "./bedrock/world-writer.ts";
import { serializeSubChunk } from "./bedrock/subchunk.ts";
import { collectChunkHeights, serializeData2D, serializeData3D } from "./bedrock/data3d.ts";
import { ZipWriter } from "./bedrock/zip.ts";
import type { World } from "./world/world.ts";

interface BuildOptions {
  worldName: string;
  subChunkVersion: 8 | 9;
  zip: boolean;
}

function parseArgs(argv: string[]): BuildOptions {
  const options: BuildOptions = {
    worldName: "Underworld Simulator Remastered",
    subChunkVersion: CONFIG.subChunkVersion,
    zip: true,
  };
  for (const arg of argv) {
    if (arg.startsWith("--subchunk-version=")) {
      const value = Number(arg.slice("--subchunk-version=".length));
      options.subChunkVersion = value === 8 ? 8 : 9;
    } else if (arg === "--no-zip") {
      options.zip = false;
    }
  }
  return options;
}

function findSafeSpawn(world: World): { x: number; y: number; z: number } {
  // Prefer the Breach center, a little above the surface.
  const x = 0;
  const z = 152;
  const surface = world.surfaceAt(x, z);
  return { x: x + 0.5, y: surface + 2, z: z + 0.5 };
}

async function listFilesRecursive(root: string): Promise<Array<{ path: string; data: Buffer }>> {
  const out: Array<{ path: string; data: Buffer }> = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        out.push({ path: relative(root, full).replace(/\\/g, "/"), data: await readFile(full) });
      }
    }
  }
  await walk(root);
  return out;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const started = performance.now();
  const log = (message: string) => {
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`[${seconds}s] ${message}`);
  };

  const outRoot = join(process.cwd(), "build-output");
  const worldDir = join(outRoot, "world");
  const distDir = join(process.cwd(), "dist");
  await mkdir(worldDir, { recursive: true });
  await mkdir(distDir, { recursive: true });
  await mkdir(join(process.cwd(), "docs"), { recursive: true });

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
  // iOS Bedrock expects these (phone exports write "[]"); missing them can
  // cause some devices to reject the import.
  await writeFile(join(worldDir, "world_behavior_packs.json"), "[]", "utf8");
  await writeFile(join(worldDir, "world_resource_packs.json"), "[]", "utf8");

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
