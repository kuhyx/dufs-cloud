import { describe, it, expect } from "vitest";
import {
  applyFilterSort,
  categoryOf,
  DEFAULT_FILTER,
  DEFAULT_SORT,
  fuzzyMatch,
  isFilterActive,
  type FilterState,
  type SortState,
} from "./filter-sort.ts";
import type { DirEntry, MetaIndex } from "../api/types.ts";

const dir = (name: string): DirEntry => ({
  name,
  path: `/${name}`,
  kind: "dir",
  size: 0,
  mtimeMs: 0,
});
const file = (name: string, size = 0, mtimeMs = 0): DirEntry => ({
  name,
  path: `/${name}`,
  kind: "file",
  size,
  mtimeMs,
});

const names = (es: readonly DirEntry[]): string[] => es.map((e) => e.name);

const filter = (over: Partial<FilterState> = {}): FilterState => ({
  ...DEFAULT_FILTER,
  ...over,
});
const sort = (over: Partial<SortState> = {}): SortState => ({
  ...DEFAULT_SORT,
  ...over,
});

describe("fuzzyMatch", () => {
  it("empty query matches; subsequence matches; gaps fail", () => {
    expect(fuzzyMatch("", "anything")).toBe(true);
    expect(fuzzyMatch("pic", "my-picture.jpg")).toBe(true);
    expect(fuzzyMatch("PIC", "picture")).toBe(true);
    expect(fuzzyMatch("zzz", "picture")).toBe(false);
  });
});

describe("categoryOf", () => {
  it("classifies all categories", () => {
    expect(categoryOf(dir("d"))).toBe("folder");
    expect(categoryOf(file("a.jpg"))).toBe("image");
    expect(categoryOf(file("a.mp4"))).toBe("video");
    expect(categoryOf(file("a.mp3"))).toBe("audio");
    expect(categoryOf(file("a.pdf"))).toBe("pdf");
    expect(categoryOf(file("a.md"))).toBe("text");
    expect(categoryOf(file("a.bin"))).toBe("other");
  });
});

describe("isFilterActive", () => {
  it("false for default, true for each field", () => {
    expect(isFilterActive(DEFAULT_FILTER)).toBe(false);
    expect(isFilterActive(filter({ query: "x" }))).toBe(true);
    expect(isFilterActive(filter({ type: "image" }))).toBe(true);
    expect(isFilterActive(filter({ extIncludes: ["jpg"] }))).toBe(true);
    expect(isFilterActive(filter({ extExcludes: ["jpg"] }))).toBe(true);
    expect(isFilterActive(filter({ minSize: 1 }))).toBe(true);
    expect(isFilterActive(filter({ maxSize: 1 }))).toBe(true);
    expect(isFilterActive(filter({ minDurationMs: 1 }))).toBe(true);
    expect(isFilterActive(filter({ maxDurationMs: 1 }))).toBe(true);
    expect(isFilterActive(filter({ minPixels: 1 }))).toBe(true);
    expect(isFilterActive(filter({ maxPixels: 1 }))).toBe(true);
  });
});

describe("applyFilterSort — filtering", () => {
  const meta: MetaIndex = {
    "/short.mp4": {
      width: 1920,
      height: 1080,
      durationMs: 5000,
      createdMs: 100,
      uploadedMs: 200,
    },
    "/long.mp4": {
      width: 1280,
      height: 720,
      durationMs: 60000,
      createdMs: 50,
      uploadedMs: 400,
    },
  };
  const entries = [
    dir("Album"),
    file("photo.jpg", 2000, 30),
    file("short.mp4", 500, 10),
    file("long.mp4", 9000, 20),
    file("notes.txt", 10, 5),
  ];

  it("type filter keeps only that category (folders excluded)", () => {
    const out = applyFilterSort(entries, meta, filter({ type: "image" }), sort());
    expect(names(out)).toEqual(["photo.jpg"]);
  });

  it("folder type keeps only folders", () => {
    const out = applyFilterSort(entries, meta, filter({ type: "folder" }), sort());
    expect(names(out)).toEqual(["Album"]);
  });

  it("include-extension filter keeps matching files (folders pass through)", () => {
    const out = applyFilterSort(
      entries,
      meta,
      filter({ extIncludes: ["mp4"] }),
      sort(),
    );
    expect(names(out)).toEqual(["Album", "long.mp4", "short.mp4"]);
  });

  it("include multiple extensions (webp + png style)", () => {
    const out = applyFilterSort(
      entries,
      meta,
      filter({ extIncludes: ["jpg", "txt"] }),
      sort(),
    );
    expect(names(out)).toEqual(["Album", "notes.txt", "photo.jpg"]);
  });

  it("exclude-extension filter drops matching files, keeps extensionless", () => {
    const out = applyFilterSort(
      [...entries, file("README", 1, 1)],
      meta,
      filter({ extExcludes: ["mp4"] }),
      sort(),
    );
    // mp4 files dropped; README (no extension) counts as "not mp4".
    // (name sort is case-insensitive, so README trails photo.jpg.)
    expect(names(out)).toEqual(["Album", "notes.txt", "photo.jpg", "README"]);
  });

  it("size range excludes files outside the bounds", () => {
    const out = applyFilterSort(
      entries,
      meta,
      filter({ minSize: 1000, maxSize: 5000 }),
      sort(),
    );
    expect(names(out)).toEqual(["Album", "photo.jpg"]);
  });

  it("duration range needs the index; unknown durations are excluded", () => {
    const out = applyFilterSort(
      entries,
      meta,
      filter({ minDurationMs: 10000 }),
      sort(),
    );
    expect(names(out)).toEqual(["Album", "long.mp4"]);
    const capped = applyFilterSort(
      entries,
      meta,
      filter({ maxDurationMs: 10000 }),
      sort(),
    );
    expect(names(capped)).toEqual(["Album", "short.mp4"]);
  });

  it("resolution range needs the index; unknown dimensions are excluded", () => {
    // short.mp4 = 1920×1080 (2.07 MP), long.mp4 = 1280×720 (0.92 MP).
    const hi = applyFilterSort(
      entries,
      meta,
      filter({ minPixels: 1_000_000 }),
      sort(),
    );
    expect(names(hi)).toEqual(["Album", "short.mp4"]);
    const lo = applyFilterSort(
      entries,
      meta,
      filter({ maxPixels: 1_000_000 }),
      sort(),
    );
    expect(names(lo)).toEqual(["Album", "long.mp4"]);
  });

  it("fuzzy query narrows folders and files", () => {
    const out = applyFilterSort(entries, meta, filter({ query: "no" }), sort());
    expect(names(out)).toEqual(["notes.txt"]);
  });
});

