import { useMemo } from "react";
import type { DirEntry, MetaIndex } from "../api/types.ts";
import type { CloudIndex } from "./use-cloud-index.ts";
import { isAudio, isImage, isPdf, isVideo, underPath } from "../lib/paths.ts";
import {
  applyFilterSort,
  type FilterState,
  type SortState,
} from "../lib/filter-sort.ts";
import {
  availableExtensions,
  durationValues,
  groupByFolder,
  sizeValues,
} from "../lib/cloud-stats.ts";

interface ViewInput {
  readonly entries: readonly DirEntry[];
  readonly meta: MetaIndex;
  readonly filter: FilterState;
  readonly sort: SortState;
  readonly filterActive: boolean;
  readonly cloudIndex: CloudIndex;
  readonly path: string;
}

/** Everything the gallery derives from the listing, filter and cloud index. */
export function useGalleryView({
  entries,
  meta,
  filter,
  sort,
  filterActive,
  cloudIndex,
  path,
}: ViewInput) {
  // Global mode: an active filter searches the whole cloud (once indexed),
  // rather than just the current folder.
  const globalMode = filterActive && cloudIndex.ready && cloudIndex.error === null;

  // Scope the index to the current folder's subtree: filtering in /Media/2026/07
  // searches only there; filtering at the root searches everything.
  const scoped = useMemo(
    () => cloudIndex.entries.filter((e) => underPath(e.path, path)),
    [cloudIndex.entries, path],
  );
  const extensions = useMemo(() => availableExtensions(scoped), [scoped]);
  const sizeVals = useMemo(() => sizeValues(scoped), [scoped]);
  const durVals = useMemo(() => durationValues(scoped, meta), [scoped, meta]);

  // Current-folder view (browsing + sorting, no cross-folder search).
  const visible = useMemo(
    () => applyFilterSort(entries, meta, filter, sort),
    [entries, meta, filter, sort],
  );
  // Scoped search results when filtering, grouped under their folders. The type
  // filter chooses the pool: folders when Folders is selected, files otherwise.
  const globalResults = useMemo(() => {
    if (!globalMode) return [];
    const wantFolders = filter.type === "folder";
    const pool = scoped.filter((e) =>
      wantFolders ? e.kind === "dir" : e.kind === "file",
    );
    return applyFilterSort(pool, meta, filter, sort);
  }, [globalMode, scoped, meta, filter, sort]);
  const groups = useMemo(() => groupByFolder(globalResults), [globalResults]);

  // What is on screen right now — the source of truth for selection and the
  // media viewer, so both work identically in folder and global mode.
  const displayed = globalMode ? globalResults : visible;
  const media = useMemo(
    () =>
      displayed.filter(
        (e) => isImage(e.name) || isVideo(e.name) || isPdf(e.name) || isAudio(e.name),
      ),
    [displayed],
  );

  return {
    globalMode,
    extensions,
    sizeVals,
    durVals,
    visible,
    groups,
    displayed,
    media,
  };
}
