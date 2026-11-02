import { describe, it, expect } from "vitest";
import { createCloudIndex } from "./cloud-index.ts";
import { clientWith, deferred, entry, flush } from "../test/store-helpers.ts";
import type { DirEntry } from "../api/types.ts";

describe("createCloudIndex", () => {
  it("does nothing until enabled", async () => {
    const client = clientWith({ list: () => Promise.resolve([]) });
    const index = createCloudIndex(client);
    await flush();
    expect(index.getState().ready).toBe(false);
    expect(index.getState().loading).toBe(false);
    expect(client.list).not.toHaveBeenCalled();
  });

  it("walks the whole tree, skipping app + Keepass names", async () => {
    const client = clientWith({
      list: (p: string) => {
        if (p === "/") {
          return Promise.resolve([
            entry("/Media", "dir"),
            entry("/.thumbs", "dir"),
            entry("/Keepass", "dir"),
            entry("/root.txt"),
          ]);
        }
        if (p === "/Media") {
          return Promise.resolve([
            entry("/Media/pic.jpg"),
            entry("/Media/assets", "dir"),
          ]);
        }
        throw new Error(`unexpected list(${p})`);
      },
    });
    const index = createCloudIndex(client);
    index.enable();
    expect(index.getState().loading).toBe(true);
    await flush();
    const paths = index.getState().entries.map((e) => e.path);
    expect(paths).toEqual(["/Media", "/Media/pic.jpg", "/root.txt"]);
    expect(index.getState().ready).toBe(true);
    expect(index.getState().loading).toBe(false);
    expect(client.list).not.toHaveBeenCalledWith("/.thumbs");
    expect(client.list).not.toHaveBeenCalledWith("/Media/assets");
  });

  it("skips a folder whose listing fails but keeps the rest", async () => {
    const client = clientWith({
      list: (p: string) => {
        if (p === "/") {
          return Promise.resolve([entry("/Bad", "dir"), entry("/ok.txt")]);
        }
        return Promise.reject(new Error("boom"));
      },
    });
    const index = createCloudIndex(client);
    index.enable();
    await flush();
    expect(index.getState().error).toBeNull();
    expect(index.getState().entries.map((e) => e.path)).toEqual([
      "/Bad",
      "/ok.txt",
    ]);
  });

  it("surfaces a root listing failure (Error and non-Error)", async () => {
    const failing = createCloudIndex(
      clientWith({ list: () => Promise.reject(new Error("rooterr")) }),
    );
    failing.enable();
    await flush();
    expect(failing.getState().ready).toBe(true);
    expect(failing.getState().error).toBe("rooterr");

    const plain = createCloudIndex(
      clientWith({
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        list: () => Promise.reject("plain-root"),
      }),
    );
    plain.enable();
    await flush();
    expect(plain.getState().error).toBe("plain-root");
  });

  it("enable() is idempotent", async () => {
    const client = clientWith({ list: () => Promise.resolve([]) });
    const index = createCloudIndex(client);
    index.enable();
    index.enable();
    await flush();
    expect(client.list).toHaveBeenCalledTimes(1);
  });

  it("reload() is a no-op until enabled, then re-walks", async () => {
    const client = clientWith({
      list: () => Promise.resolve([entry("/a.txt")]),
    });
    const index = createCloudIndex(client);
    index.reload();
    await flush();
    expect(client.list).not.toHaveBeenCalled();

    index.enable();
    await flush();
    index.reload();
    await flush();
    expect(client.list).toHaveBeenCalledTimes(2);
    expect(index.getState().ready).toBe(true);
  });

  it("a reload supersedes the walk still in flight", async () => {
    const first = deferred<DirEntry[]>();
    const lists = [first.promise, Promise.resolve([entry("/new.txt")])];
    const client = clientWith({
      list: () => lists.shift() ?? Promise.resolve([]),
    });
    const index = createCloudIndex(client);
    index.enable();
    index.reload();
    await flush();
    first.resolve([entry("/stale.txt")]);
    await flush();
    expect(index.getState().entries.map((e) => e.path)).toEqual(["/new.txt"]);
  });

  it("ignores a walk that finishes after dispose", async () => {
    const pending = deferred<DirEntry[]>();
    const client = clientWith({ list: () => pending.promise });
    const index = createCloudIndex(client);
    index.enable();
    index.dispose();
    pending.resolve([entry("/late.txt")]);
    await flush();
    expect(index.getState().ready).toBe(false);
    expect(index.getState().progress.folders).toBe(0);
  });

  it("dispose() before any walk is harmless", () => {
    const index = createCloudIndex(clientWith({}));
    expect(() => {
      index.dispose();
    }).not.toThrow();
  });

  it("stops descending once disposed mid-walk", async () => {
    const pendingA = deferred<DirEntry[]>();
    const client = clientWith({
      list: (p: string) => {
        if (p === "/") return Promise.resolve([entry("/A", "dir")]);
        if (p === "/A") return pendingA.promise;
        throw new Error(`should not descend into ${p}`);
      },
    });
    const index = createCloudIndex(client);
    index.enable();
    await flush();
    index.dispose();
    pendingA.resolve([entry("/A/B", "dir")]);
    await flush();
    expect(client.list).not.toHaveBeenCalledWith("/A/B");
  });
});