describe("applyFilterSort — sorting", () => {
  const meta: MetaIndex = {
    "/a.mp4": {
      width: 100,
      height: 100,
      durationMs: 3000,
      createdMs: 300,
      uploadedMs: 10,
    },
    "/b.mp4": {
      width: 200,
      height: 100,
      durationMs: 1000,
      createdMs: 100,
      uploadedMs: 20,
    },
  };
  const entries = [
    file("b.mp4", 20, 200),
    dir("Zed"),
    file("a.mp4", 10, 100),
    dir("Alpha"),
    file("c.txt", 30, 300),
  ];

  it("dirs first, then name asc/desc", () => {
    expect(names(applyFilterSort(entries, meta, DEFAULT_FILTER, sort()))).toEqual(
      ["Alpha", "Zed", "a.mp4", "b.mp4", "c.txt"],
    );
    const desc = applyFilterSort(
      entries,
      meta,
      DEFAULT_FILTER,
      sort({ dir: "desc" }),
    );
    expect(names(desc)).toEqual(["Zed", "Alpha", "c.txt", "b.mp4", "a.mp4"]);
  });

  it("sorts by size, modified, created, uploaded, duration", () => {
    const bySize = applyFilterSort(entries, meta, DEFAULT_FILTER, sort({ key: "size" }));
    expect(names(bySize).slice(2)).toEqual(["a.mp4", "b.mp4", "c.txt"]);
    const byMod = applyFilterSort(entries, meta, DEFAULT_FILTER, sort({ key: "modified" }));
    expect(names(byMod).slice(2)).toEqual(["a.mp4", "b.mp4", "c.txt"]);
    const byCreated = applyFilterSort(entries, meta, DEFAULT_FILTER, sort({ key: "created" }));
    expect(names(byCreated).slice(2)).toEqual(["c.txt", "b.mp4", "a.mp4"]);
    const byUploaded = applyFilterSort(entries, meta, DEFAULT_FILTER, sort({ key: "uploaded" }));
    expect(names(byUploaded).slice(2)).toEqual(["c.txt", "a.mp4", "b.mp4"]);
    const byDur = applyFilterSort(entries, meta, DEFAULT_FILTER, sort({ key: "duration" }));
    expect(names(byDur).slice(2)).toEqual(["c.txt", "b.mp4", "a.mp4"]);
    // a=100×100 (10k px), b=200×100 (20k px), c has no dimensions (0).
    const byRes = applyFilterSort(entries, meta, DEFAULT_FILTER, sort({ key: "resolution" }));
    expect(names(byRes).slice(2)).toEqual(["c.txt", "a.mp4", "b.mp4"]);
  });

  it("sorts by extension and type", () => {
    const byExt = applyFilterSort(entries, meta, DEFAULT_FILTER, sort({ key: "extension" }));
    expect(names(byExt).slice(2)).toEqual(["a.mp4", "b.mp4", "c.txt"]);
    const byType = applyFilterSort(entries, meta, DEFAULT_FILTER, sort({ key: "type" }));
    // files: videos (a,b) before text (c)
    expect(names(byType).slice(2)).toEqual(["a.mp4", "b.mp4", "c.txt"]);
  });
});
