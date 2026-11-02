import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useCloudIndex } from "./use-cloud-index.ts";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";

function entry(path: string, kind: DirEntry["kind"]): DirEntry {
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    kind,
    size: 1,
    mtimeMs: 0,
  };
}

function clientFor(list: DufsClient["list"]): DufsClient {
  return { list: vi.fn(list) } as unknown as DufsClient;
}

describe("useCloudIndex progress and cancel", () => {
  it("reports the true folder and entry counts of a finished walk", async () => {
    const client = clientFor((p) => {
      if (p === "/") return Promise.resolve([entry("/A", "dir"), entry("/r", "file")]);
      if (p === "/A") return Promise.resolve([entry("/A/x", "file")]);
      return Promise.resolve([]);
    });
    const { result } = renderHook(() => useCloudIndex(client, true));
    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    // Two folders were listed ("/" and "/A"); three entries were found.
    expect(result.current.progress).toEqual({ folders: 2, entries: 3, path: "/A" });
    expect(result.current.partial).toBe(false);
  });

  it("starts at zero before any walk", () => {
    const client = clientFor(() => Promise.resolve([]));
    const { result } = renderHook(() => useCloudIndex(client, false));
    expect(result.current.progress).toEqual({ folders: 0, entries: 0, path: "" });
  });

  it("cancel() before any walk is a no-op", () => {
    const client = clientFor(() => Promise.resolve([]));
    const { result } = renderHook(() => useCloudIndex(client, false));
    act(() => {
      result.current.cancel();
    });
    expect(result.current.ready).toBe(false);
    expect(result.current.partial).toBe(false);
  });

  it("cancel() keeps what was found, stops descending, flags partial", async () => {
    let releaseA!: (v: DirEntry[]) => void;
    const pendingA = new Promise<DirEntry[]>((r) => {
      releaseA = r;
    });
    const client = clientFor((p) => {
      if (p === "/") return Promise.resolve([entry("/A", "dir"), entry("/B", "dir")]);
      if (p === "/A") return pendingA;
      throw new Error(`must not list ${p} after cancel`);
    });
    const { result } = renderHook(() => useCloudIndex(client, true));
    await waitFor(() => {
      expect(result.current.progress.folders).toBe(1);
    });
    act(() => {
      result.current.cancel();
    });
    releaseA([entry("/A/deep", "dir")]);
    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    expect(result.current.partial).toBe(true);
    expect(result.current.loading).toBe(false);
    const paths = result.current.entries.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["/A", "/B"]));
    expect(client.list).not.toHaveBeenCalledWith("/B");
    expect(client.list).not.toHaveBeenCalledWith("/A/deep");
  });

  it("reload() after a cancel walks again from scratch", async () => {
    const client = clientFor(() => Promise.resolve([entry("/a", "file")]));
    const { result } = renderHook(() => useCloudIndex(client, true));
    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.progress.folders).toBe(1);
      expect(result.current.ready).toBe(true);
    });
    expect(result.current.partial).toBe(false);
  });
});
