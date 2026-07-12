import { describe, it, expect } from "vitest";
import {
  basename,
  crumbs,
  encodePath,
  formatDuration,
  underPath,
  extname,
  humanSize,
  isImage,
  isText,
  isVideo,
  joinPath,
  normalize,
  parentPath,
} from "./paths.ts";

describe("extname", () => {
  it("returns lower-case extension without dot", () => {
    expect(extname("PIC.JPG")).toBe("jpg");
    expect(extname("a.tar.gz")).toBe("gz");
  });
  it("returns empty for no/edge extensions", () => {
    expect(extname("README")).toBe("");
    expect(extname(".hidden")).toBe("");
    expect(extname("trailing.")).toBe("");
  });
});

describe("type predicates", () => {
  it("classifies images, videos and text", () => {
    expect(isImage("a.png")).toBe(true);
    expect(isImage("a.mp4")).toBe(false);
    expect(isVideo("a.mkv")).toBe(true);
    expect(isVideo("a.png")).toBe(false);
    expect(isText("notes.md")).toBe(true);
    expect(isText("a.bin")).toBe(false);
  });
});

describe("normalize / join / parent / basename", () => {
  it("normalizes dots and slashes", () => {
    expect(normalize("/a//b/./c")).toBe("/a/b/c");
    expect(normalize("/a/b/../c")).toBe("/a/c");
    expect(normalize("")).toBe("/");
    expect(normalize("/")).toBe("/");
  });
  it("joins and finds parents / basenames", () => {
    expect(joinPath("/a/b", "c.jpg")).toBe("/a/b/c.jpg");
    expect(parentPath("/a/b/c.jpg")).toBe("/a/b");
    expect(parentPath("/")).toBe("/");
    expect(parentPath("/only")).toBe("/");
    expect(basename("/a/b/c.jpg")).toBe("c.jpg");
    expect(basename("/")).toBe("/");
  });
});

describe("encodePath", () => {
  it("encodes each segment", () => {
    expect(encodePath("/Media/2026/07/a b.jpg")).toBe("/Media/2026/07/a%20b.jpg");
    expect(encodePath("/")).toBe("/");
  });
});

describe("crumbs", () => {
  it("builds breadcrumb trail", () => {
    expect(crumbs("/")).toEqual([{ name: "cloud", path: "/" }]);
    expect(crumbs("/Media/2026")).toEqual([
      { name: "cloud", path: "/" },
      { name: "Media", path: "/Media" },
      { name: "2026", path: "/Media/2026" },
    ]);
  });
});

describe("underPath", () => {
  it("root contains everything", () => {
    expect(underPath("/Media/x.jpg", "/")).toBe(true);
  });
  it("matches the folder itself and its descendants", () => {
    expect(underPath("/Media/2026/07", "/Media/2026/07")).toBe(true);
    expect(underPath("/Media/2026/07/pic.jpg", "/Media/2026/07")).toBe(true);
  });
  it("does not let a prefix swallow a sibling with a longer name", () => {
    expect(underPath("/Media/0700/x.jpg", "/Media/07")).toBe(false);
    expect(underPath("/Other/x.jpg", "/Media")).toBe(false);
  });
});

describe("formatDuration", () => {
  it("splits ms into h/m/s and drops trailing zero units", () => {
    expect(formatDuration(5_073_000)).toBe("1h 24m 33s");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(0)).toBe("0s");
  });
});

describe("humanSize", () => {
  it("formats bytes across units", () => {
    expect(humanSize(512)).toBe("512 B");
    expect(humanSize(1536)).toBe("1.5 KB");
    expect(humanSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(humanSize(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
    expect(humanSize(2 * 1024 ** 4)).toBe("2.0 TB");
    expect(humanSize(50 * 1024)).toBe("50 KB");
  });
});
