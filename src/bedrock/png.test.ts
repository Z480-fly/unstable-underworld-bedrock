/**
 * Tests for the PNG codec.
 *
 * The round-trip matters more than it looks: these textures are generated, not
 * drawn by hand, so the only way a broken UV layout or a botched alpha channel
 * is ever going to be noticed is if the pixels survive a write and a read. The
 * failure mode this guards against is a generator that emits a structurally
 * valid but visually corrupt PNG, which the game accepts and the player sees
 * as a black or transparent mob.
 */
import { describe, expect, test } from "bun:test";
import { createImage, decodePng, encodePng } from "./png.ts";

describe("the PNG codec", () => {
  test("round-trips pixels exactly", () => {
    const image = createImage(9, 7);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = (i * 7) & 0xff;
      image.data[i + 1] = (i * 13) & 0xff;
      image.data[i + 2] = (i * 29) & 0xff;
      image.data[i + 3] = i % 5 === 0 ? 0 : 255;
    }
    const decoded = decodePng(encodePng(image));
    expect(decoded.width).toBe(9);
    expect(decoded.height).toBe(7);
    expect(Array.from(decoded.data)).toEqual(Array.from(image.data));
  });

  test("round-trips a fully transparent image", () => {
    // Mobs have real transparency in their skins, and an all-zero buffer is
    // the case most likely to be optimised away by mistake.
    const image = createImage(4, 4);
    const decoded = decodePng(encodePng(image));
    expect(Array.from(decoded.data)).toEqual(new Array(64).fill(0));
  });

  test("writes a real PNG signature and the chunks the game reads", () => {
    const png = encodePng(createImage(2, 2));
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const text = png.toString("latin1");
    for (const type of ["IHDR", "IDAT", "IEND"]) expect(text).toContain(type);
  });

  test("refuses things that are not PNGs it can read", () => {
    expect(() => decodePng(Buffer.from("not a png at all"))).toThrow(/not a PNG/);
  });

  test("produces a smaller file than the raw pixels", () => {
    // A sanity check that deflate is actually running: a 64x64 flat texture
    // should compress hard, and if it does not, something is writing the raw
    // scanlines and the files will be needlessly large in the pack.
    const image = createImage(64, 64);
    image.data.fill(120);
    const png = encodePng(image);
    expect(png.length).toBeLessThan(64 * 64 * 4);
  });
});
