import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { createHashPath } from "../lib/hash-path.ts";
import { createCompletionCue, type CompletionCue, type CueRun } from "../lib/completion-cue.ts";
import { DEFAULT_FILTER, DEFAULT_SORT, isFilterActive, type FilterState, type SortState } from "../lib/filter-sort.ts";
import { createCloudIndex } from "../stores/cloud-index.ts";
import { createGalleryDialogs } from "../stores/gallery-dialogs.ts";
import { createGalleryView, type ViewInput } from "../stores/gallery-view.ts";
import { createListing } from "../stores/listing.ts";
import { createMeta } from "../stores/meta.ts";
import { createMutations } from "../stores/mutations.ts";
import { createOsDrop } from "../stores/os-drop.ts";
import { createSelection } from "../stores/selection.ts";
import { createStore } from "../stores/store.ts";
import { createToggleSet } from "../stores/toggle-set.ts";
import { createTransfers } from "../stores/transfers.ts";

interface Local {
  readonly filter: FilterState;
  readonly sort: SortState;
  readonly busy: string | null;
  /** -1 means "no viewer open". */
  readonly viewerIndex: number;
}

export type GalleryState = ReturnType<typeof createGalleryState>;
export type GallerySnapshot = ReturnType<GalleryState["snapshot"]>;

/** Every store the gallery owns, wired the way the legacy `Gallery` hooks were. */
export function createGalleryState(
  client: DufsClient,
  onChange: () => void,
  cue: CompletionCue = createCompletionCue(),
) {
  const hash = createHashPath();
  const listing = createListing(client);
  const meta = createMeta(client);
  const cloudIndex = createCloudIndex(client);
  const dialogs = createGalleryDialogs();
  const selection = createSelection();
  const collapsed = createToggleSet();
  const local = createStore<Local>({ filter: DEFAULT_FILTER, sort: DEFAULT_SORT, busy: null, viewerIndex: -1 });
  const patch = (change: Partial<Local>): void => {
    local.setState((s) => ({ ...s, ...change }));
  };
  const setBusy = (busy: string | null): void => {
    patch({ busy });
  };
  const refreshAll = (): void => {
    listing.reload();
    cloudIndex.reload();
  };
  let indexRun: CueRun | null = null;
  // The run whose outcome is the next transfer-only `setBusy`: null means success.
  let transferRun: CueRun | null = null;
  const transfers = createTransfers({
    client,
    getPath: hash.getState,
    setBusy: (message) => {
      setBusy(message);
      if (message === null) transferRun?.succeeded();
      transferRun = null;
    },
    refreshAll,
    clearSelection: selection.clearSelection,
  });
  const timed = (start: () => void): void => {
    transferRun = null;
    const run = cue.begin();
    start();
    transferRun = run;
  };
  const uploadInto = (destDir: string, files: FileList | null): void => {
    if (files === null || files.length === 0) return;
    timed(() => {
      transfers.uploadInto(destDir, files);
    });
  };
  const mutations = createMutations({
    client,
    getPath: hash.getState,
    getSelectedEntries: () => selection.getState().selectedEntries,
    setBusy,
    refreshAll,
    clearSelection: selection.clearSelection,
  });
  const osDrop = createOsDrop((files) => {
    uploadInto(hash.getState(), files);
  });
  const input = (): ViewInput => {
    const { filter, sort } = local.getState();
    return {
      entries: listing.getState().entries,
      meta: meta.getState(),
      filter,
      sort,
      filterActive: isFilterActive(filter),
      cloudIndex: cloudIndex.getState(),
      path: hash.getState(),
    };
  };
  listing.setPath(hash.getState());
  const view = createGalleryView(input());
  let displayed: readonly DirEntry[] | null = null;
  let syncing = false;
  const sync = (): void => {
    if (syncing) return;
    syncing = true;
    listing.setPath(hash.getState());
    view.update(input());
    if (view.getState().displayed !== displayed) {
      displayed = view.getState().displayed;
      selection.setDisplayed(displayed);
    }
    const ci = cloudIndex.getState();
    if (indexRun !== null && ci.ready) {
      if (!ci.partial && ci.error === null) indexRun.succeeded();
      indexRun = null;
    }
    syncing = false;
    onChange();
  };
  const stores = [hash, listing, meta, cloudIndex, dialogs, selection, collapsed, local, transfers, osDrop];
  const unsubs = stores.map((s) => s.subscribe(sync));
  let indexEnabled = false;

  return {
    client,
    dialogs,
    mutations,
    osDrop,
    reload: listing.reload,
    toggleCollapsed: collapsed.toggle,
    toggleSelect: selection.toggleSelect,
    clearSelection: selection.clearSelection,
    cancelTransfer: transfers.cancelTransfer,
    cancelIndex: cloudIndex.cancel,
    uploadInto,
    snapshot: () => {
      const l = local.getState();
      return {
        ...l,
        path: hash.getState(),
        listing: listing.getState(),
        meta: meta.getState(),
        cloudIndex: cloudIndex.getState(),
        view: view.getState(),
        selection: selection.getState(),
        dialogs: dialogs.getState(),
        collapsed: collapsed.getState(),
        transfer: transfers.getState().transfer,
        osDragOver: osDrop.getState().osDragOver,
        filterActive: isFilterActive(l.filter),
      };
    },
    /** Navigation drops the selection and any active search. */
    go: (dest: string): void => {
      selection.clearSelection();
      patch({ filter: DEFAULT_FILTER });
      hash.navigate(dest);
    },
    openMedia: (entry: DirEntry): void => {
      patch({ viewerIndex: view.getState().media.findIndex((m) => m.path === entry.path) });
    },
    setViewerIndex: (next: number | ((cur: number) => number)): void => {
      const cur = local.getState().viewerIndex;
      patch({ viewerIndex: typeof next === "function" ? next(cur) : next });
    },
    setFilter: (filter: FilterState): void => {
      patch({ filter });
    },
    setSort: (sort: SortState): void => {
      patch({ sort });
    },
    activateIndex: (): void => {
      if (indexEnabled) return;
      indexEnabled = true;
      indexRun = cue.begin();
      cloudIndex.enable();
    },
    downloadSelected: (): void => {
      const { globalMode } = view.getState();
      const zipBase = globalMode ? "/" : hash.getState();
      const entries = selection.getState().selectedEntries;
      timed(() => {
        transfers.downloadSelected(zipBase, entries);
      });
    },
    dispose: (): void => {
      for (const u of unsubs) u();
      for (const s of [hash, listing, meta, cloudIndex, transfers]) s.dispose();
    },
  };
}
