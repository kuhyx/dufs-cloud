/** A minimal, dependency-free ZIP writer using the STORE method (no
 * compression). Cloud media (jpg/mp4/…) is already compressed, so storing adds
 * no size penalty and keeps the implementation small and fully testable. */

export interface ZipEntry {
  /** Path inside the archive, e.g. "Media/pic.jpg". */
  readonly name: string;
  readonly data: Uint8Array;
}

/** CRC-32 (IEEE) of a byte array, as an unsigned 32-bit integer. Uses the
 * table-free bit-wise form so there is no (type-forced) unreachable lookup
 * branch; media zips are small enough that the extra work is negligible. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    c >>>= 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Fixed DOS timestamp (1980-01-01) so archives are reproducible.
const DOS_TIME = 0;
const DOS_DATE = 0x21;
const UTF8_FLAG = 0x0800;

/** Build a STORE-method ZIP archive from `entries`. Pure. */
export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const files = entries.map((e) => ({
    nameBytes: encoder.encode(e.name),
    data: e.data,
    crc: crc32(e.data),
    offset: 0,
  }));

  let localSize = 0;
  let cdSize = 0;
  for (const f of files) {
    localSize += 30 + f.nameBytes.length + f.data.length;
    cdSize += 46 + f.nameBytes.length;
  }
  const out = new Uint8Array(localSize + cdSize + 22);
  const dv = new DataView(out.buffer);

  let offset = 0;
  for (const f of files) {
    f.offset = offset;
    dv.setUint32(offset, 0x04034b50, true);
    dv.setUint16(offset + 4, 20, true);
    dv.setUint16(offset + 6, UTF8_FLAG, true);
    dv.setUint16(offset + 8, 0, true);
    dv.setUint16(offset + 10, DOS_TIME, true);
    dv.setUint16(offset + 12, DOS_DATE, true);
    dv.setUint32(offset + 14, f.crc, true);
    dv.setUint32(offset + 18, f.data.length, true);
    dv.setUint32(offset + 22, f.data.length, true);
    dv.setUint16(offset + 26, f.nameBytes.length, true);
    dv.setUint16(offset + 28, 0, true);
    out.set(f.nameBytes, offset + 30);
    out.set(f.data, offset + 30 + f.nameBytes.length);
    offset += 30 + f.nameBytes.length + f.data.length;
  }

  const cdStart = offset;
  for (const f of files) {
    dv.setUint32(offset, 0x02014b50, true);
    dv.setUint16(offset + 4, 20, true);
    dv.setUint16(offset + 6, 20, true);
    dv.setUint16(offset + 8, UTF8_FLAG, true);
    dv.setUint16(offset + 10, 0, true);
    dv.setUint16(offset + 12, DOS_TIME, true);
    dv.setUint16(offset + 14, DOS_DATE, true);
    dv.setUint32(offset + 16, f.crc, true);
    dv.setUint32(offset + 20, f.data.length, true);
    dv.setUint32(offset + 24, f.data.length, true);
    dv.setUint16(offset + 28, f.nameBytes.length, true);
    dv.setUint16(offset + 30, 0, true);
    dv.setUint16(offset + 32, 0, true);
    dv.setUint16(offset + 34, 0, true);
    dv.setUint16(offset + 36, 0, true);
    dv.setUint32(offset + 38, 0, true);
    dv.setUint32(offset + 42, f.offset, true);
    out.set(f.nameBytes, offset + 46);
    offset += 46 + f.nameBytes.length;
  }

  dv.setUint32(offset, 0x06054b50, true);
  dv.setUint16(offset + 4, 0, true);
  dv.setUint16(offset + 6, 0, true);
  dv.setUint16(offset + 8, files.length, true);
  dv.setUint16(offset + 10, files.length, true);
  dv.setUint32(offset + 12, cdSize, true);
  dv.setUint32(offset + 16, cdStart, true);
  dv.setUint16(offset + 20, 0, true);
  return out;
}
