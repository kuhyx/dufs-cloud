import { describe, it, expect } from "vitest";
import { crc32, zipStore } from "./zip.ts";

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("crc32", () => {
  it("matches known IEEE CRC-32 values", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(bytes("hello"))).toBe(0x3610a686);
  });
});

describe("zipStore", () => {
  it("empty archive is just an end-of-central-directory record", () => {
    const zip = zipStore([]);
    expect(zip.length).toBe(22);
    const dv = new DataView(zip.buffer);
    expect(dv.getUint32(0, true)).toBe(0x06054b50);
    expect(dv.getUint16(8, true)).toBe(0); // 0 entries
  });

  it("writes local headers, central directory and EOCD", () => {
    const zip = zipStore([
      { name: "a.txt", data: bytes("hello") },
      { name: "b.bin", data: new Uint8Array([1, 2, 3]) },
    ]);
    const dv = new DataView(zip.buffer);
    // First local file header.
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    // EOCD at the end declares 2 entries.
    const eocd = zip.length - 22;
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
    expect(dv.getUint16(eocd + 8, true)).toBe(2);
    expect(dv.getUint16(eocd + 10, true)).toBe(2);
    // A central-directory header exists (signature appears in the file).
    const cdOffset = dv.getUint32(eocd + 16, true);
    expect(dv.getUint32(cdOffset, true)).toBe(0x02014b50);
    // The stored CRC of "hello" matches crc32().
    expect(dv.getUint32(14, true)).toBe(crc32(bytes("hello")));
    // File names are present in the bytes.
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("a.txt");
    expect(text).toContain("b.bin");
  });
});
