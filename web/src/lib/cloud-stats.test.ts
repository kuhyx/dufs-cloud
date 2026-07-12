import { describe, it, expect } from "vitest";
import {
  availableExtensions,
  durationValues,
  groupByFolder,
  sizeValues,
} from "./cloud-stats.ts";
import type { DirEntry, MetaIndex } from "../api/types.ts";

function file(path: string, size = 0): DirEntry {
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    kind: "file",
    size,
    mtimeMs: 0,
  };
}
function dir(path: string): DirEntry {
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    kind: "dir",
    size: 0,
    mtimeMs: 0,
  };
}

describe("availableExtensions", () => {
  it("returns distinct sorted file extensions and ignores dirs/extensionless", () => {
    const entries = [
      file("/a.JPG"),
      file("/b.mp4"),
      file("/c.jpg"),
      file("/README"),
      dir("/Media"),
    ];
    expect(availableExtensions(entries)).toEqual(["jpg", "mp4"]);
  });

  it("is empty when there are no files with extensions", () => {
    expect(availableExtensions([dir("/Media"), file("/LICENSE")])).toEqual([]);
  });
});

describe("sizeValues", () => {
  it("returns ascending file sizes, skipping directories", () => {
    const entries = [dir("/Media"), file("/a", 10), file("/b", 500), file("/c", 3)];
    expect(sizeValues(entries)).toEqual([3, 10, 500]);
  });

  it("returns an empty array when there are no files", () => {
    expect(sizeValues([dir("/Media")])).toEqual([]);
  });
});

describe("durationValues", () => {
  const meta: MetaIndex = {
    "/a.mp4": { width: null, height: null, durationMs: 5000, createdMs: null, uploadedMs: null },
    "/b.mp4": { width: null, height: null, durationMs: 92000, createdMs: null, uploadedMs: null },
    "/c.mp4": { width: null, height: null, durationMs: 30000, createdMs: null, uploadedMs: null },
  };
  it("returns ascending known durations, skipping unindexed entries", () => {
    const entries = [file("/a.mp4"), file("/b.mp4"), file("/c.mp4"), file("/x.mp4")];
    expect(durationValues(entries, meta)).toEqual([5000, 30000, 92000]);
  });
  it("returns an empty array when no entry has a duration", () => {
    expect(durationValues([file("/x.mp4")], meta)).toEqual([]);
  });
});

describe("groupByFolder", () => {
  it("groups entries by folder, folders sorted by path", () => {
    const groups = groupByFolder([
      file("/Media/2026/b.jpg"),
      file("/Docs/a.pdf"),
      file("/Media/2026/a.jpg"),
    ]);
    expect(groups.map((g) => g.folder)).toEqual(["/Docs", "/Media/2026"]);
    expect(groups.map((g) => g.entries.map((e) => e.name))).toEqual([
      ["a.pdf"],
      ["b.jpg", "a.jpg"],
    ]);
  });

  it("returns an empty array for no entries", () => {
    expect(groupByFolder([])).toEqual([]);
  });
});
