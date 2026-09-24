import { describe, expect, test } from "bun:test";
import { inflateRawSync } from "node:zlib";
import { crc32, ZipWriter } from "./zip.ts";

interface ReadEntry {
  name: string;
  method: number;
  crc: number;
  data: Buffer;
}

/** Independent reader: walks the central directory and inflates each entry. */
function readZip(zip: Buffer): ReadEntry[] {
  const eocdOffset = zip.length - 22;
  expect(zip.readUInt32LE(eocdOffset)).toBe(0x06054b50);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  let offset = zip.readUInt32LE(eocdOffset + 16);
  const entries: ReadEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
    const method = zip.readUInt16LE(offset + 10);
    const crc = zip.readUInt32LE(offset + 16);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);

    expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = zip.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);

    entries.push({ name, method, crc, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe("zip writer", () => {
  test("crc32 matches the known value for a fixed string", () => {
    expect(crc32(Buffer.from("123456789", "utf8"))).toBe(0xcbf43926);
  });

  test("packs multiple entries that a reader can extract", () => {
    const zip = new ZipWriter();
    const levelDat = Buffer.alloc(512, 7); // > 256 bytes so it gets deflated
    zip.addFile("level.dat", levelDat);
    zip.addFile("levelname.txt", Buffer.from("Underworld", "utf8"));
    zip.addFile("db/CURRENT", Buffer.from("MANIFEST-000002\n", "utf8"));
    const archive = zip.finish();

    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    const entries = readZip(archive);
    expect(entries.map((entry) => entry.name)).toEqual(["level.dat", "levelname.txt", "db/CURRENT"]);
    for (const entry of entries) {
      expect(crc32(entry.data)).toBe(entry.crc);
    }
    expect(entries[0]!.data.equals(levelDat)).toBe(true);
    expect(entries[0]!.method).toBe(8); // deflated
    expect(entries[1]!.data.toString("utf8")).toBe("Underworld");
    expect(entries[2]!.method).toBe(0); // stored (too small to bother deflating)
  });
});
