import { vi } from "vitest";
import { render } from "@testing-library/react";
import { Grid } from "../components/grid.tsx";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";

export function entry(name: string, kind: "dir" | "file"): DirEntry {
  return { name, path: `/${name}`, kind, size: 42, mtimeMs: 0 };
}

export function makeClient(): DufsClient {
  return {
    list: vi.fn(),
    fileUrl: (p: string) => p,
    thumbUrl: (p: string) => `/.thumbs${p}.jpg`,
    upload: vi.fn(),
    remove: vi.fn(),
    readText: vi.fn(),
    writeText: vi.fn(),
    zipUrl: (p: string) => `${p}?zip`,
    createDir: vi.fn(),
    move: vi.fn(),
    rename: vi.fn(),
    fetchMeta: vi.fn(() => Promise.resolve({})),
    fetchSubtitleManifest: vi.fn(() => Promise.resolve(null)),
    downloadBytes: vi.fn(() => Promise.resolve(new Uint8Array())),
  };
}

export const entries: DirEntry[] = [
  entry("Media", "dir"),
  entry("pic.jpg", "file"),
  entry("clip.mp4", "file"),
  entry("notes.txt", "file"),
  entry("data.bin", "file"),
  entry("doc.pdf", "file"),
  entry("song.mp3", "file"),
];

export function renderGrid(over: Partial<Parameters<typeof Grid>[0]> = {}) {
  const props = {
    client: makeClient(),
    entries,
    selected: new Set<string>(),
    onToggleSelect: vi.fn(),
    onOpenDir: vi.fn(),
    onOpenMedia: vi.fn(),
    onEditText: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    ...over,
  };
  render(<Grid {...props} />);
  return props;
}
