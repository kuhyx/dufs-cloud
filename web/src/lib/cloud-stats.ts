import type { DirEntry, MetaIndex } from "../api/types.ts";
import { extname, parentPath } from "./paths.ts";

/** Distinct file extensions across `entries`, lower-cased and sorted. Powers
 * the extension datalist so the user can pick from what actually exists. */
export function availableExtensions(entries: readonly DirEntry[]): string[] {
  const set = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    const ext = extname(entry.name);
    if (ext !== "") set.add(ext);
  }
  return [...set].sort();
}

/** All file sizes in `entries`, ascending. Feeds the size slider, whose scale is
 * quantile-based (see {@link quantileValue}), so the full distribution — not
 * just the min/max — is needed. Directories carry no size and are skipped. */
export function sizeValues(entries: readonly DirEntry[]): number[] {
  return entries
    .filter((e) => e.kind === "file")
    .map((e) => e.size)
    .sort((a, b) => a - b);
}

/** All known video durations (ms) among `entries`, ascending, read from the
 * metadata index (PROPFIND carries no duration). Feeds the quantile-scaled
 * duration slider; empty when nothing is indexed. Mirrors {@link sizeValues}. */
export function durationValues(
  entries: readonly DirEntry[],
  meta: MetaIndex,
): number[] {
  const out: number[] = [];
  for (const entry of entries) {
    const ms = meta[entry.path]?.durationMs ?? null;
    if (ms !== null) out.push(ms);
  }
  return out.sort((a, b) => a - b);
}

export interface FolderGroup {
  /** Absolute folder path the entries live in, e.g. "/Media/2026". */
  readonly folder: string;
  readonly entries: readonly DirEntry[];
}

/** Group `entries` by their containing folder, folders sorted by path. Used to
 * render global (whole-cloud) filter results under per-folder headers, so a
 * match's location is visible without navigating. Preserves the incoming order
 * within each group (callers pass an already-sorted list). */
export function groupByFolder(entries: readonly DirEntry[]): FolderGroup[] {
  const map = new Map<string, DirEntry[]>();
  for (const entry of entries) {
    const folder = parentPath(entry.path);
    let bucket = map.get(folder);
    if (bucket === undefined) {
      bucket = [];
      map.set(folder, bucket);
    }
    bucket.push(entry);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([folder, es]) => ({ folder, entries: es }));
}
