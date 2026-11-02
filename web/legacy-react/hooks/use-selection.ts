import { useMemo, useState } from "react";
import type { DirEntry } from "../api/types.ts";

export interface Selection {
  readonly selected: ReadonlySet<string>;
  readonly selectedEntries: readonly DirEntry[];
  readonly toggleSelect: (entry: DirEntry, shiftKey: boolean) => void;
  readonly clearSelection: () => void;
}

/** Multi-select state over whatever is on screen right now (`displayed`). */
export function useSelection(displayed: readonly DirEntry[]): Selection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Last item clicked/tapped without a modifier — the range-select anchor.
  const [selectAnchor, setSelectAnchor] = useState<string | null>(null);

  const selectedEntries = useMemo(
    () => displayed.filter((e) => selected.has(e.path)),
    [displayed, selected],
  );

  function clearSelection(): void {
    setSelected(new Set());
    setSelectAnchor(null);
  }

  // Shift-click selects every item between the anchor (the last item
  // clicked without a modifier) and the clicked one, inclusive — standard
  // shift-click range semantics, scoped to what's currently on screen.
  function toggleSelect(entry: DirEntry, shiftKey: boolean): void {
    if (shiftKey && selectAnchor !== null) {
      const anchorIdx = displayed.findIndex((e) => e.path === selectAnchor);
      const targetIdx = displayed.findIndex((e) => e.path === entry.path);
      if (anchorIdx !== -1 && targetIdx !== -1) {
        const [lo, hi] =
          anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
        const range = displayed.slice(lo, hi + 1).map((e) => e.path);
        setSelected((cur) => new Set([...cur, ...range]));
        setSelectAnchor(entry.path);
        return;
      }
    }
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
    setSelectAnchor(entry.path);
  }

  return { selected, selectedEntries, toggleSelect, clearSelection };
}
