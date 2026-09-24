/**
 * Minimal ZIP writer (store + deflate). A `.mcworld` is just a ZIP archive that
 * contains `level.dat`, `levelname.txt`, `world_icon.jpeg` and the `db/` LevelDB
 * directory, so packaging one is only a matter of assembling those entries.
 *
 * Implemented locally instead of pulling in a dependency, because the only
 * archive features needed here are "add file" and "finish".
 */

import { deflateRawSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipRecord {
  name: Buffer;
  crc: number;
  method: number;
  compressed: Buffer;
  uncompressedSize: number;
  offset: number;
}

/** MS-DOS date/time encoding; a fixed timestamp keeps builds reproducible. */
function dosDateTime(date = new Date(2026, 0, 1, 0, 0, 0)): { time: number; date: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const day = ((date.getFullYear() - 1980) & 0x7f) << 9 | ((date.getMonth() + 1) & 0x0f) << 5 | (date.getDate() & 0x1f);
  return { time, date: day };
}

export class ZipWriter {
  private records: ZipRecord[] = [];
  private chunks: Buffer[] = [];
  private offset = 0;
  private readonly stamp = dosDateTime();

  addFile(name: string, data: Buffer): void {
    const uncompressedSize = data.length;
    const crc = crc32(data);
    let method = 0;
    let compressed = data;
    if (data.length > 256) {
      const deflated = deflateRawSync(data, { level: 9 });
      if (deflated.length < data.length) {
        method = 8;
        compressed = deflated;
      }
    }
    const nameBuf = Buffer.from(name, "utf8");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(this.stamp.time, 10);
    header.writeUInt16LE(this.stamp.date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(uncompressedSize, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);

    this.records.push({ name: nameBuf, crc, method, compressed, uncompressedSize, offset: this.offset });
    this.chunks.push(header, nameBuf, compressed);
    this.offset += header.length + nameBuf.length + compressed.length;
  }

  finish(): Buffer {
    const centralStart = this.offset;
    const central: Buffer[] = [];
    let centralSize = 0;
    for (const record of this.records) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(20, 4); // version made by
      header.writeUInt16LE(20, 6); // version needed
      header.writeUInt16LE(0, 8); // flags
      header.writeUInt16LE(record.method, 10);
      header.writeUInt16LE(this.stamp.time, 12);
      header.writeUInt16LE(this.stamp.date, 14);
      header.writeUInt32LE(record.crc, 16);
      header.writeUInt32LE(record.compressed.length, 20);
      header.writeUInt32LE(record.uncompressedSize, 24);
      header.writeUInt16LE(record.name.length, 28);
      header.writeUInt16LE(0, 30); // extra
      header.writeUInt16LE(0, 32); // comment
      header.writeUInt16LE(0, 34); // disk
      header.writeUInt16LE(0, 36); // internal attrs
      header.writeUInt32LE(0, 38); // external attrs
      header.writeUInt32LE(record.offset, 42);
      central.push(header, record.name);
      centralSize += header.length + record.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(this.records.length, 8);
    end.writeUInt16LE(this.records.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(centralStart, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...this.chunks, ...central, end]);
  }
}
