/**
 * Generate the Soul Keepers' textures.
 *
 * The pack shipped with **no PNGs at all**, which is the single biggest reason
 * it had never been seen working: a resource pack that references
 * `textures/entity/soul_keeper_zombie` with nothing at that path renders the
 * mob as the pink-and-black missing-texture checker, and the entire "green
 * infected, dark Soul Keeper cloak" look that the pack exists to produce is
 * simply absent.
 *
 * So the textures are *drawn*, here, in code. That sounds like a strange thing
 * to do to pixel art, and it would be, if the goal were good pixel art. The
 * goal is a pack that loads and looks like something on a phone: flat colours,
 * a readable silhouette, and the canon green doing the work. Anyone who wants
 * to replace these with real art just drops a 64x64 PNG over the top, and
 * `--check` is what tells them it no longer matches this generator.
 *
 * The UV layouts here are Minecraft's standard box-net layouts, written once in
 * `paintBox` rather than hand-tabulated per body part, because a mis-set UV
 * offset does not error - it just produces a mob with its face on its chest.
 *
 *   bun run src/tools/make-pack-textures.ts          # write the PNGs
 *   bun run src/tools/make-pack-textures.ts --check  # fail if they have drifted
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createImage, encodePng, type Image } from "../bedrock/png.ts";
import { hash2 } from "../world/noise.ts";

type Rgba = readonly [number, number, number, number];

const RP = join("packs", "soul-keepers-rp");
const ENTITY_DIR = join(RP, "textures", "entity");
const ITEM_DIR = join(RP, "textures", "items");

// -- the palette ------------------------------------------------------------
//
// "almost everything is gray or black, with really the only vibrant color
// being the green visible on some structures" - the Soul Keepers, describing
// their own builds. So: a near-monochrome dark range, and green used the way
// they used it, sparingly, where it means something.
const P = {
  void: [16, 18, 20, 255],
  cloth: [38, 44, 42, 255],
  clothLit: [56, 66, 60, 255],
  bone: [198, 200, 186, 255],
  boneShade: [150, 154, 142, 255],
  flesh: [92, 116, 88, 255],
  fleshShade: [62, 82, 60, 255],
  rot: [110, 122, 74, 255],
  soul: [58, 190, 106, 255],
  soulBright: [140, 255, 176, 255],
  ember: [214, 122, 54, 255],
  emberHot: [255, 196, 96, 255],
  steel: [74, 80, 88, 255],
  steelLit: [108, 116, 126, 255],
  clear: [0, 0, 0, 0],
} as const satisfies Record<string, Rgba>;

type Palette = { [K in keyof typeof P]: Rgba };

// -- painting ---------------------------------------------------------------

function fill(image: Image, x: number, y: number, w: number, h: number, colour: Rgba): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
      const i = (py * image.width + px) * 4;
      image.data[i] = colour[0];
      image.data[i + 1] = colour[1];
      image.data[i + 2] = colour[2];
      image.data[i + 3] = colour[3];
    }
  }
}

function setPixel(image: Image, x: number, y: number, colour: Rgba): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (y * image.width + x) * 4;
  image.data[i] = colour[0];
  image.data[i + 1] = colour[1];
  image.data[i + 2] = colour[2];
  image.data[i + 3] = colour[3];
}

function getPixel(image: Image, x: number, y: number): Rgba {
  const i = (y * image.width + x) * 4;
  return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!, image.data[i + 3]!];
}

/** Exported for tests: is this pixel fully transparent? */
export function isTransparentAt(image: Image, x: number, y: number): boolean {
  return getPixel(image, x, y)[3] === 0;
}

/** Speckle a rect with a second colour - the cheapest way to stop flat fills reading as plastic. */
function speckle(
  image: Image,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: Rgba,
  density: number,
  seed: number,
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (hash2(x + dx, y + dy, seed) > density) continue;
      setPixel(image, x + dx, y + dy, colour);
    }
  }
}

