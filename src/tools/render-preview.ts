/**
 * Preview renderer: draws the world as PNGs so it can be *looked at* without a
 * Minecraft client.
 *
 * This is a Bedrock world generator. There is no app to preview, no dev server
 * and no in-game camera, so "show me the castle" has exactly one honest answer
 * available from a terminal: render the voxel buffer to an image and serve the
 * image. Everything here reads the finished `World` - the same buffer the
 * `.mcworld` is written from - so what the page shows is what the world is, not
 * a drawing of what it was meant to be.
 *
 * Three projections, because the three things worth reviewing want three
 * different cameras:
 *
 *  - **Plan** (`plan()`) looks straight down and is what you want for *where*
 *    something is: the castle on its plaza, the arena on its plate, the portal
 *    court at the coordinates from the screenshot.
 *  - **Elevation** (`elevation()`) looks along Z and is what you want for the
 *    sky: the canopy is a horizontal feature, the beacons are vertical ones, and
 *    a plan view of either is a single pixel row.
 *  - **Beacon chart** (`beaconChart()`) is not a camera at all. It draws each
 *    landmark's mast as a column in its own colour with its crown on top, so
 *    "every landmark has its own colour" is something you can check by eye
 *    rather than by reading a table.
 *
 *   bun run src/tools/render-preview.ts [outDir]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createImage, encodePng, type Image } from "../bedrock/png.ts";
import { colorAt } from "../world/decorate.ts";
import { CONFIG } from "../world/config.ts";
import { LANDMARKS, type LandmarkId } from "../world/layout.ts";
import { BEACON_COLOURS, beaconMast } from "../world/beacons.ts";
import { PURGATORY_OFFICE_BEACON, planOfficeBeacon } from "../world/purgatory.ts";
import { buildSceneWorld } from "../world/scene.ts";
import type { World } from "../world/world.ts";

/** The block name a beacon's crown wears, as a colour we can actually see. */
const GLASS_RGB: Record<string, [number, number, number]> = {
  "minecraft:white_stained_glass": [240, 242, 244],
  "minecraft:light_gray_stained_glass": [170, 174, 178],
  "minecraft:gray_stained_glass": [118, 124, 130],
  "minecraft:black_stained_glass": [40, 40, 48],
  "minecraft:red_stained_glass": [206, 66, 60],
  "minecraft:orange_stained_glass": [228, 138, 56],
  "minecraft:yellow_stained_glass": [232, 210, 70],
  "minecraft:lime_stained_glass": [136, 206, 78],
  "minecraft:green_stained_glass": [72, 168, 78],
  "minecraft:cyan_stained_glass": [60, 176, 192],
  "minecraft:light_blue_stained_glass": [162, 206, 238],
  "minecraft:blue_stained_glass": [62, 84, 180],
  "minecraft:purple_stained_glass": [134, 68, 184],
  "minecraft:magenta_stained_glass": [202, 88, 206],
  "minecraft:pink_stained_glass": [238, 156, 184],
  "minecraft:brown_stained_glass": [128, 88, 56],
};

const glassRgb = (name: string): [number, number, number] => GLASS_RGB[name] ?? [200, 200, 200];

function put(image: Image, x: number, y: number, rgb: [number, number, number], a = 255): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (y * image.width + x) * 4;
  image.data[i] = rgb[0];
  image.data[i + 1] = rgb[1];
  image.data[i + 2] = rgb[2];
  image.data[i + 3] = a;
}

/**
 * Straight down, with a hill shade.
 *
 * The shade is the same slope term the world icon uses, for the same reason: a
 * plan view of a realm that is mostly flat reads as a texture swatch without
 * it, and the chasms - the thing that makes the plate a *torn* plate - vanish.
 */
