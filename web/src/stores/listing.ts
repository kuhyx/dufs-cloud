import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { createStore, type Readable } from "./store.ts";

/** Names the app owns in the cloud root — hidden from the browsing grid. */
const APP_FILES = new Set([
  "index.html",
  "assets",
  "favicon.ico",
  "vite.svg",
  ".thumbs",
  "_thumbs",
  ".meta",
  ".proxies",
  ".subs",
]);

export interface ListingState {
  readonly entries: readonly DirEntry[];
  readonly loading: boolean;
  readonly error: string | null;
}

export interface Listing extends Readable<ListingState> {
  /** Navigate: clears the entries and loads `path`. */
  setPath: (path: string) => void;
  /** Re-fetch the current path, keeping the old entries on screen meanwhile. */
  reload: () => void;
  dispose: () => void;
}

export function createListing(client: DufsClient): Listing {
  const store = createStore<ListingState>({
    entries: [],
    loading: true,
    error: null,
  });
  let path: string | null = null;
  // Each fetch gets a ticket; only the newest may publish its result.
  let ticket = 0;

  const load = (target: string): void => {
    const mine = ++ticket;
    client
      .list(target)
      .then((all) => {
        if (mine !== ticket) return;
        store.setState({
          entries: all.filter((e) => !APP_FILES.has(e.name)),
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (mine !== ticket) return;
        store.setState({
          entries: [],
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    setPath: (next) => {
      if (next === path) return;
      path = next;
      store.setState({ entries: [], loading: true, error: null });
      load(next);
    },
    reload: () => {
      if (path !== null) load(path);
    },
    dispose: () => {
      ticket++;
    },
  };
}