/** A 1px outline, drawn in place. Used to separate a limb from the body behind it. */
function outline(image: Image, x: number, y: number, w: number, h: number, colour: Rgba): void {
  for (let dx = 0; dx < w; dx++) {
    setPixel(image, x + dx, y, colour);
    setPixel(image, x + dx, y + h - 1, colour);
  }
  for (let dy = 0; dy < h; dy++) {
    setPixel(image, x, y + dy, colour);
    setPixel(image, x + w - 1, y + dy, colour);
  }
}

// -- box nets ---------------------------------------------------------------

/** A face of a box, in texture pixels. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Paint the six faces of a Minecraft box-net.
 *
 * `uv` is the box's texture origin and `size` is `[width, height, depth]`,
 * exactly as they appear in a model file, and this lays the faces out the way
 * the engine expects:
 *
 * ```
 *            +--------+--------+
 *            |  top   | bottom |
 * +--------+--------+--------+--------+
 * | right  | front  |  left  |  back  |
 * +--------+--------+--------+--------+
 * ```
 *
 * The right-hand column is empty padding. Getting this wrong is invisible in
 * every other sense - the file still parses, the mob still spawns - and the
 * only symptom is a texture wrapped onto the wrong limb, so it lives in one
 * place and is never written out by hand.
 */
function paintBox(
  image: Image,
  uv: readonly [number, number],
  size: readonly [number, number, number],
  faces: {
    top: (r: Rect) => void;
    bottom: (r: Rect) => void;
    right: (r: Rect) => void;
    front: (r: Rect) => void;
    left: (r: Rect) => void;
    back: (r: Rect) => void;
  },
): void {
  const [u, v] = uv;
  const [w, h, d] = size;
  const top: Rect = { x: u + d, y: v, w, h: d };
  const bottom: Rect = { x: u + d + w, y: v, w, h: d };
  const right: Rect = { x: u, y: v + d, w: d, h };
  const front: Rect = { x: u + d, y: v + d, w, h };
  const left: Rect = { x: u + d + w, y: v + d, w: d, h };
  const back: Rect = { x: u + d + 2 * w, y: v + d, w, h };
  faces.top(top);
  faces.bottom(bottom);
  faces.right(right);
  faces.front(front);
  faces.left(left);
  faces.back(back);
}

/**
 * The standard humanoid base layer, as box nets.
 *
 * These are the offsets `geometry.humanoid` expects on a 64x64 skin. The
 * second (overlay) layer is deliberately left empty: `entity_alphatest` renders
 * a transparent overlay as nothing, so the base layer shows through, and
 * leaving those 3,000-odd pixels clear keeps the mob from having a hat and a
 * jacket made of noise.
 */
const HUMANOID = {
  head: { uv: [0, 0] as const, size: [8, 8, 8] as const },
  body: { uv: [16, 16] as const, size: [8, 12, 4] as const },
  rightArm: { uv: [40, 16] as const, size: [4, 12, 4] as const },
  rightLeg: { uv: [0, 16] as const, size: [4, 12, 4] as const },
  leftArm: { uv: [32, 48] as const, size: [4, 12, 4] as const },
  leftLeg: { uv: [16, 48] as const, size: [4, 12, 4] as const },
};

/** Paint a humanoid skin, letting the caller paint each visible face. */
function paintHumanoid(
  image: Image,
  faces: {
    head: (r: Rect, part: "front" | "back" | "side" | "top" | "bottom") => void;
    torso: (r: Rect, part: "front" | "back" | "side" | "top" | "bottom") => void;
    limb: (r: Rect, part: "front" | "back" | "side" | "top" | "bottom") => void;
  },
): void {
  paintBox(image, HUMANOID.head.uv, HUMANOID.head.size, {
    top: (r) => faces.head(r, "top"),
    bottom: (r) => faces.head(r, "bottom"),
    right: (r) => faces.head(r, "side"),
    left: (r) => faces.head(r, "side"),
    front: (r) => faces.head(r, "front"),
    back: (r) => faces.head(r, "back"),
  });
  paintBox(image, HUMANOID.body.uv, HUMANOID.body.size, {
    top: (r) => faces.torso(r, "top"),
    bottom: (r) => faces.torso(r, "bottom"),
    right: (r) => faces.torso(r, "side"),
    left: (r) => faces.torso(r, "side"),
    front: (r) => faces.torso(r, "front"),
    back: (r) => faces.torso(r, "back"),
  });
  for (const part of [HUMANOID.rightArm, HUMANOID.leftArm, HUMANOID.rightLeg, HUMANOID.leftLeg]) {
    paintBox(image, part.uv, part.size, {
      top: (r) => faces.limb(r, "top"),
      bottom: (r) => faces.limb(r, "bottom"),
      right: (r) => faces.limb(r, "side"),
      left: (r) => faces.limb(r, "side"),
      front: (r) => faces.limb(r, "front"),
      back: (r) => faces.limb(r, "back"),
    });
  }
}

