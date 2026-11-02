import { vi } from "vitest";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";

export function entry(name: string, kind: "dir" | "file"): DirEntry {
  return { name, path: `/${name}`, kind, size: 10, mtimeMs: 0 };
}
export function fileAt(path: string): DirEntry {
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    kind: "file",
    size: 10,
    mtimeMs: 0,
  };
}

// Path-aware default listing: the root holds a Media folder + three files; any
// deeper folder holds three files and NO subfolder, so a recursive index walk
// terminates instead of looping on a path-blind mock.
export function makeClient(overrides: Partial<DufsClient> = {}): DufsClient {
  return {
    list: vi.fn((p: string) =>
      Promise.resolve(
        p === "/"
          ? [
              entry("Media", "dir"),
              entry("pic.jpg", "file"),
              entry("clip.mp4", "file"),
              entry("notes.txt", "file"),
            ]
          : [
              fileAt(`${p}/pic.jpg`),
              fileAt(`${p}/clip.mp4`),
              fileAt(`${p}/notes.txt`),
            ],
      ),
    ),
    fileUrl: (p: string) => p,
    thumbUrl: (p: string) => `/.thumbs${p}.jpg`,
    upload: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    readText: vi.fn(() => Promise.resolve("hello world")),
    writeText: vi.fn(() => Promise.resolve()),
    zipUrl: (p: string) => `${p}?zip`,
    createDir: vi.fn(() => Promise.resolve()),
    move: vi.fn(() => Promise.resolve()),
    rename: vi.fn(() => Promise.resolve()),
    fetchMeta: vi.fn(() => Promise.resolve({})),
    fetchSubtitleManifest: vi.fn(() => Promise.resolve(null)),
    downloadBytes: vi.fn(() => Promise.resolve(new Uint8Array())),
    ...overrides,
  };
}
