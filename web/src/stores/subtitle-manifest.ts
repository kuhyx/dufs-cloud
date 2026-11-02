import type { DufsClient } from "../api/dufs-client.ts";
import type { SubtitleManifest } from "../api/types.ts";
import { createStore, type Readable } from "./store.ts";

export interface SubtitleManifestStore extends Readable<SubtitleManifest | null> {
  /** The open video's `subtitlesPath`, or null when it has none. */
  setDir: (dir: string | null) => void;
  dispose: () => void;
}

/** Switching dirs clears the state and drops any slower earlier fetch. */
export function createSubtitleManifest(
  client: DufsClient,
): SubtitleManifestStore {
  const store = createStore<SubtitleManifest | null>(null);
  let ticket = 0;
  let current: string | null = null;
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    setDir: (dir) => {
      if (dir === current) return;
      current = dir;
      const mine = ++ticket;
      store.setState(null);
      if (dir === null) return;
      void client.fetchSubtitleManifest(dir).then((m) => {
        if (mine === ticket) store.setState(m);
      });
    },
    dispose: () => {
      ticket++;
    },
  };
}