// -- the mobs ---------------------------------------------------------------

/**
 * The trader: the one mob you can talk to, so it is the one that has to read
 * as a person. Long robe, shoulders up around the head, and the only bright
 * thing on it is the face.
 */
function traderTexture(): Image {
  const image = createImage(64, 64);
  const robe = P.cloth;
  const robeLit = P.clothLit;
  const trim = P.soul;
  paintHumanoid(image, {
    head: (r, part) => {
      fill(image, r.x, r.y, r.w, r.h, P.void);
      if (part === "top" || part === "bottom") {
        speckle(image, r.x, r.y, r.w, r.h, P.cloth, 0.4, 11);
        return;
      }
      // a deep hood: dark all over, with the face a small lit patch
      fill(image, r.x, r.y, r.w, r.h, P.void);
      if (part === "front") {
        fill(image, r.x + 2, r.y + 2, 4, 4, P.flesh);
        // the long nose, which is the whole silhouette of a wandering trader
        fill(image, r.x + 3, r.y + 3, 2, 2, P.fleshShade);
        setPixel(image, r.x + 1, r.y + 3, P.soulBright);
        setPixel(image, r.x + 6, r.y + 3, P.soulBright);
        fill(image, r.x + 1, r.y, 6, 1, trim);
        fill(image, r.x + 1, r.y + 7, 6, 1, P.void);
      } else if (part === "back") {
        // the sigil on the back of the hood
        fill(image, r.x + 2, r.y + 2, 4, 4, robe);
        fill(image, r.x + 3, r.y + 3, 2, 2, trim);
        setPixel(image, r.x + 4, r.y + 4, P.soulBright);
      } else {
        fill(image, r.x + 1, r.y, 6, 8, robe);
        fill(image, r.x + 1, r.y, 6, 1, trim);
      }
      outline(image, r.x, r.y, r.w, r.h, P.void);
    },
    torso: (r, part) => {
      fill(image, r.x, r.y, r.w, r.h, robe);
      speckle(image, r.x, r.y, r.w, r.h, P.void, 0.25, 23);
      if (part === "front") {
        // a laced front with one green fastening
        for (let i = 0; i < 6; i++) setPixel(image, r.x + 3, r.y + 2 + i, robeLit);
        fill(image, r.x + 2, r.y + 3, 4, 1, trim);
        fill(image, r.x + 3, r.y + 6, 2, 2, trim);
        setPixel(image, r.x + 3, r.y + 6, P.soulBright);
      } else if (part === "back") {
        fill(image, r.x + 1, r.y + 1, 6, 5, robeLit);
        outline(image, r.x + 1, r.y + 1, 6, 5, P.void);
      }
      if (part !== "front" && part !== "back") fill(image, r.x, r.y, r.w, 1, trim);
    },
    limb: (r, part) => {
      fill(image, r.x, r.y, r.w, r.h, robe);
      speckle(image, r.x, r.y, r.w, r.h, P.void, 0.3, 31);
      // hands
      if (r.h >= 12 && r.y + 11 < 64) fill(image, r.x, r.y + 10, r.w, 2, P.fleshShade);
      if (part === "front" && r.w === 4) fill(image, r.x, r.y + 8, 4, 1, trim);
    },
  });
  return image;
}

