import { describe, it, expect, vi } from "vitest";
import { audioTrack, createManifest } from "./dash-manifest.ts";
import { parseDashManifest } from "../lib/dash-manifest.ts";
import {
  MANIFEST,
  flush,
  installDashFakes,
  stubFetch,
} from "../test/dash-player-fixtures.ts";

installDashFakes();

describe("audioTrack", () => {
  const manifest = parseDashManifest(MANIFEST);

  it("finds the stream with the id", () => {
    expect(audioTrack(manifest, "2")?.language).toBe("jpn");
  });

  it("is null for an unknown id", () => {
    expect(audioTrack(manifest, "nope")).toBeNull();
  });

  it("is null without a manifest or an id", () => {
    expect(audioTrack(null, "1")).toBeNull();
    expect(audioTrack(manifest, null)).toBeNull();
  });
});

describe("createManifest", () => {
  it("starts empty and stays empty for a null dir", async () => {
    const store = createManifest();
    store.setDir(null);
    await flush();
    expect(store.getState()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches and parses the manifest of a dir", async () => {
    const store = createManifest();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setDir("/.dash/v.mkv");
    await flush();
    expect(fetch).toHaveBeenCalledWith(
      "/.dash/v.mkv/manifest.mpd",
      expect.anything(),
    );
    expect(store.getState()).toEqual(parseDashManifest(MANIFEST));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not refetch for the same dir", async () => {
    const store = createManifest();
    store.setDir("/.dash/v.mkv");
    store.setDir("/.dash/v.mkv");
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("is null when the manifest cannot be fetched", async () => {
    stubFetch(null);
    const store = createManifest();
    store.setDir("/.dash/v.mkv");
    await flush();
    expect(store.getState()).toBeNull();
  });

  it("clears the state at once when the dir changes", async () => {
    const store = createManifest();
    store.setDir("/.dash/a.mkv");
    await flush();
    expect(store.getState()).not.toBeNull();
    store.setDir("/.dash/b.mkv");
    expect(store.getState()).toBeNull();
    await flush();
    expect(store.getState()).not.toBeNull();
  });

  it("clears the state when the dir becomes null", async () => {
    const store = createManifest();
    store.setDir("/.dash/a.mkv");
    await flush();
    store.setDir(null);
    expect(store.getState()).toBeNull();
  });

  it("drops a manifest that lands after dispose", async () => {
    const pending: ((v: unknown) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            pending.push(resolve);
          }),
      ),
    );
    const store = createManifest();
    store.setDir("/.dash/v.mkv");
    store.dispose();
    for (const resolve of pending) {
      resolve({
        ok: true,
        arrayBuffer: () =>
          Promise.resolve(new TextEncoder().encode(MANIFEST).buffer),
      });
    }
    await flush();
    expect(store.getState()).toBeNull();
  });

  it("disposes safely with nothing in flight", () => {
    const store = createManifest();
    expect(() => {
      store.dispose();
    }).not.toThrow();
  });
});
