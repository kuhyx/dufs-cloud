import type { DufsClient } from "../api/dufs-client.ts";
import type { MetaIndex } from "../api/types.ts";
import { createStore, type Readable } from "./store.ts";

export interface Meta extends Readable<MetaIndex> {
  dispose: () => void;
}

/** Fetches `/.meta/index.json` once on creation; the state is `{}` until then. */
export function createMeta(client: DufsClient): Meta {
  const store = createStore<MetaIndex>({});
  let disposed = false;
  void client.fetchMeta().then((m) => {
    if (!disposed) store.setState(m);
  });
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    dispose: () => {
      disposed = true;
    },
  };
}