/** The archer: bone under a hood, with the infection climbing out of the seams. */
function skeletonTexture(): Image {
  const image = createImage(64, 64);
  paintHumanoid(image, {
    head: (r, part) => {
      if (part === "top") {
        fill(image, r.x, r.y, r.w, r.h, P.void);
        return;
      }
      if (part === "bottom") {
        fill(image, r.x, r.y, r.w, r.h, P.void);
        return;
      }
      fill(image, r.x, r.y, r.w, r.h, P.bone);
      speckle(image, r.x, r.y, r.w, r.h, P.boneShade, 0.3, 41);
      if (part === "front") {
        // the dark sockets, and the green behind them
        fill(image, r.x + 1, r.y + 3, 2, 2, P.void);
        fill(image, r.x + 5, r.y + 3, 2, 2, P.void);
        setPixel(image, r.x + 2, r.y + 3, P.soul);
        setPixel(image, r.x + 5, r.y + 3, P.soul);
        // teeth
        for (let i = 1; i < 7; i += 2) setPixel(image, r.x + i, r.y + 6, P.void);
        // a hood shadow across the top of the skull
        fill(image, r.x, r.y, 8, 2, P.void);
      } else if (part === "back") {
        // spine
        for (let i = 1; i < 7; i += 2) setPixel(image, r.x + i, r.y + 1, P.boneShade);
      }
      outline(image, r.x, r.y, r.w, r.h, P.boneShade);
    },
    torso: (r, part) => {
      fill(image, r.x, r.y, r.w, r.h, P.bone);
      speckle(image, r.x, r.y, r.w, r.h, P.boneShade, 0.35, 53);
      if (part === "front") {
        // ribs
        for (let i = 1; i < 5; i++) {
          fill(image, r.x + 1, r.y + 1 + i * 2, 6, 1, P.boneShade);
          setPixel(image, r.x, r.y + 1 + i * 2, P.void);
          setPixel(image, r.x + 7, r.y + 1 + i * 2, P.void);
        }
        fill(image, r.x + 3, r.y, 2, 12, P.void);
        // the infection, coming through the sternum
        fill(image, r.x + 3, r.y + 4, 2, 3, P.rot);
        setPixel(image, r.x + 3, r.y + 5, P.soul);
        setPixel(image, r.x + 4, r.y + 5, P.soul);
      }
      outline(image, r.x, r.y, r.w, r.h, P.boneShade);
    },
    limb: (r, part) => {
      fill(image, r.x, r.y, r.w, r.h, P.bone);
      speckle(image, r.x, r.y, r.w, r.h, P.boneShade, 0.3, 61);
      if (part === "front") {
        for (let i = 1; i < r.h; i += 3) fill(image, r.x, r.y + i, r.w, 1, P.boneShade);
      }
      outline(image, r.x, r.y, r.w, r.h, P.boneShade);
    },
  });
  // a green rim light down one edge of the whole mob, so it reads at distance
  for (let y = 0; y < 64; y++) setPixel(image, 63, y, P.rot);
  return image;
}

