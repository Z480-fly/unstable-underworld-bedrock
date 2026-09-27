/**
 * Zip the Soul Keepers packs into `.mcpack` files.
 *
 * The download link for a pack is 38 separate files, which is fine for git and
 * useless on a phone. Bedrock's "Import Packs from File" takes exactly one file
 * per pack, so the thing that actually gets tested has to be a single archive.
 *
 * Two things about the format are easy to get wrong and produce an archive that
 * unpacks but does not import:
 *
 * - **`manifest.json` must be at the root of the zip.** Zip the folder and you
 *   get `soul-keepers-bp/manifest.json`, which Bedrock opens as a folder with
 *   no manifest and silently ignores.
 * - **Entry names use forward slashes** on every platform, because that is what
 *   the zip central directory is specified to contain.
 *
 * The resource pack must be imported before the behaviour pack, because the BP
 * declares a dependency on the RP by UUID and will not enable without it. That
 * ordering is in `packs/README.md`; this tool prints it too, because getting it
 * wrong looks exactly like the pack being broken.
 *
 *   bun run src/tools/pack-mcpack.ts
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ZipWriter } from "../bedrock/zip.ts";

interface PackedPack {
  bytes: number;
  files: number;
  manifest: PackManifest;
}

interface PackManifest {
  header: { uuid: string; version: number[]; name: string };
  modules: Array<{ type: string; uuid: string; version: number[] }>;
  dependencies?: Array<{ uuid: string; version?: number[] }>;
}

/** Every file under `dir`, as archive-relative paths with forward slashes. */
function walk(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, root));
    else out.push(relative(root, full).split(sep).join("/"));
  }
  return out;
}

function packOne(folder: string, outName: string): PackedPack {
  const root = join("packs", folder);
  const manifestPath = join(root, "manifest.json");
  if (!statSync(manifestPath).isFile()) throw new Error(`${folder} has no manifest.json`);

  const files = walk(root);
  if (!files.includes("manifest.json")) {
    throw new Error(`${folder}: manifest.json is not at the archive root - Bedrock will ignore this pack`);
  }
  if (files.some((f) => f.includes("../"))) throw new Error(`${folder}: an entry escaped the pack root`);

  const zip = new ZipWriter();
  for (const file of files) zip.addFile(file, readFileSync(join(root, file)));
  const buffer = zip.finish();

  mkdirSync("dist", { recursive: true });
  writeFileSync(join("dist", outName), buffer);

  return {
    bytes: buffer.length,
    files: files.length,
    manifest: JSON.parse(readFileSync(manifestPath, "utf8")) as PackManifest,
  };
}

const rp = packOne("soul-keepers-rp", "soul-keepers-rp.mcpack");
const bp = packOne("soul-keepers-bp", "soul-keepers-bp.mcpack");

console.log(`dist/soul-keepers-rp.mcpack  ${rp.files} files, ${rp.bytes} bytes`);
console.log(`dist/soul-keepers-bp.mcpack  ${bp.files} files, ${bp.bytes} bytes`);

// The dependency is asserted rather than assumed: a BP that does not name the
// RP's UUID will import fine and then refuse to enable, which on a phone reads
// as "the mobs do not appear" with nothing on screen to explain it.
const declared = bp.manifest.dependencies ?? [];
if (!declared.some((d) => d.uuid === rp.manifest.header.uuid)) {
  throw new Error(
    `the behaviour pack does not declare a dependency on the resource pack's UUID (${rp.manifest.header.uuid})`,
  );
}

console.log(`\nimport order: resource pack first, then behaviour pack`);
console.log(`  rp uuid ${rp.manifest.header.uuid}`);
console.log(`  bp uuid ${bp.manifest.header.uuid} (depends on the rp)`);
