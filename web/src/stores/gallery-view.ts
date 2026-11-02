import type { DirEntry, MetaIndex } from "../api/types.ts";
import type { CloudIndexState } from "./cloud-index.ts";
import { createStore, memo, type Readable } from "./store.ts";
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

export interface ViewInput {
  readonly entries: readonly DirEntry[];
  readonly meta: MetaIndex;
  readonly filter: FilterState;
  readonly sort: SortState;
  readonly filterActive: boolean;
  readonly cloudIndex: CloudIndexState;
  readonly path: string;
}

/** Everything the gallery derives from the listing, filter and cloud index. */
export type GalleryViewState = ReturnType<ReturnType<typeof derive>>;

export interface GalleryView extends Readable<GalleryViewState> {
  /** Recompute from fresh inputs; unchanged inputs reuse earlier results. */
  update: (input: ViewInput) => void;
  dispose: () => void;
}

function derive() {
  const scope = memo(
    (indexEntries: readonly DirEntry[], path: string) =>
      indexEntries.filter((e) => underPath(e.path, path)),
  );
  const extensions = memo(availableExtensions);
  const sizeVals = memo(sizeValues);
  const durVals = memo(durationValues);
  const visible = memo(applyFilterSort);
  const results = memo(
    (
      globalMode: boolean,
      scoped: readonly DirEntry[],
      meta: MetaIndex,
      filter: FilterState,
      sort: SortState,
    ) => {
      if (!globalMode) return [];
      const wantFolders = filter.type === "folder";
      const pool = scoped.filter((e) =>
        wantFolders ? e.kind === "dir" : e.kind === "file",
      );
      return applyFilterSort(pool, meta, filter, sort);
    },
  );
  const groups = memo(groupByFolder);
  const media = memo((displayed: readonly DirEntry[]) =>
    displayed.filter(
      (e) =>
        isImage(e.name) || isVideo(e.name) || isPdf(e.name) || isAudio(e.name),
    ),
  );

  const assemble = memo(
    (
      globalMode: boolean,
      extensionList: readonly string[],
      sizeList: ReturnType<typeof sizeValues>,
      durList: ReturnType<typeof durationValues>,
      visibleEntries: readonly DirEntry[],
      groupList: ReturnType<typeof groupByFolder>,
      displayed: readonly DirEntry[],
      mediaList: readonly DirEntry[],
    ) => ({
      globalMode,
      extensions: extensionList,
      sizeVals: sizeList,
      durVals: durList,
      visible: visibleEntries,
      groups: groupList,
      displayed,
      media: mediaList,
    }),
  );

  return (input: ViewInput) => {
    const { cloudIndex, filter, sort, meta } = input;
    // Global mode: an active filter searches the whole cloud (once indexed),
    // rather than just the current folder.
    const globalMode =
      input.filterActive && cloudIndex.ready && cloudIndex.error === null;
    // Filtering in /Media/2026/07 searches only there; at the root, everything.
    const scoped = scope(cloudIndex.entries, input.path);
    const visibleEntries = visible(input.entries, meta, filter, sort);
    const globalResults = results(globalMode, scoped, meta, filter, sort);
    // What is on screen right now: the source of truth for selection and the
    // media viewer, so both work identically in folder and global mode.
    const displayed = globalMode ? globalResults : visibleEntries;
    return assemble(
      globalMode,
      extensions(scoped),
      sizeVals(scoped),
      durVals(scoped, meta),
      visibleEntries,
      groups(globalResults),
      displayed,
      media(displayed),
    );
  };
}

export function createGalleryView(initial: ViewInput): GalleryView {
  const compute = derive();
  const store = createStore<GalleryViewState>(compute(initial));
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    update: (input) => {
      store.setState(compute(input));
    },
    dispose: () => undefined,
  };
}
