import {
  audioStreams,
  parseDashManifest,
  type DashManifest,
  type DashStream,
} from "../lib/dash-manifest.ts";
import { fetchSegment } from "../lib/dash-buffer.ts";
import { createStore, type Readable } from "./store.ts";

/** The audio stream with `id`, or null. */
export function audioTrack(
  manifest: DashManifest | null,
  id: string | null,
): DashStream | null {
  if (manifest === null || id === null) return null;
  return audioStreams(manifest).find((s) => s.id === id) ?? null;
}

export interface ManifestStore extends Readable<DashManifest | null> {
  /** The video's `dashPath`, or null to disable. */
  setDir: (dir: string | null) => void;
  dispose: () => void;
}

/** Fetches and parses `<dir>/manifest.mpd`, or null when there is none.
 * Switching dirs aborts the old fetch and clears the state at once, so a stale
 * manifest is never returned for the next video. */
export function createManifest(): ManifestStore {
  const store = createStore<DashManifest | null>(null);
  let current: string | null = null;
  let abort: AbortController | null = null;
  const stop = (): void => {
    abort?.abort();
    abort = null;
  };
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    setDir: (dir) => {
      if (dir === current) return;
      current = dir;
      stop();
      store.setState(null);
      if (dir === null) return;
      const mine = new AbortController();
      abort = mine;
      void (async () => {
        const data = await fetchSegment(`${dir}/manifest.mpd`, mine.signal);
        if (mine.signal.aborted) return;
        store.setState(
          data === null ? null : parseDashManifest(new TextDecoder().decode(data)),
        );
      })();
    },
    dispose: stop,
  };
}