export function plan(
  world: World,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  pxPerBlock: number,
): Image {
  const w = Math.max(1, Math.round((x2 - x1 + 1) * pxPerBlock));
  const h = Math.max(1, Math.round((z2 - z1 + 1) * pxPerBlock));
  const image = createImage(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = Math.round(x1 + px / pxPerBlock);
      const z = Math.round(z1 + py / pxPerBlock);
      if (!world.inRealm(x, z)) {
        put(image, px, py, [6, 8, 12]);
        continue;
      }
      const [r, g, b] = colorAt(world, x, z);
      const here = world.surfaceAt(x, z);
      const slope =
        here -
        world.surfaceAt(Math.min(x + 3, x2), z) +
        (here - world.surfaceAt(x, Math.min(z + 3, z2)));
      const shade = Math.max(-0.45, Math.min(0.45, slope * 0.035));
      put(image, px, py, [
        Math.max(0, Math.min(255, Math.round(r * (1 + shade)))),
        Math.max(0, Math.min(255, Math.round(g * (1 + shade)))),
        Math.max(0, Math.min(255, Math.round(b * (1 + shade)))),
      ]);
    }
  }
  return image;
}

/**
 * Looking north along Z: `x` across, `y` up, the nearest solid block in the Z
 * range wins.
 *
 * The vertical exaggeration is deliberate and it is the only lie in the file.
 * A realm 704 blocks wide and 128 tall drawn 1:1 is a letterbox in which a
 * 40-block mast is four pixels. The exaggeration is reported alongside every
 * image so the reader can undo it in their head.
 */
export function elevation(
  world: World,
  x1: number,
  x2: number,
  zNear: number,
  zFar: number,
  pxPerBlock: number,
  pxPerY: number,
  y1 = 0,
  y2 = CONFIG.maxY,
): Image {
  const w = Math.max(1, Math.round((x2 - x1 + 1) * pxPerBlock));
  const h = Math.max(1, Math.round((y2 - y1 + 1) * pxPerY));
  const image = createImage(w, h);
  for (let py = 0; py < h; py++) {
    // py 0 is the top of the image, which is the *top* of the world.
    const y = Math.round(y2 - py / pxPerY);
    for (let px = 0; px < w; px++) {
      const x = Math.round(x1 + px / pxPerBlock);
      let hit: [number, number, number] = [10, 12, 16];
      let found = false;
      const zStep = zFar >= zNear ? 1 : -1;
      for (let z = zNear; found !== true && z !== zFar + zStep; z += zStep) {
        const block = world.get(x, y, z);
        if (!block || block.name === "minecraft:air") continue;
        hit = colorAt(world, x, z);
        found = true;
        if (block.name === "minecraft:air") break;
      }
      put(image, px, py, hit);
    }
  }
  return image;
}

/** A grid line every `every` blocks, so a reader can measure off the image. */
export function grid(image: Image, every: number, pxPerBlock: number, rgb: [number, number, number], a = 70): void {
  for (let g = 0; g * every <= image.width; g++) {
    const x = Math.round(g * every * pxPerBlock);
    for (let y = 0; y < image.height; y++) put(image, x, y, rgb, a);
  }
}

/**
 * Every mast, side by side, in its own colour.
 *
 * Not a camera: this is a chart drawn from `beaconMast()` and `BEACON_COLOURS`
 * against the *actual* voxel buffer, so a mast that was never built draws as a
 * gap. Reading "23 columns, 23 different colours, all of them through the
 * canopy and out the top" off one image is the whole review.
 */
