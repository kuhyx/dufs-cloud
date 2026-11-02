import type { DirEntry } from "../api/types.ts";
import { createStore, type Readable } from "./store.ts";

export interface SelectionState {
  readonly selected: ReadonlySet<string>;
  readonly selectedEntries: readonly DirEntry[];
}

export interface Selection extends Readable<SelectionState> {
  /** What is on screen right now; selectedEntries are filtered from it. */
  setDisplayed: (displayed: readonly DirEntry[]) => void;
  toggleSelect: (entry: DirEntry, shiftKey: boolean) => void;
  clearSelection: () => void;
  dispose: () => void;
}

/** Multi-select over whatever is on screen right now (`displayed`). */
export function createSelection(): Selection {
  let displayed: readonly DirEntry[] = [];
  // Last item clicked/tapped without a modifier: the range-select anchor.
  let anchor: string | null = null;
  const store = createStore<SelectionState>({
    selected: new Set(),
    selectedEntries: [],
  });

  const publish = (selected: ReadonlySet<string>): void => {
    store.setState({
      selected,
      selectedEntries: displayed.filter((e) => selected.has(e.path)),
    });
  };

  // Shift-click selects every item between the anchor and the clicked one,
  // inclusive, scoped to what is currently on screen.
  const rangeBetween = (entry: DirEntry): string[] | null => {
    const anchorIdx = displayed.findIndex((e) => e.path === anchor);
    const targetIdx = displayed.findIndex((e) => e.path === entry.path);
    if (anchorIdx === -1 || targetIdx === -1) return null;
    const [lo, hi] =
      anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
    return displayed.slice(lo, hi + 1).map((e) => e.path);
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    setDisplayed: (next) => {
      displayed = next;
      publish(store.getState().selected);
    },
    toggleSelect: (entry, shiftKey) => {
      const cur = store.getState().selected;
      const range = shiftKey && anchor !== null ? rangeBetween(entry) : null;
      anchor = entry.path;
      if (range !== null) {
        publish(new Set([...cur, ...range]));
        return;
      }
      const next = new Set(cur);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      publish(next);
    },
    clearSelection: () => {
      anchor = null;
      publish(new Set());
    },
    dispose: () => undefined,
  };
}