/** The bruiser: rotting flesh under scavenged plate, and the biggest of the three. */
function zombieTexture(): Image {
  const image = createImage(64, 64);
  paintHumanoid(image, {
    head: (r, part) => {
      if (part === "top" || part === "bottom") {
        fill(image, r.x, r.y, r.w, r.h, P.fleshShade);
        speckle(image, r.x, r.y, r.w, r.h, P.rot, 0.35, 71);
        return;
      }
      fill(image, r.x, r.y, r.w, r.h, P.flesh);
      speckle(image, r.x, r.y, r.w, r.h, P.fleshShade, 0.4, 73);
      speckle(image, r.x, r.y, r.w, r.h, P.rot, 0.2, 79);
      if (part === "front") {
        fill(image, r.x + 1, r.y + 2, 2, 2, P.void);
        fill(image, r.x + 5, r.y + 2, 2, 2, P.void);
        setPixel(image, r.x + 1, r.y + 2, P.soulBright);
        setPixel(image, r.x + 6, r.y + 2, P.soulBright);
        // a jaw hanging open
        fill(image, r.x + 2, r.y + 5, 4, 2, P.void);
        for (let i = 0; i < 4; i++) setPixel(image, r.x + 2 + i, r.y + 5, P.bone);
        // iron riveted across the brow
        fill(image, r.x, r.y, 8, 2, P.steel);
        setPixel(image, r.x + 1, r.y + 1, P.steelLit);
        setPixel(image, r.x + 6, r.y + 1, P.steelLit);
      }
      outline(image, r.x, r.y, r.w, r.h, P.fleshShade);
    },
    torso: (r, part) => {
      fill(image, r.x, r.y, r.w, r.h, P.flesh);
      speckle(image, r.x, r.y, r.w, r.h, P.fleshShade, 0.4, 83);
      speckle(image, r.x, r.y, r.w, r.h, P.rot, 0.25, 89);
      if (part === "front") {
        // a chest plate of scavenged iron, split down the middle
        fill(image, r.x, r.y, 8, 5, P.steel);
        speckle(image, r.x, r.y, 8, 5, P.steelLit, 0.3, 97);
        fill(image, r.x + 3, r.y, 2, 5, P.void);
        fill(image, r.x + 2, r.y + 2, 4, 2, P.rot);
        setPixel(image, r.x + 3, r.y + 3, P.soul);
        // an exposed ribcage below it
        for (let i = 0; i < 3; i++) fill(image, r.x + 1, r.y + 7 + i * 2, 6, 1, P.boneShade);
      } else if (part === "back") {
        fill(image, r.x + 1, r.y, 6, 12, P.cloth);
        speckle(image, r.x + 1, r.y, 6, 12, P.void, 0.4, 101);
      }
      outline(image, r.x, r.y, r.w, r.h, P.fleshShade);
    },
    limb: (r, part) => {
      fill(image, r.x, r.y, r.w, r.h, P.flesh);
      speckle(image, r.x, r.y, r.w, r.h, P.fleshShade, 0.4, 103);
      if (part === "front" && r.h >= 12) {
        // vambraces
        fill(image, r.x, r.y + 3, r.w, 4, P.steel);
        speckle(image, r.x, r.y + 3, r.w, 4, P.steelLit, 0.3, 107);
        fill(image, r.x, r.y + 10, r.w, 2, P.void);
      }
      outline(image, r.x, r.y, r.w, r.h, P.fleshShade);
    },
  });
  return image;
}

/**
 * The ashen one: charred cloth over cooling embers.
 *
 * It is built on the humanoid rig rather than a bespoke blaze model. That is a
 * deliberate trade: a hand-written `.geo.json` cannot be validated in this
 * repository, and a geometry file the game rejects means an invisible mob,
 * whereas `geometry.humanoid` is guaranteed to exist and guaranteed to fit the
 * UVs above. If this ever gets real art, swapping the rig is a one-line change
 * in `ashen_blaze.ent.json` plus a geometry file.
 */
function blazeTexture(): Image {
  const image = createImage(64, 64);
  paintHumanoid(image, {
    head: (r, part) => {
      fill(image, r.x, r.y, r.w, r.h, P.void);
      speckle(image, r.x, r.y, r.w, r.h, P.cloth, 0.5, 113);
      if (part === "front") {
        // a face that is mostly gone, with two coals where the eyes were
        fill(image, r.x + 2, r.y + 2, 4, 4, P.clothLit);
        speckle(image, r.x + 2, r.y + 2, 4, 4, P.ember, 0.35, 127);
        fill(image, r.x + 1, r.y + 3, 2, 1, P.emberHot);
        fill(image, r.x + 5, r.y + 3, 2, 1, P.emberHot);
        setPixel(image, r.x + 2, r.y + 3, P.soulBright);
        setPixel(image, r.x + 5, r.y + 3, P.soulBright);
      } else if (part === "back") {
        fill(image, r.x + 2, r.y + 2, 4, 4, P.clothLit);
        fill(image, r.x + 3, r.y + 3, 2, 2, P.ember);
        setPixel(image, r.x + 3, r.y + 3, P.emberHot);
      } else {
        speckle(image, r.x, r.y, r.w, r.h, P.ember, 0.2, 131);
      }
      outline(image, r.x, r.y, r.w, r.h, P.void);
    },
    torso: (r, part) => {
      fill(image, r.x, r.y, r.w, r.h, P.cloth);
      speckle(image, r.x, r.y, r.w, r.h, P.void, 0.45, 137);
      // the chest is a furnace: the only warm light on the mob
      const glow = part === "front" ? 5 : 3;
      for (let i = 0; i < glow; i++) {
        fill(image, r.x + 1 + i, r.y + 2 + i, 6 - i * 2, 1, P.ember);
      }
      for (let i = 0; i < glow - 1; i++) {
        fill(image, r.x + 2 + i, r.y + 3 + i, 4 - i * 2, 1, P.emberHot);
      }
      setPixel(image, r.x + 3, r.y + 4, P.soulBright);
      setPixel(image, r.x + 4, r.y + 4, P.soulBright);
      if (part === "back") fill(image, r.x, r.y, 8, 1, P.ember);
      outline(image, r.x, r.y, r.w, r.h, P.void);
    },
    limb: (r, part) => {
      fill(image, r.x, r.y, r.w, r.h, P.cloth);
      speckle(image, r.x, r.y, r.w, r.h, P.void, 0.4, 149);
      if (part === "front") {
        // embers running down the arms, brighter at the hands
        for (let i = 0; i < r.h; i += 4) fill(image, r.x, r.y + i, r.w, 1, P.ember);
        fill(image, r.x, r.y + r.h - 2, r.w, 2, P.emberHot);
      }
      outline(image, r.x, r.y, r.w, r.h, P.void);
    },
  });
  return image;
}