export function beaconChart(world: World, slot = 26, pxPerY = 3): Image {
  const ids = Object.keys(LANDMARKS) as LandmarkId[];
  const top = CONFIG.maxY;
  const image = createImage(ids.length * slot, (top + 1) * pxPerY);
  // The canopy band, drawn behind everything so you can see the masts cross it.
  for (let y = 92; y <= 116; y++) {
    for (let x = 0; x < image.width; x++) put(image, x, (top - y) * pxPerY, [30, 40, 48]);
  }
  for (const [i, id] of ids.entries()) {
    const mast = beaconMast(world, id);
    const colours = BEACON_COLOURS[id];
    const main = glassRgb(colours.main.name);
    const accent = glassRgb(colours.accent.name);
    for (let y = mast.baseY; y <= mast.crownY + 2; y++) {
      const py = (top - y) * pxPerY;
      const lit = y === mast.crownY + 1 || y === mast.crownY + 2;
      for (let dx = 0; dx < slot - 8; dx++) {
        const x = i * slot + 4 + dx;
        if (y % 9 === 0 && dx < 4) {
          put(image, x, py, [30, 30, 38]);
          continue;
        }
        if (lit) {
          put(image, x, py, [255, 244, 190]);
          continue;
        }
        const verify = world.get(mast.x, y, mast.z)?.name;
        put(image, x, py, y % 9 === 4 ? accent : verify ? main : [255, 0, 0]);
      }
    }
  }
  return image;
}

/**
 * The Purgatory office mast, on its own.
 *
 * This one cannot come out of the Underworld `World` buffer: Purgatory is a
 * separate region, 250 blocks tall, and is transplanted straight into its own
 * subchunks rather than through `World.set`. So it is drawn from
 * `planOfficeBeacon()` - the exact plan the transplant writes - and captioned
 * as such. Drawing it from the plan rather than from nothing is the point: a
 * mast that the plan builds and the transplant drops would still show up here,
 * which is why `build.ts` also reports the planned-vs-placed course count.
 */
export function officeBeaconChart(slot = 56, pxPerY = 6): Image {
  const { x, z, baseY, topY } = PURGATORY_OFFICE_BEACON;
  const plan = planOfficeBeacon(new Map());
  const height = (topY - baseY + 1) * pxPerY + 2;
  const image = createImage(slot, height);
  const key = (y: number): number => (x + 1024) * 1048576 + (z + 1024) * 256 + y;
  for (let y = baseY; y <= topY; y++) {
    const block = plan.get(key(y));
    const name = block?.name ?? "minecraft:air";
    const py = (topY - y) * pxPerY + 1;
    // x source -896, z source -256, y source +16 -> the coords you fly to.
    const ruler: [number, number, number] = y % 10 === 0 ? [70, 78, 92] : [44, 50, 60];
    for (let dy = 0; dy < pxPerY; dy++) for (let dx = 0; dx < 6; dx++) put(image, dx, py + dy, ruler);
    if (!block) {
      for (let dy = 0; dy < pxPerY; dy++) for (let dx = 8; dx < 30; dx++) put(image, dx, py + dy, [255, 0, 0]);
      continue;
    }
    for (let dy = 0; dy < pxPerY; dy++) for (let dx = 8; dx < 30; dx++) put(image, dx, py + dy, glassRgb(name));
  }
  // The office floor and the roof of Purgatory's tower, marked in the gutter.
  for (let dx = 0; dx < 8; dx++) {
    put(image, dx, (topY - baseY) * pxPerY + 1, [120, 200, 140]);
    put(image, dx, 1, [120, 200, 140]);
  }
  return image;
}

const out = process.argv[2] ?? join(process.cwd(), "preview");
mkdirSync(out, { recursive: true });
mkdirSync(join(out, "img"), { recursive: true });

const { world } = buildSceneWorld();

const write = (name: string, image: Image): void => {
  const file = join(out, "img", `${name}.png`);
  writeFileSync(file, encodePng(image));
  console.log(`${name}.png  ${image.width}x${image.height}`);
};

const castle = LANDMARKS.veilCastle.footprint;
const lobby = LANDMARKS.portalLobby.footprint;
const arena = LANDMARKS.wardenArena.footprint;

// The whole realm, with every beacon's mast drawn down its landmark's column so
// the twenty-three of them are visible from above as well as from the side.
const realm = plan(world, -352, -352, 351, 351, 1);
for (const id of Object.keys(LANDMARKS) as LandmarkId[]) {
  const mast = beaconMast(world, id);
  for (let y = mast.baseY; y <= mast.crownY + 2; y++) {
    put(realm, mast.x + 352, mast.z + 352, glassRgb(BEACON_COLOURS[id].main.name));
  }
}
write("realm", realm);

