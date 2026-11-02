import { useState } from "react";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import {
  DEFAULT_FILTER,
  DEFAULT_SORT,
  isFilterActive,
  type FilterState,
  type SortState,
} from "../lib/filter-sort.ts";
import { useHashPath } from "../lib/use-hash-path.ts";
import { useListing } from "../hooks/use-listing.ts";
import { useMeta } from "../hooks/use-meta.ts";
import { useCloudIndex } from "../hooks/use-cloud-index.ts";
import { useGalleryDialogs } from "../hooks/use-gallery-dialogs.ts";
import { useGalleryView } from "../hooks/use-gallery-view.ts";
import { useMutations } from "../hooks/use-mutations.ts";
import { useSelection } from "../hooks/use-selection.ts";
import { useOsDrop } from "../hooks/use-os-drop.ts";
import { useTransfers } from "../hooks/use-transfers.ts";
import { useToggleSet } from "../hooks/use-toggle-set.ts";
import { Grid } from "./grid.tsx";
import { FilterBar } from "./filter-bar.tsx";
import { GalleryViewer } from "./gallery-viewer.tsx";
import { PromptDialog } from "./prompt-dialog.tsx";
import { TransferBanner } from "./transfer-banner.tsx";
import { GalleryDialogs } from "./gallery-dialogs.tsx";
import { GalleryTopbar } from "./gallery-topbar.tsx";
import { ResultGroups } from "./result-groups.tsx";
import { SelectionBar } from "./selection-bar.tsx";