/**
 * The cloak. 64x32, the size `geometry.player_cape` samples.
 *
 * The `player_cape` geometry is a single strip, so this is painted as a
 * repeating vertical panel rather than as a box: a dark ground, a green
 * border, and the Keepers' eye in the middle. It is the one texture in the
 * pack that is a flat panel, and the one a player will see most of, because
 * the trader is the only mob you stand behind.
 */
function cloakTexture(): Image {
  const image = createImage(64, 32);
  fill(image, 0, 0, 64, 32, P.void);
  fill(image, 2, 0, 60, 32, P.cloth);
  speckle(image, 2, 0, 60, 32, P.clothLit, 0.3, 151);
  // a green border all the way round
  fill(image, 0, 0, 64, 1, P.soul);
  fill(image, 0, 31, 64, 1, P.soul);
  fill(image, 0, 0, 1, 32, P.soul);
  fill(image, 63, 0, 1, 32, P.soul);
  // folds
  for (let x = 6; x < 62; x += 7) fill(image, x, 1, 1, 30, P.void);
  // the eye, centred, 16 wide
  const cx = 32;
  const cy = 16;
  for (let dy = -7; dy <= 7; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      const d = Math.hypot(dx / 8, dy / 7);
      if (d > 1) continue;
      if (d > 0.72) setPixel(image, cx + dx, cy + dy, P.clothLit);
      else if (d < 0.3) setPixel(image, cx + dx, cy + dy, P.void);
      else if (Math.hypot((dx + 2) / 8, (dy + 2) / 7) < 0.22) setPixel(image, cx + dx, cy + dy, P.soulBright);
      else if (d > 0.55) setPixel(image, cx + dx, cy + dy, P.soul);
      else setPixel(image, cx + dx, cy + dy, P.rot);
    }
  }
  return image;
}

/** A 16x16 item icon. Bedrock samples these at any size, so keep the shapes chunky. */
function itemTexture(kind: "blade" | "helm"): Image {
  const image = createImage(16, 16);
  fill(image, 0, 0, 16, 16, P.clear);
  if (kind === "blade") {
    // a straight blade on the diagonal, green-etched
    for (let i = 0; i < 10; i++) {
      const x = 3 + i;
      const y = 12 - i;
      fill(image, x, y, 2, 2, P.steelLit);
      setPixel(image, x, y, P.steel);
    }
    fill(image, 3, 11, 3, 3, P.soul);
    fill(image, 2, 13, 2, 3, P.cloth);
    setPixel(image, 5, 4, P.soulBright);
  } else {
    // a helm: dome, visor slit, cheek plates
    fill(image, 3, 4, 10, 8, P.steel);
    fill(image, 3, 4, 10, 2, P.steelLit);
    fill(image, 2, 10, 12, 4, P.steel);
    fill(image, 4, 8, 8, 2, P.void);
    fill(image, 5, 8, 2, 1, P.soulBright);
    fill(image, 9, 8, 2, 1, P.soulBright);
    fill(image, 3, 12, 10, 1, P.soul);
    speckle(image, 3, 4, 10, 10, P.void, 0.15, 157);
  }
  return image;
}

