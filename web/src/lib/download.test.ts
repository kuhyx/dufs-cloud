import { describe, it, expect, vi, afterEach } from "vitest";
import { buildSelectionZip, saveBytes } from "./download.ts";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";

function file(path: string): DirEntry {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return { name, path, kind: "file", size: 3, mtimeMs: 0 };
}
function folder(path: string): DirEntry {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return { name, path, kind: "dir", size: 0, mtimeMs: 0 };
}

function makeClient(over: Partial<DufsClient> = {}): DufsClient {
  return {
    list: vi.fn(() => Promise.resolve([])),
    fileUrl: (p: string) => p,
    thumbUrl: (p: string) => p,
    zipUrl: (p: string) => `${p}?zip`,
    upload: vi.fn(),
    remove: vi.fn(),
    createDir: vi.fn(),
    move: vi.fn(),
    rename: vi.fn(),
    readText: vi.fn(),
    writeText: vi.fn(),
    fetchMeta: vi.fn(() => Promise.resolve({})),
    downloadBytes: vi.fn((p: string) =>
      Promise.resolve(new TextEncoder().encode(`data-for${p}`)),
    ),
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildSelectionZip", () => {
  it("packs selected root files as flat STORE entries", async () => {
    const client = makeClient();
    const zip = await buildSelectionZip(client, "/", [
      file("/a.txt"),
      file("/b.txt"),
    ]);
    // Local-file-header signature at the start of a valid zip.
    const dv = new DataView(zip.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    // End-of-central-directory records the two entries.
    expect(dv.getUint16(zip.length - 22 + 10, true)).toBe(2);
    // Flat names (relative to root): the first entry is "a.txt".
    const nameLen = dv.getUint16(26, true);
    const name = new TextDecoder().decode(zip.subarray(30, 30 + nameLen));
    expect(name).toBe("a.txt");
  });

  it("recurses into a folder and keeps paths relative to the base dir", async () => {
    // /Media contains forest.jpg and subfolder 2026 (which holds pic.jpg).
    const client = makeClient({
      list: vi.fn((p: string) => {
        if (p === "/Media") {
          return Promise.resolve([
            file("/Media/forest.jpg"),
            folder("/Media/2026"),
          ]);
        }
        return Promise.resolve([file("/Media/2026/pic.jpg")]);
      }),
    });
    const zip = await buildSelectionZip(client, "/", [folder("/Media")]);
    const names = new TextDecoder().decode(zip);
    expect(names).toContain("Media/forest.jpg");
    expect(names).toContain("Media/2026/pic.jpg");
    expect(client.downloadBytes).toHaveBeenCalledWith("/Media/2026/pic.jpg");
  });

  it("names entries relative to a non-root base directory", async () => {
    const client = makeClient();
    const zip = await buildSelectionZip(client, "/Media", [
      file("/Media/forest.jpg"),
    ]);
    const dv = new DataView(zip.buffer);
    const nameLen = dv.getUint16(26, true);
    const name = new TextDecoder().decode(zip.subarray(30, 30 + nameLen));
    expect(name).toBe("forest.jpg");
  });
});

describe("saveBytes", () => {
  it("creates an object URL and clicks a download anchor", () => {
    const anchor = document.createElement("a");
    const click = vi.spyOn(anchor, "click").mockImplementation(() => undefined);
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    saveBytes(new Uint8Array([1, 2, 3]), "cloud.zip");

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(anchor.download).toBe("cloud.zip");
    expect(anchor.href).toContain("blob:mock");
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
