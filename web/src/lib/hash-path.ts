import { createStore, type Readable } from "../stores/store.ts";
import { normalize } from "./paths.ts";

/** The directory lives in the URL hash, so the HTTP path stays "/" and dufs
 * `render-spa` always serves the shell. */
export function readHash(): string {
  const raw = window.location.hash.replace(/^#/, "");
  return normalize(raw === "" ? "/" : raw);
}

export interface HashPath extends Readable<string> {
  navigate: (path: string) => void;
  dispose: () => void;
}

export function createHashPath(): HashPath {
  const store = createStore(readHash());
  const onChange = (): void => {
    store.setState(readHash());
  };
  window.addEventListener("hashchange", onChange);
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    navigate: (path) => {
      window.location.hash = normalize(path);
    },
    dispose: () => {
      window.removeEventListener("hashchange", onChange);
    },
  };
}