write("castle", plan(world, castle.x1 - 14, castle.z1 - 8, castle.x2 + 8, castle.z2 + 8, 6));
write("portal-court", plan(world, lobby.x1 - 6, lobby.z1 - 6, lobby.x2 + 34, lobby.z2 + 6, 7));
write("arena", plan(world, arena.x1 - 4, arena.z1 - 4, arena.x2 + 4, arena.z2 + 4, 8));

// The west reach in section, along the castle's own axis. The castle's dome
// goes to y104, the canopy hangs at y92-116 and the beacons crown at y123, so
// this one image is the argument for all three.
write("section-west", elevation(world, -300, -100, 133, 133, 2, 4));

// A cut straight through the arena, looking along X: the glazed rim walk on
// both sides and the unlit bowl in the middle.
write("section-arena", elevation(world, arena.x1 - 2, arena.x2 + 2, 300, 300, 3, 4));

// The Warden's bowl on its own, so the dark is unmistakably dark.
write("arena-bowl", plan(world, -322, 278, -278, 322, 10));

const chart = beaconChart(world);
write("beacons", chart);
write("office-beacon", officeBeaconChart());

// A machine-readable manifest, so the page and the images cannot disagree about
// what it is looking at.
writeFileSync(
  join(out, "img", "manifest.json"),
  `${JSON.stringify(
    {
      generated: "bun run preview:images",
      landmarks: Object.entries(LANDMARKS).map(([id, lm]) => ({
        id,
        name: lm.name,
        x: lm.center.x,
        z: lm.center.z,
        beacon: `${BEACON_COLOURS[id as LandmarkId].main.name.replace("minecraft:", "")} / ${BEACON_COLOURS[id as LandmarkId].accent.name.replace("minecraft:", "")}`,
        label: BEACON_COLOURS[id as LandmarkId].label,
      })),
      scale: {
        "section-west": "2 px per block in X, 4 px per block in Y - vertical exaggeration 2x",
        "section-arena": "3 px per block in X, 4 px per block in Y - vertical exaggeration 1.33x",
        realm: "1 px per block, 704x704, with each beacon's mast drawn down its column",
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`\npreview images written to ${join(out, "img")}`);

// The review page. Static, no client framework, no build step: it is the only
// thing the preview server has to hand out, and it is written here so that the
// captions and the images come from the same run of the same world.
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const manifest = {
  landmarks: Object.entries(LANDMARKS).map(([id, lm]) => ({
    id,
    name: lm.name,
    x: lm.center.x,
    z: lm.center.z,
    beacon: `${BEACON_COLOURS[id as LandmarkId].main.name.replace("minecraft:", "")} / ${BEACON_COLOURS[id as LandmarkId].accent.name.replace("minecraft:", "")}`,
    swatch: glassRgb(BEACON_COLOURS[id as LandmarkId].main.name),
  })),
};

const VIEWS: { file: string; title: string; note: string }[] = [
  {
    file: "realm.png",
    title: "The whole Underworld, from above",
    note: "704x704, one pixel per block, every beacon mast drawn down its own landmark's column.",
  },
  {
    file: "beacons.png",
    title: "Every landmark's beacon, in its own colour",
    note: "One column per landmark, crown on top, drawn against the y92-116 canopy band. Red means the mast is missing from the voxel buffer.",
  },
  {
    file: "castle.png",
    title: "The Veil Castle, on the plaza from your screenshot",
    note: "Plan view, 6 px per block. The forecourt is the plaza at -179, 46, 133; the causeway runs west off it.",
  },
  {
    file: "section-west.png",
    title: "West reach in section, along the castle's own axis",
    note: "2 px per block across, 4 px per block up, so heights are exaggerated 2x to make a 40-block mast visible.",
  },
  {
    file: "arena.png",
    title: "Warden arena, glazed",
    note: "The plate, the ring walk and the buttresses are stained glass. The bowl in the middle is untouched sculk.",
  },
  {
    file: "arena-bowl.png",
    title: "The Warden's bowl itself",
    note: "10 px per block. No glass in here - the Warden and the sculk are exactly as they were.",
  },
  {
    file: "section-arena.png",
    title: "Warden arena in section",
    note: "Cut through the arena looking along X: glazed rim walk on both sides, unlit sculk floor between them.",
  },
  {
    file: "office-beacon.png",
    title: "The Purgatory office beacon",
    note: "The mast you asked for, from the office floor at -622, 267, 27 up to y298 - the highest block on Purgatory. Drawn from the transplant plan rather than the Underworld buffer, because Purgatory is a separate region; red would mean the plan has a gap in it.",
  },
  {
    file: "portal-court.png",
    title: "The Nether portal court",
    note: "Walled green deepslate and tuff with gold ore, the portal frames set into the walls, and the dark-oak door in its andesite reveal.",
  },
];

const legend = manifest.landmarks
  .map(
    (lm) =>
      `<tr><td><span class="sw" style="background:rgb(${lm.swatch[0]},${lm.swatch[1]},${lm.swatch[2]})"></span></td>` +
      `<td>${esc(lm.name)}</td><td>${esc(lm.beacon)}</td><td>${lm.x}, ${lm.z}</td></tr>`,
  )
  .join("\n");

writeFileSync(
  join(out, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Underworld Simulator Remastered - preview</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0b0d12; color:#dfe4ec;
         font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  header { padding:32px 24px 20px; border-bottom:1px solid #1d222d;
           background:linear-gradient(180deg,#121722,#0b0d12); }
  h1 { margin:0 0 6px; font-size:26px; letter-spacing:-.01em; }
  header p { margin:0; color:#8f99ab; max-width:62ch; }
  section { padding:26px 24px; border-bottom:1px solid #161b24; }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.14em;
       color:#6f7b8f; margin:0 0 16px; font-weight:600; }
  figure { margin:0 0 30px; }
  figcaption { margin-top:8px; }
  figcaption b { display:block; font-size:16px; }
  figcaption span { color:#8f99ab; font-size:13px; }
  img { display:block; width:100%; max-width:1000px; height:auto; image-rendering:pixelated;
        border:1px solid #222836; border-radius:6px; background:#05070a; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:22px; }
  table { border-collapse:collapse; font-size:14px; }
  td,th { padding:5px 14px 5px 0; text-align:left; border-bottom:1px solid #161b24; }
  th { color:#6f7b8f; font-weight:600; }
  .sw { display:inline-block; width:14px; height:14px; border-radius:3px;
        box-shadow:0 0 8px currentColor; }
  code { background:#161b24; padding:1px 5px; border-radius:4px; font-size:13px; }
</style>
</head>
<body>
<header>
  <h1>Underworld Simulator Remastered</h1>
  <p>Rendered straight out of the finished voxel buffer - the same one the
     <code>.mcworld</code> is written from. Nothing here is a mock-up.</p>
</header>
<section>
  <h2>Landmarks and their beacon colours</h2>
  <table>
    <tr><th></th><th>Landmark</th><th>Beacon</th><th>Centre (x, z)</th></tr>
    ${legend}
    <tr><td><span class="sw" style="background:rgb(72,168,78)"></span></td>
        <td>The Purgatory office <em>(separate region)</em></td>
        <td>green_stained_glass / lime_stained_glass</td>
        <td>-622, 27</td></tr>
  </table>
</section>
${VIEWS.map(
  (v) => `<section>
  <h2>${esc(v.title)}</h2>
  <figure>
    <img src="img/${v.file}" alt="${esc(v.title)}" loading="lazy">
    <figcaption><b>${esc(v.title)}</b><span>${esc(v.note)}</span></figcaption>
  </figure>
</section>`,
).join("\n")}
</body>
</html>
`,
);

console.log(`preview page written to ${join(out, "index.html")}`);
