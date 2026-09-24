/**
 * Minimal little-endian NBT writer (Bedrock flavour) plus a growable byte
 * writer. Used for block palette entries inside subchunks and for anything else
 * that needs to be written thousands of times per build, where prismarine-nbt's
 * generic encoder would be far too slow.
 *
 * Bedrock NBT: multi-byte integers and string lengths are little-endian, and
 * strings are length-prefixed with an unsigned 16-bit integer.
 */

export const TAG = {
  End: 0x00,
  Byte: 0x01,
  Short: 0x02,
  Int: 0x03,
  Long: 0x04,
  Float: 0x05,
  Double: 0x06,
  ByteArray: 0x07,
  String: 0x08,
  List: 0x09,
  Compound: 0x0a,
  IntArray: 0x0b,
} as const;

export class ByteWriter {
  private buf: Buffer;
  private len = 0;

  constructor(initialSize = 1024) {
    this.buf = Buffer.allocUnsafe(initialSize);
  }

  private ensure(extra: number): void {
    const need = this.len + extra;
    if (need <= this.buf.length) return;
    let cap = this.buf.length === 0 ? 64 : this.buf.length;
    while (cap < need) cap *= 2;
    const next = Buffer.allocUnsafe(cap);
    this.buf.copy(next, 0, 0, this.len);
    this.buf = next;
  }

  u8(v: number): void {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
  }

  i8(v: number): void {
    this.u8(v);
  }

  u16le(v: number): void {
    this.ensure(2);
    this.buf.writeUInt16LE(v & 0xffff, this.len);
    this.len += 2;
  }

  i16le(v: number): void {
    this.ensure(2);
    this.buf.writeInt16LE(v | 0, this.len);
    this.len += 2;
  }

  u32le(v: number): void {
    this.ensure(4);
    this.buf.writeUInt32LE(v >>> 0, this.len);
    this.len += 4;
  }

  i32le(v: number): void {
    this.ensure(4);
    this.buf.writeInt32LE(v | 0, this.len);
    this.len += 4;
  }

  i64le(v: bigint): void {
    this.ensure(8);
    this.buf.writeBigInt64LE(v, this.len);
    this.len += 8;
  }

  f32le(v: number): void {
    this.ensure(4);
    this.buf.writeFloatLE(v, this.len);
    this.len += 4;
  }

  f64le(v: number): void {
    this.ensure(8);
    this.buf.writeDoubleLE(v, this.len);
    this.len += 8;
  }

  raw(data: Uint8Array): void {
    this.ensure(data.length);
    this.buf.set(data, this.len);
    this.len += data.length;
  }

  /** Bedrock string: u16 LE byte length + UTF-8 bytes. */
  str(s: string): void {
    const bytes = Buffer.from(s, "utf8");
    this.u16le(bytes.length);
    this.raw(bytes);
  }

  get length(): number {
    return this.len;
  }

  toBuffer(): Buffer {
    return Buffer.from(this.buf.subarray(0, this.len));
  }
}

/**
 * The block-state data version Bedrock uses to migrate block states.
 * 18163713 is the older of the two values the reference implementation writes,
 * which means the game only ever has to migrate *forward* from a known state.
 */
export const BLOCK_STATE_VERSION = 18163713;

/**
 * Writes one subchunk palette entry:
 * `{ name: string, states: compound, version: int }` as a named root compound
 * with an empty name (that is what Bedrock itself stores).
 */
export function writeBlockPaletteEntry(
  w: ByteWriter,
  name: string,
  states: Readonly<Record<string, string | number | boolean>> | undefined,
  version = BLOCK_STATE_VERSION,
): void {
  w.u8(TAG.Compound);
  w.str(""); // root name is always empty for palette entries

  w.u8(TAG.String);
  w.str("name");
  w.str(name);

  w.u8(TAG.Compound);
  w.str("states");
  if (states) {
    for (const key of Object.keys(states)) {
      const value = states[key]!;
      if (typeof value === "boolean") {
        w.u8(TAG.Byte);
        w.str(key);
        w.u8(value ? 1 : 0);
      } else if (typeof value === "number") {
        w.u8(TAG.Int);
        w.str(key);
        w.i32le(value);
      } else {
        w.u8(TAG.String);
        w.str(key);
        w.str(value);
      }
    }
  }
  w.u8(TAG.End); // end of states

  w.u8(TAG.Int);
  w.str("version");
  w.i32le(version);

  w.u8(TAG.End); // end of root compound
}
