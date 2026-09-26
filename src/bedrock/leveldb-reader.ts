/**
 * Minimal LevelDB reader for reading *foreign* Bedrock world databases.
 *
 * Why this exists: the repo writes its own world with `classic-level`, which is
 * also how the inspector reads it back. But a real Minecraft Bedrock export
 * stores its `.ldb` tables with a compression code `classic-level`'s build does
 * not recognise, so opening such a database through it fails with
 * `Corruption: bad block type`. A transplant has to read the source world's
 * blocks, so this module decodes the table format directly:
 *
 *   - footer (last 48 bytes): metaindex handle, index handle, padding, magic
 *     `0xdb4775248b80fb57`; a handle is `varint offset, varint size`
 *   - the index block holds one entry per data block, each value a block handle
 *   - a block is a run of prefix-compressed key/value entries:
 *     `shared varint, nonShared varint, valueLen varint, keySuffix, value`,
 *     followed by `numRestarts u32` and the restart offsets
 *   - every block ends with a 5 byte trailer: a compression byte and a
 *     crc32c of the block contents
 *
 * Compression bytes seen in practice: 0 = stored, 1 = snappy (not handled -
 * Bedrock does not emit it), 2 = zlib, 4 = **raw deflate** (what Bedrock
 * actually writes; `classic-level` reports this as "bad block type").
 *
 * Only the data needed to transplant blocks is exposed: the whole key/value
 * space, with later (higher-numbered) tables taking precedence over earlier
 * ones, which is the order LevelDB compacts in.
 */

import { readdirSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { join } from "node:path";

/** LevelDB table magic, little-endian. */
const TABLE_MAGIC = 0xdb4775248b80fb57n;
/** Fixed footer size: 2 handles + padding + 8 byte magic. */
const FOOTER_SIZE = 48;
/** Per-block trailer size: 1 compression byte + 4 crc32c bytes. */
const BLOCK_TRAILER_SIZE = 5;

interface BlockHandle {
  offset: number;
  size: number;
}

interface Entry {
  key: Buffer;
  value: Buffer;
  /** The write's sequence number (newer wins), decoded from the internal key. */
  sequence: number;
  /** LevelDB value type: 1 = live value (`kTypeValue`), 0 = deletion tombstone. */
  valueType: number;
}

class BufferReader {
  pos = 0;
  constructor(private readonly buf: Buffer) {}

  varint(): number {
    let result = 0;
    let shift = 0;
    for (let i = 0; i < 10; i++) {
      const byte = this.buf[this.pos++]!;
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
    }
    throw new Error("leveldb: varint is longer than 10 bytes");
  }

  slice(length: number): Buffer {
    const out = this.buf.subarray(this.pos, this.pos + length);
    this.pos += length;
    return out;
  }
}

function readBlock(file: Buffer, handle: BlockHandle): Buffer {
  const raw = file.subarray(handle.offset, handle.offset + handle.size);
  const compression = file[handle.offset + handle.size]!;
  // Bedrock's LevelDB fork labels raw deflate as 4 (and zlib as 2).
  if (compression === 0) return raw;
  if (compression === 2 || compression === 4) return inflateRawSync(raw);
  throw new Error(
    `leveldb: unsupported block compression ${compression} at offset ${handle.offset}`,
  );
}

/**
 * Decode a LevelDB block into internal keys. An internal key is the user key
 * followed by 8 bytes of `(sequence << 8) | valueType`; the user key is what
 * actually identifies a chunk record, so the last 8 bytes are stripped here.
 */
function parseBlockEntries(block: Buffer): Entry[] {
  if (block.length < 4) return [];
  const numRestarts = block.readUInt32LE(block.length - 4);
  const dataEnd = block.length - 4 - numRestarts * 4;
  if (dataEnd <= 0) return [];
  const reader = new BufferReader(block.subarray(0, dataEnd));
  const out: Entry[] = [];
  let key = Buffer.alloc(0);
  while (reader.pos < dataEnd) {
    const shared = reader.varint();
    const nonShared = reader.varint();
    const valueLen = reader.varint();
    const suffix = reader.slice(nonShared);
    key = Buffer.concat([key.subarray(0, shared), suffix]);
    const value = Buffer.from(reader.slice(valueLen));
    if (key.length < 8) continue;
    const packed = key.readBigUInt64LE(key.length - 8);
    const valueType = Number(packed & 0xffn);
    out.push({ key: Buffer.from(key.subarray(0, key.length - 8)), value, sequence: Number(packed >> 8n), valueType });
  }
  return out;
}

/** Read every live key/value pair out of one `.ldb` table file. */
export function readTable(path: string): Entry[] {
  const file = readFileSync(path);
  if (file.length < FOOTER_SIZE || file.readBigUInt64LE(file.length - 8) !== TABLE_MAGIC) {
    throw new Error(`leveldb: ${path} is not a LevelDB table`);
  }
  const footer = new BufferReader(file.subarray(file.length - FOOTER_SIZE, file.length - 8));
  footer.varint(); // metaindex offset
  footer.varint(); // metaindex size
  const index: BlockHandle = { offset: footer.varint(), size: footer.varint() };

  const out: Entry[] = [];
  for (const entry of parseBlockEntries(readBlock(file, index))) {
    const handle = new BufferReader(entry.value);
    const data: BlockHandle = { offset: handle.varint(), size: handle.varint() };
    for (const entry of parseBlockEntries(readBlock(file, data))) out.push(entry);
  }
  return out;
}

/**
 * Read a whole LevelDB directory. Files are visited in name order, which is the
 * order LevelDB numbers them (and therefore the order their writes win), so a
 * key that appears in several tables ends up holding the newest value.
 */
export function readLevelDbDirectory(dir: string): Map<string, Buffer> {
  const tables = readdirSync(dir)
    .filter((name) => name.endsWith(".ldb"))
    .sort();
  const out = new Map<string, Buffer>();
  const sequences = new Map<string, number>();
  for (const table of tables) {
    for (const { key, value, sequence, valueType } of readTable(join(dir, table))) {
      const id = key.toString("hex");
      const seen = sequences.get(id);
      if (seen !== undefined && seen >= sequence) continue;
      sequences.set(id, sequence);
      if (valueType === 0) out.delete(id);
      else out.set(id, value);
    }
  }
  return out;
}

/** Decode a Bedrock chunk key into its coordinates, dimension and record tag. */
export function decodeChunkKey(
  key: Buffer,
): { cx: number; cz: number; dimension: number; tag: number; subChunkIndex?: number } | undefined {
  if (key.length !== 9 && key.length !== 10 && key.length !== 13 && key.length !== 14) return undefined;
  const cx = key.readInt32LE(0);
  const cz = key.readInt32LE(4);
  let offset = 8;
  let dimension = 0;
  if (key.length === 13 || key.length === 14) {
    dimension = key.readInt32LE(8);
    offset = 12;
  }
  return {
    cx,
    cz,
    dimension,
    tag: key.readUInt8(offset),
    subChunkIndex: key.length === offset + 2 ? key.readInt8(offset + 1) : undefined,
  };
}
