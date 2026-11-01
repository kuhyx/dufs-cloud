import { describe, it, expect } from "vitest";
import { parsePropfind, sortEntries } from "./propfind.ts";
import type { DirEntry } from "./types.ts";
import { PROPFIND_XML } from "../test/propfind-fixture.ts";

describe("parsePropfind", () => {
  it("parses entries, skips self, decodes names, reads size/mtime", () => {
    const entries = parsePropfind(PROPFIND_XML, "/Media/2026/07");
    // self ("/Media/2026/07/") and the empty-href entry are dropped
    expect(entries.map((e) => e.name)).toEqual(["sub", "a b.jpg"]);
    const file = entries.find((e) => e.name === "a b.jpg");
    expect(file?.kind).toBe("file");
    expect(file?.size).toBe(2048);
    expect(file?.mtimeMs).toBeGreaterThan(0);
    expect(entries.find((e) => e.name === "sub")?.kind).toBe("dir");
  });
  it("handles missing size/mtime as zero", () => {
    const xml = `<D:multistatus xmlns:D="DAV:"><D:response><D:href>/x.bin</D:href><D:propstat><D:prop><D:resourcetype/></D:prop></D:propstat></D:response></D:multistatus>`;
    const [entry] = parsePropfind(xml, "/");
    expect(entry?.size).toBe(0);
    expect(entry?.mtimeMs).toBe(0);
  });
  it("coerces an unparsable size/mtime to zero", () => {
    const xml = `<D:multistatus xmlns:D="DAV:"><D:response><D:href>/y.bin</D:href><D:propstat><D:prop><D:resourcetype/><D:getcontentlength>not-a-number</D:getcontentlength><D:getlastmodified>never</D:getlastmodified></D:prop></D:propstat></D:response></D:multistatus>`;
    const [entry] = parsePropfind(xml, "/");
    expect(entry?.size).toBe(0);
    expect(entry?.mtimeMs).toBe(0);
  });
});

describe("sortEntries", () => {
  it("dirs first then case-insensitive name", () => {
    const mk = (name: string, kind: "dir" | "file"): DirEntry => ({
      name,
      path: `/${name}`,
      kind,
      size: 0,
      mtimeMs: 0,
    });
    const sorted = sortEntries([
      mk("banana.jpg", "file"),
      mk("Apple", "dir"),
      mk("apple.png", "file"),
      mk("Zeta", "dir"),
    ]);
    expect(sorted.map((e) => e.name)).toEqual([
      "Apple",
      "Zeta",
      "apple.png",
      "banana.jpg",
    ]);
  });
});
