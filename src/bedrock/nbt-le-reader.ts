/**
 * Minimal little-endian NBT reader (Bedrock flavour), the inverse of the writer
 * in `nbt-le.ts`.
 *
 * This exists for one job: decoding the block palette of a *foreign* Bedrock
 * world fast enough to transplant it. prismarine-nbt can parse the same bytes,
 * but it is a protodef-based generic decoder and reading a few hundred thousand
 * palette entries through it costs minutes; this walks the tag tree directly in
 * microseconds per entry.
 *
 * Bedrock NBT stores multi-byte integers and string lengths little-endian, and
 * a string is a u16 LE byte length followed by UTF-8 bytes.
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
  LongArray: 0x0c,
} as const;

export class NbtLeReader {
  pos = 0;
  constructor(private readonly buf: Buffer) {}

  u8(): number {
    return this.buf[this.pos++]!;
  }
  i8(): number {
    return (this.buf[this.pos++]! << 24) >> 24;
  }
  u16(): number {
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  i16(): number {
    const v = this.buf.readInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  i32(): number {
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  i64(): bigint {
    const v = this.buf.readBigInt64LE(this.pos);
    this.pos += 8;
    return v;
  }
  f32(): number {
    const v = this.buf.readFloatLE(this.pos);
    this.pos += 4;
    return v;
  }
  f64(): number {
    const v = this.buf.readDoubleLE(this.pos);
    this.pos += 8;
    return v;
  }
  str(): string {
    const length = this.u16();
    const s = this.buf.toString("utf8", this.pos, this.pos + length);
    this.pos += length;
    return s;
  }

  /** One payload of the given tag type, with no name. */
  payload(type: number): unknown {
    switch (type) {
      case TAG.Byte:
        return this.i8();
      case TAG.Short:
        return this.i16();
      case TAG.Int:
        return this.i32();
      case TAG.Long:
        return this.i64();
      case TAG.Float:
        return this.f32();
      case TAG.Double:
        return this.f64();
      case TAG.ByteArray: {
        const length = this.i32();
        const out = this.buf.subarray(this.pos, this.pos + length);
        this.pos += length;
        return out;
      }
      case TAG.String:
        return this.str();
      case TAG.List: {
        const elementType = this.u8();
        const length = this.i32();
        const out: unknown[] = [];
        for (let i = 0; i < length; i++) out.push(this.payload(elementType));
        return out;
      }
      case TAG.Compound:
        return this.compound();
      case TAG.IntArray: {
        const length = this.i32();
        const out: number[] = [];
        for (let i = 0; i < length; i++) out.push(this.i32());
        return out;
      }
      case TAG.LongArray: {
        const length = this.i32();
        const out: bigint[] = [];
        for (let i = 0; i < length; i++) out.push(this.i64());
        return out;
      }
      default:
        throw new Error(`nbt-le-reader: unknown tag type ${type} at offset ${this.pos - 1}`);
    }
  }

  /** A compound: named tags until the End tag. */
  compound(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (;;) {
      const type = this.u8();
      if (type === TAG.End) return out;
      const name = this.str();
      out[name] = this.payload(type);
    }
  }

  /** The named root tag every palette entry starts with. */
  namedTag(): { name: string; value: unknown } {
    const type = this.u8();
    const name = this.str();
    return { name, value: this.payload(type) };
  }
}
