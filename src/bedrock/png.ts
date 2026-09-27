/**
 * A minimal PNG codec, 8-bit RGBA, no dependencies.
 *
 * The Soul Keepers pack needs to ship real textures, and this project has no
 * image library: `jpeg-js` is here for the map preview and it cannot write a
 * PNG. Bedrock resource packs want PNG. So this is the smallest thing that
 * does the job, and it is here rather than inlined in a generator so it can be
 * round-trip tested - a texture generator that silently writes a corrupt PNG
 * is worse than one that writes nothing, because the corruption only shows up
 * in the game.
 *
 * Scope is deliberately narrow: non-interlaced, 8-bit, colour type 6 (RGBA).
 * That is what every texture in this pack is, and a general-purpose decoder is
 * not a thing this repo needs.
 */
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG CRC-32 (IEEE 802.3), the polynomial every PNG chunk uses. */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

export interface Image {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

export function createImage(width: number, height: number): Image {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Encode an image as a non-interlaced 8-bit RGBA PNG. */
export function encodePng(image: Image): Buffer {
  const { width, height, data } = image;
  // One filter byte (0 = None) per scanline, then the row's pixels.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const from = y * width * 4;
    const to = y * (1 + width * 4);
    raw[to] = 0;
    Buffer.from(data.buffer, data.byteOffset + from, width * 4).copy(raw, to + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace: none

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Decode a non-interlaced 8-bit PNG produced by `encodePng`. */
export function decodePng(buffer: Buffer): Image {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8) throw new Error(`unsupported bit depth ${body[8]}`);
      if (body[9] !== 6) throw new Error(`unsupported colour type ${body[9]}`);
      if (body[12] !== 0) throw new Error("interlaced PNG is not supported");
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const data = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const row = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const rawByte = line[i]!;
      const left = i >= 4 ? row[i - 4]! : 0;
      const up = previous[i]!;
      const upLeft = i >= 4 ? previous[i - 4]! : 0;
      let value: number;
      switch (filter) {
        case 0: value = rawByte; break;
        case 1: value = rawByte + left; break;
        case 2: value = rawByte + up; break;
        case 3: value = rawByte + ((left + up) >> 1); break;
        case 4: {
          // Paeth
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = rawByte + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default: throw new Error(`unknown filter ${filter} on row ${y}`);
      }
      row[i] = value & 0xff;
    }
    data.set(row, y * stride);
    previous = row;
  }

  return { width, height, data };
}
