/**
 * Static file server for the rendered preview.
 *
 * The preview payload is already static - `src/tools/render-preview.ts` writes
 * `preview/index.html` and `preview/img/*.png` and nothing on the page runs
 * client-side - so serving it is the whole job. Bun's own server is used rather
 * than a dependency so the preview container needs nothing beyond `bun install`.
 *
 * Binds 0.0.0.0 and reads the port from `PORT`, which is what the preview
 * environment injects.
 */
import { existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), process.argv[2] ?? "preview");
const port = Number(process.env.PORT ?? 5173);

if (!existsSync(join(root, "index.html"))) {
  console.error(`no preview at ${root} - run: bun run preview:images`);
  process.exit(1);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".mcworld": "application/octet-stream",
};

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(request) {
    const url = new URL(request.url);
    // normalize() collapses any ".." before it can climb out of the root.
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    let file = join(root, rel === "" ? "index.html" : rel);
    if (!file.startsWith(root)) return new Response("forbidden", { status: 403 });
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return new Response("not found", { status: 404 });

    const body = await Bun.file(file).bytes();
    return new Response(body, {
      headers: {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  },
});

console.log(`preview serving ${root} on http://0.0.0.0:${server.port}`);