/**
 * The wither skull: a 16x16 sprite, because `geometry.item_sprite` draws a
 * flat card that the billboard animation turns toward the camera.
 */
function witherSkullTexture(): Image {
  const image = createImage(16, 16);
  fill(image, 0, 0, 16, 16, P.clear);
  // a bone skull, three-quarter, with the two cold fires behind it
  fill(image, 4, 4, 8, 7, P.bone);
  fill(image, 3, 5, 10, 5, P.bone);
  speckle(image, 3, 4, 10, 7, P.boneShade, 0.25, 163);
  // sockets
  fill(image, 4, 6, 3, 3, P.void);
  fill(image, 9, 6, 3, 3, P.void);
  setPixel(image, 5, 7, P.soulBright);
  setPixel(image, 10, 7, P.soulBright);
  // jaw
  fill(image, 6, 10, 4, 2, P.bone);
  for (let i = 0; i < 3; i++) setPixel(image, 6 + i * 2, 10, P.void);
  outline(image, 3, 4, 10, 8, P.void);
  // the soul-fire it leaves behind
  for (let i = 0; i < 4; i++) {
    setPixel(image, 5 - i, 13 + i, P.soul);
    setPixel(image, 10 + i, 13 + i, P.soul);
  }
  return image;
}

/** An 8x8 particle texture, the shape a custom particle samples. */
function particleTexture(): Image {
  const image = createImage(8, 8);
  fill(image, 0, 0, 8, 8, P.clear);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const d = Math.hypot(x - 3.5, y - 3.5) / 3.5;
      if (d > 1) continue;
      const core = d < 0.45;
      setPixel(image, x, y, core ? P.soulBright : P.soul);
    }
  }
  return image;
}

// -- output -----------------------------------------------------------------

interface Output {
  path: string;
  image: Image;
}

function outputs(): Output[] {
  return [
    { path: join(ENTITY_DIR, "soul_keeper_trader.png"), image: traderTexture() },
    { path: join(ENTITY_DIR, "soul_keeper_skeleton.png"), image: skeletonTexture() },
    { path: join(ENTITY_DIR, "soul_keeper_zombie.png"), image: zombieTexture() },
    { path: join(ENTITY_DIR, "soul_keeper_cloak.png"), image: cloakTexture() },
    { path: join(ENTITY_DIR, "ashen_blaze.png"), image: blazeTexture() },
    { path: join(ITEM_DIR, "keeper_blade.png"), image: itemTexture("blade") },
    { path: join(ITEM_DIR, "keeper_helm.png"), image: itemTexture("helm") },
    { path: join(ITEM_DIR, "wither_skull.png"), image: witherSkullTexture() },
    { path: join(RP, "textures", "particle", "soul_green.png"), image: particleTexture() },
  ];
}

const check = process.argv.includes("--check");
const drift: string[] = [];
let written = 0;

/** Pixels with any alpha at all - a fully transparent texture renders as nothing. */
function paintedPixels(image: Image): number {
  let n = 0;
  for (let i = 3; i < image.data.length; i += 4) {
    if (image.data[i]! > 0) n++;
  }
  return n;
}

for (const { path, image } of outputs()) {
  const png = encodePng(image);
  if (check) {
    if (!existsSync(path)) drift.push(`${path} (missing)`);
    else if (!readFileSync(path).equals(png)) drift.push(`${path} (differs from the generator)`);
    continue;
  }
  // A transparent texture is the classic silent failure: the file is written,
  // the pack validates, and the mob is invisible in game. Prove it has pixels.
  if (paintedPixels(image) === 0) throw new Error(`${path} is entirely transparent`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
  written++;
  console.log(
    `wrote ${path}  ${image.width}x${image.height}  ${png.length} bytes  ` +
      `${paintedPixels(image)} painted px`,
  );
}

if (check) {
  if (drift.length > 0) {
    console.error("pack textures have drifted from the generator:");
    for (const line of drift) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log("pack textures match the generator");
} else {
  console.log(`\n${written} textures written`);
}
