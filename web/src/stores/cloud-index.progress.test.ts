import { describe, it, expect } from "vitest";
import { createCloudIndex } from "./cloud-index.ts";
import { clientWith, deferred, entry, flush } from "../test/store-helpers.ts";
import type { DirEntry } from "../api/types.ts";

describe("createCloudIndex progress and cancel", () => {
  it("reports the true folder and entry counts of a finished walk", async () => {
    const index = createCloudIndex(
      clientWith({
        list: (p: string) => {
          if (p === "/") {
            return Promise.resolve([entry("/A", "dir"), entry("/r")]);
          }
          if (p === "/A") return Promise.resolve([entry("/A/x")]);
          return Promise.resolve([]);
        },
      }),
    );
    index.enable();
    await flush();
    expect(index.getState().progress).toEqual({
      folders: 2,
      entries: 3,
      path: "/A",
    });
    expect(index.getState().partial).toBe(false);
  });

  it("starts at zero before any walk", () => {
    const index = createCloudIndex(clientWith({}));
    expect(index.getState().progress).toEqual({
      folders: 0,
      entries: 0,
      path: "",
    });
  });

  it("notifies subscribers until they unsubscribe", async () => {
    const index = createCloudIndex(
      clientWith({ list: () => Promise.resolve([entry("/a")]) }),
    );
    let calls = 0;
    const off = index.subscribe(() => {
      calls++;
    });
    index.enable();
    await flush();
    expect(calls).toBeGreaterThanOrEqual(2);
    off();
    const seen = calls;
    index.reload();
    await flush();
    expect(calls).toBe(seen);
  });

  it("cancel() before any walk is a no-op", () => {
    const index = createCloudIndex(clientWith({}));
    index.cancel();
    expect(index.getState().ready).toBe(false);
    expect(index.getState().partial).toBe(false);
  });

  it("cancel() keeps what was found, stops descending, flags partial", async () => {
    const releaseA = deferred<DirEntry[]>();
    const client = clientWith({
      list: (p: string) => {
        if (p === "/") {
          return Promise.resolve([entry("/A", "dir"), entry("/B", "dir")]);
        }
        if (p === "/A") return releaseA.promise;
        throw new Error(`must not list ${p} after cancel`);
      },
    });
    const index = createCloudIndex(client);
    index.enable();
    await flush();
    expect(index.getState().progress.folders).toBe(1);
    index.cancel();
    releaseA.resolve([entry("/A/deep", "dir")]);
    await flush();
    const state = index.getState();
    expect(state.ready).toBe(true);
    expect(state.partial).toBe(true);
    expect(state.loading).toBe(false);
    expect(state.entries.map((e) => e.path)).toEqual(["/A", "/A/deep", "/B"]);
    expect(client.list).not.toHaveBeenCalledWith("/B");
    expect(client.list).not.toHaveBeenCalledWith("/A/deep");
  });

  it("reload() after a cancel walks again from scratch", async () => {
    const index = createCloudIndex(
      clientWith({ list: () => Promise.resolve([entry("/a")]) }),
    );
    index.enable();
    index.cancel();
    await flush();
    expect(index.getState().partial).toBe(true);
    index.reload();
    await flush();
    expect(index.getState().progress.folders).toBe(1);
    expect(index.getState().ready).toBe(true);
    expect(index.getState().partial).toBe(false);
  });
});
