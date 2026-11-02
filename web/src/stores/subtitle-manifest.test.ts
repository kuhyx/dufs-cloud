import { describe, it, expect } from "vitest";
import { createSubtitleManifest } from "./subtitle-manifest.ts";
import { clientWith, deferred, flush } from "../test/store-helpers.ts";
import type { SubtitleManifest } from "../api/types.ts";

const manifest: SubtitleManifest = { generatedMs: 0, fonts: [], tracks: [] };

describe("createSubtitleManifest", () => {
  it("fetches nothing when the video has no subtitles directory", async () => {
    const client = clientWith({
      fetchSubtitleManifest: () => Promise.resolve(manifest),
    });
    const store = createSubtitleManifest(client);
    store.setDir(null);
    await flush();
    expect(store.getState()).toBeNull();
    expect(client.fetchSubtitleManifest).not.toHaveBeenCalled();
  });

  it("adopts the fetched manifest", async () => {
    const client = clientWith({
      fetchSubtitleManifest: () => Promise.resolve(manifest),
    });
    const store = createSubtitleManifest(client);
    store.setDir("/.subs/a.mkv");
    await flush();
    expect(store.getState()).toEqual(manifest);
    expect(client.fetchSubtitleManifest).toHaveBeenCalledWith("/.subs/a.mkv");
  });

  it("stays null when the manifest is absent", async () => {
    const client = clientWith({
      fetchSubtitleManifest: () => Promise.resolve(null),
    });
    const store = createSubtitleManifest(client);
    store.setDir("/.subs/a.mkv");
    await flush();
    expect(client.fetchSubtitleManifest).toHaveBeenCalled();
    expect(store.getState()).toBeNull();
  });

  it("does not refetch for the same dir", async () => {
    const client = clientWith({
      fetchSubtitleManifest: () => Promise.resolve(manifest),
    });
    const store = createSubtitleManifest(client);
    store.setDir("/.subs/a.mkv");
    store.setDir("/.subs/a.mkv");
    await flush();
    expect(client.fetchSubtitleManifest).toHaveBeenCalledTimes(1);
  });

  it("clears the manifest when moving to a video without one", async () => {
    const store = createSubtitleManifest(
      clientWith({ fetchSubtitleManifest: () => Promise.resolve(manifest) }),
    );
    store.setDir("/.subs/a.mkv");
    await flush();
    expect(store.getState()).toEqual(manifest);
    store.setDir(null);
    expect(store.getState()).toBeNull();
  });

  it("ignores a slow response for a video the user already left", async () => {
    const slow = deferred<SubtitleManifest | null>();
    const fetches = [slow.promise, new Promise<null>(() => undefined)];
    const store = createSubtitleManifest(
      clientWith({
        fetchSubtitleManifest: () => fetches.shift() ?? Promise.resolve(null),
      }),
    );
    store.setDir("/.subs/a.mkv");
    store.setDir("/.subs/b.mkv");
    slow.resolve(manifest);
    await flush();
    expect(store.getState()).toBeNull();
  });

  it("ignores a response arriving after dispose", async () => {
    const slow = deferred<SubtitleManifest | null>();
    const store = createSubtitleManifest(
      clientWith({ fetchSubtitleManifest: () => slow.promise }),
    );
    store.setDir("/.subs/a.mkv");
    store.dispose();
    slow.resolve(manifest);
    await flush();
    expect(store.getState()).toBeNull();
  });
});
