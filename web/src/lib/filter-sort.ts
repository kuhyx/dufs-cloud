import type { DirEntry, MetaIndex } from "../api/types.ts";
import { extname, isImage, isText, isVideo } from "./paths.ts";

/** Coarse category used by the type filter and the "type" sort. */
export type TypeFilter =
  | "all"
  | "folder"
  | "image"
  | "video"
  | "text"
  | "other";

/** Sort keys the UI exposes. `created`/`uploaded`/`duration` need the index. */
export type SortKey =
  | "name"
  | "size"
  | "modified"
  | "created"
  | "uploaded"
  | "duration"
  | "type"
  | "extension";

export type SortDir = "asc" | "desc";

export interface FilterState {
  /** Fuzzy (subsequence) filename query; empty matches everything. */
  readonly query: string;
  readonly type: TypeFilter;
  /** Lower-cased extension without the dot; "" means any. */
  readonly extension: string;
  readonly minSize: number | null;
  readonly maxSize: number | null;
  readonly minDurationMs: number | null;
  readonly maxDurationMs: number | null;
}

export interface SortState {
  readonly key: SortKey;
  readonly dir: SortDir;
}

export const DEFAULT_FILTER: FilterState = {
  query: "",
  type: "all",
  extension: "",
  minSize: null,
  maxSize: null,
  minDurationMs: null,
  maxDurationMs: null,
};

export const DEFAULT_SORT: SortState = { key: "name", dir: "asc" };

/** True when this filter differs from the default (used to badge the UI). */
export function isFilterActive(f: FilterState): boolean {
  return (
    f.query !== "" ||
    f.type !== "all" ||
    f.extension !== "" ||
    f.minSize !== null ||
    f.maxSize !== null ||
    f.minDurationMs !== null ||
    f.maxDurationMs !== null
  );
}

/** The category of an entry. */
export function categoryOf(entry: DirEntry): TypeFilter {
  if (entry.kind === "dir") return "folder";
  if (isImage(entry.name)) return "image";
  if (isVideo(entry.name)) return "video";
  if (isText(entry.name)) return "text";
  return "other";
}

const CATEGORY_ORDER: readonly TypeFilter[] = [
  "folder",
  "image",
  "video",
  "text",
  "other",
  "all",
];

/** Case-insensitive subsequence match: every query char appears in order. */
export function fuzzyMatch(query: string, target: string): boolean {
  if (query === "") return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) i++;
  }
  return i === q.length;
}

function durationOf(entry: DirEntry, meta: MetaIndex): number | null {
  return meta[entry.path]?.durationMs ?? null;
}

function passesFilters(
  entry: DirEntry,
  meta: MetaIndex,
  f: FilterState,
): boolean {
  if (!fuzzyMatch(f.query, entry.name)) return false;
  if (f.type !== "all" && categoryOf(entry) !== f.type) return false;
  // Folders are navigation aids: they skip the file-only filters below.
  if (entry.kind === "dir") return true;
  if (f.extension !== "" && extname(entry.name) !== f.extension) return false;
  if (f.minSize !== null && entry.size < f.minSize) return false;
  if (f.maxSize !== null && entry.size > f.maxSize) return false;
  const dur = durationOf(entry, meta);
  if (f.minDurationMs !== null && (dur === null || dur < f.minDurationMs)) {
    return false;
  }
  if (f.maxDurationMs !== null && (dur === null || dur > f.maxDurationMs)) {
    return false;
  }
  return true;
}

function sortValue(
  entry: DirEntry,
  meta: MetaIndex,
  key: SortKey,
): number | string {
  const m = meta[entry.path];
  switch (key) {
    case "name":
      return entry.name.toLowerCase();
    case "extension":
      return extname(entry.name);
    case "type":
      return CATEGORY_ORDER.indexOf(categoryOf(entry));
    case "size":
      return entry.size;
    case "modified":
      return entry.mtimeMs;
    case "created":
      return m?.createdMs ?? 0;
    case "uploaded":
      return m?.uploadedMs ?? 0;
    case "duration":
      return m?.durationMs ?? 0;
  }
}

function compare(
  a: DirEntry,
  b: DirEntry,
  meta: MetaIndex,
  sort: SortState,
): number {
  // Directories always cluster first, regardless of sort direction.
  if ((a.kind === "dir") !== (b.kind === "dir")) {
    return a.kind === "dir" ? -1 : 1;
  }
  const va = sortValue(a, meta, sort.key);
  const vb = sortValue(b, meta, sort.key);
  let c =
    typeof va === "string" && typeof vb === "string"
      ? va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" })
      : (va as number) - (vb as number);
  if (c === 0) {
    c = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  }
  return sort.dir === "asc" ? c : -c;
}

/** Filter then sort `entries` using `meta` for index-only fields. Pure. */
export function applyFilterSort(
  entries: readonly DirEntry[],
  meta: MetaIndex,
  filter: FilterState,
  sort: SortState,
): DirEntry[] {
  return entries
    .filter((e) => passesFilters(e, meta, filter))
    .sort((a, b) => compare(a, b, meta, sort));
}
