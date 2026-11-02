import { createStore, type Readable } from "./store.ts";

export interface ToggleSet extends Readable<ReadonlySet<string>> {
  /** Add the key if absent, remove it if present. */
  toggle: (key: string) => void;
  dispose: () => void;
}

export function createToggleSet(): ToggleSet {
  const store = createStore<ReadonlySet<string>>(new Set());
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    toggle: (key) => {
      store.setState((cur) => {
        const next = new Set(cur);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    dispose: () => undefined,
  };
}