export function Gallery({ client }: { readonly client: DufsClient }): React.JSX.Element {
  const [path, navigate] = useHashPath();
  const { entries, loading, error, reload } = useListing(client, path);
  const meta = useMeta(client);
  // -1 means "no viewer open" (avoids a null branch in step()).
  const [viewerIndex, setViewerIndex] = useState(-1);
  const dialogs = useGalleryDialogs();
  const { renameEntry, setEditEntry, setDeleteEntry, setRenameEntry } = dialogs;
  const [busy, setBusy] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  // Folder groups the user has collapsed in the global-results view.
  const [collapsed, toggleCollapsed] = useToggleSet();
  // The whole-cloud index powers global filtering; it is walked lazily the first
  // time the filter bar is touched, then cached (see useCloudIndex).
  const [indexEnabled, setIndexEnabled] = useState(false);
  const cloudIndex = useCloudIndex(client, indexEnabled);

  const filterActive = isFilterActive(filter);
  const {
    globalMode,
    extensions,
    sizeVals,
    durVals,
    visible,
    groups,
    displayed,
    media,
  } = useGalleryView({ entries, meta, filter, sort, filterActive, cloudIndex, path });
  const { selected, selectedEntries, toggleSelect, clearSelection } =
    useSelection(displayed);
  const actionDeps = { client, path, setBusy, refreshAll, clearSelection };
  const transfers = useTransfers(actionDeps);
  const mutations = useMutations({ ...actionDeps, selectedEntries });
  const drop = useOsDrop(transfers.uploadHere);
  const gridProps = {
    client,
    selected,
    onToggleSelect: toggleSelect,
    onOpenDir: go,
    onOpenMedia: openMedia,
    onEditText: setEditEntry,
    onDelete: setDeleteEntry,
    onRename: setRenameEntry,
  };

  // Reload the current folder and invalidate the whole-cloud index so a later
  // filter re-walks the changed tree (lazy: it does not re-walk immediately).
  function refreshAll(): void {
    reload();
    cloudIndex.reload();
  }

  // Navigation exits any active search and drops the selection: both belong to
  // the view we're leaving. Global (filtered) results are path-independent, so
  // "going" to a folder only makes sense once the filter is cleared.
  function go(dest: string): void {
    clearSelection();
    setFilter(DEFAULT_FILTER);
    navigate(dest);
  }

  // Grid only calls this for media entries, so the entry is always in `media`.
  function openMedia(entry: DirEntry): void {
    setViewerIndex(media.findIndex((m) => m.path === entry.path));
  }

  const showListing = !loading && error === null;

  return (
    <div className="gallery">
      <GalleryTopbar
        path={path}
        busy={busy}
        onGo={go}
        onNewFolder={dialogs.openNewFolder}
        onUploadPicked={transfers.uploadHere}
      />

      {transfers.transfer !== null && (
        <TransferBanner
          progress={transfers.transfer}
          onCancel={transfers.cancelTransfer}
        />
      )}

      {showListing && (
        <FilterBar
          filter={filter}
          sort={sort}
          onFilter={setFilter}
          onSort={setSort}
          extensions={extensions}
          sizeValues={sizeVals}
          durationValues={durVals}
          indexing={filterActive && cloudIndex.loading}
          indexProgress={cloudIndex.progress}
          onCancelIndex={cloudIndex.cancel}
          onActivate={() => {
            setIndexEnabled(true);
          }}
        />
      )}

      {selectedEntries.length > 0 && (
        <SelectionBar
          count={selectedEntries.length}
          onMove={dialogs.openMove}
          onDownload={() => {
            transfers.downloadSelected(globalMode ? "/" : path, selectedEntries);
          }}
          onDelete={dialogs.openDeleteSelected}
          onClear={clearSelection}
        />
      )}

      <main
        className={`content${drop.osDragOver ? " content-drop" : ""}`}
        {...drop.handlers}
      >
        {loading && <p className="muted">Loading…</p>}
        {error !== null && <p className="error">Could not load: {error}</p>}

        {/* Global (whole-cloud) search: an active filter, once indexed. */}
        {showListing && filterActive && !cloudIndex.ready && (
          <p className="muted">Indexing the whole cloud…</p>
        )}
        {showListing && filterActive && cloudIndex.partial && (
          <p className="muted" aria-label="Partial index">
            ⚠
          </p>
        )}
        {showListing && filterActive && cloudIndex.ready && cloudIndex.error !== null && (
          <p className="error">Could not index the cloud: {cloudIndex.error}</p>
        )}
        {globalMode && groups.length === 0 && (
          <p className="muted">Nothing on the cloud matches your filters.</p>
        )}
        {globalMode && (
          <ResultGroups
            {...gridProps}
            groups={groups}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
          />
        )}

        {/* Folder browsing: no active filter. */}
        {showListing && !filterActive && entries.length === 0 && (
          <p className="muted">This folder is empty.</p>
        )}
        {showListing && !filterActive && entries.length > 0 && (
          <Grid
            {...gridProps}
            entries={visible}
            onMoveInto={mutations.moveInto}
            onUploadInto={transfers.uploadInto}
          />
        )}
      </main>

      <GalleryViewer
        client={client}
        meta={meta}
        media={media}
        siblings={displayed}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
      />
      <GalleryDialogs
        client={client}
        path={path}
        selectedCount={selectedEntries.length}
        dialogs={dialogs}
        mutations={mutations}
        reload={reload}
      />
      {dialogs.showNewFolder && (
        <PromptDialog
          title="New folder name"
          placeholder="Folder name"
          confirmLabel="Create"
          onConfirm={(name) => {
            dialogs.setShowNewFolder(false);
            mutations.createFolder(name);
          }}
          onCancel={() => {
            dialogs.setShowNewFolder(false);
          }}
        />
      )}
      {renameEntry && (
        <PromptDialog
          title={`Rename "${renameEntry.name}"`}
          placeholder="New name"
          confirmLabel="Rename"
          initialValue={renameEntry.name}
          onConfirm={(newName) => {
            setRenameEntry(null);
            mutations.renameSelected(renameEntry, newName);
          }}
          onCancel={() => {
            setRenameEntry(null);
          }}
        />
      )}
    </div>
  );
}
