import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useCloudIndex } from "./use-cloud-index.ts";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";

function file(path: string, size = 1): DirEntry {
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

function makeClient(list: DufsClient["list"]): DufsClient {
  return {
    list: vi.fn(list),
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
    downloadBytes: vi.fn(() => Promise.resolve(new Uint8Array())),
  };
}

describe("useCloudIndex", () => {
  it("does nothing until enabled", () => {
    const client = makeClient(() => Promise.resolve([]));
    const { result } = renderHook(() => useCloudIndex(client, false));
    expect(result.current.ready).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(client.list).not.toHaveBeenCalled();
  });

  it("walks the whole tree, skipping app + Keepass names", async () => {
    const client = makeClient((p: string) => {
      if (p === "/") {
        return Promise.resolve([
          dir("/Media"),
          dir("/.thumbs"), // must be skipped, never descended
          dir("/Keepass"), // sensitive, skipped
          file("/root.txt"),
        ]);
      }
      if (p === "/Media") {
        // A nested skip-named dir must also be pruned mid-walk.
        return Promise.resolve([file("/Media/pic.jpg"), dir("/Media/assets")]);
      }
      throw new Error(`unexpected list(${p})`);
    });
    const { result } = renderHook(() => useCloudIndex(client, true));
    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    const paths = result.current.entries.map((e) => e.path);
    expect(paths).toContain("/root.txt");
    expect(paths).toContain("/Media");
    expect(paths).toContain("/Media/pic.jpg");
    expect(paths).not.toContain("/.thumbs");
    expect(paths).not.toContain("/Keepass");
    expect(paths).not.toContain("/Media/assets");
    // Skip-named dirs are never descended into, at any depth.
    expect(client.list).not.toHaveBeenCalledWith("/.thumbs");
    expect(client.list).not.toHaveBeenCalledWith("/Media/assets");
  });

  it("skips a folder whose listing fails but keeps the rest", async () => {
    const client = makeClient((p: string) => {
      if (p === "/") return Promise.resolve([dir("/Bad"), file("/ok.txt")]);
      if (p === "/Bad") return Promise.reject(new Error("boom"));
      return Promise.resolve([]);
    });
    const { result } = renderHook(() => useCloudIndex(client, true));
    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.entries.map((e) => e.path)).toContain("/ok.txt");
  });

  it("surfaces a root listing failure (Error and non-Error)", async () => {
    const err = makeClient(() => Promise.reject(new Error("rooterr")));
    const a = renderHook(() => useCloudIndex(err, true));
    await waitFor(() => {
      expect(a.result.current.ready).toBe(true);
    });
    expect(a.result.current.error).toBe("rooterr");

    const plain = makeClient(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject("plain-root"),
    );
    const b = renderHook(() => useCloudIndex(plain, true));
    await waitFor(() => {
      expect(b.result.current.error).toBe("plain-root");
    });
  });

  it("re-walks after reload() invalidates the cache", async () => {
    const client = makeClient(() => Promise.resolve([file("/a.txt")]));
    const { result } = renderHook(() => useCloudIndex(client, true));
    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    const before = (client.list as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(
        (client.list as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThan(before);
    });
  });

  it("ignores a walk that finishes after unmount", async () => {
    let resolve!: (v: DirEntry[]) => void;
    const pending = new Promise<DirEntry[]>((r) => {
      resolve = r;
    });
    const client = makeClient(() => pending);
    const { result, unmount } = renderHook(() => useCloudIndex(client, true));
    unmount();
    resolve([file("/late.txt")]);
    await pending;
    expect(result.current.ready).toBe(false);
  });

  it("stops descending once cancelled mid-walk", async () => {
    let resolveA!: (v: DirEntry[]) => void;
    const pendingA = new Promise<DirEntry[]>((r) => {
      resolveA = r;
    });
    const client = makeClient((p: string) => {
      if (p === "/") return Promise.resolve([dir("/A")]);
      if (p === "/A") return pendingA;
      throw new Error(`should not descend into ${p} after cancel`);
    });
    const { unmount } = renderHook(() => useCloudIndex(client, true));
    // Let the root list + walkInto("/A") start awaiting.
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    // Resolving now yields a child dir; the cancelled guard must stop the
    // descent instead of listing "/A/B".
    resolveA([dir("/A/B")]);
    await act(async () => {
      await pendingA;
    });
    expect(client.list).not.toHaveBeenCalledWith("/A/B");
  });
});
