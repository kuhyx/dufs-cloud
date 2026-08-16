import { useMemo, useRef, useState } from "react";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import {
  basename,
  crumbs,
  isAudio,
  isImage,
  isPdf,
  isVideo,
  joinPath,
  movableInto,
  underPath,
} from "../lib/paths.ts";
import {
  applyFilterSort,
  DEFAULT_FILTER,
  DEFAULT_SORT,
  isFilterActive,
  type FilterState,
  type SortState,
} from "../lib/filter-sort.ts";
import {
  availableExtensions,
  durationValues,
  groupByFolder,
  sizeValues,
} from "../lib/cloud-stats.ts";
import { buildSelectionZip, saveBytes } from "../lib/download.ts";
import { useHashPath } from "../lib/use-hash-path.ts";
import { useListing } from "../hooks/use-listing.ts";
import { useMeta } from "../hooks/use-meta.ts";
import { useCloudIndex } from "../hooks/use-cloud-index.ts";
import { Grid } from "./grid.tsx";
import { FilterBar } from "./filter-bar.tsx";
import { MediaViewer } from "./media-viewer.tsx";
import { useSubtitleManifest } from "../hooks/use-subtitle-manifest.ts";
import { TextEditor } from "./text-editor.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { PromptDialog } from "./prompt-dialog.tsx";
import { FolderPicker } from "./folder-picker.tsx";

export function Gallery({ client }: { readonly client: DufsClient }): React.JSX.Element {
  const [path, navigate] = useHashPath();
  const { entries, loading, error, reload } = useListing(client, path);
  const meta = useMeta(client);
  // -1 means "no viewer open" (avoids a null branch in step()).
  const [viewerIndex, setViewerIndex] = useState(-1);
  const [editEntry, setEditEntry] = useState<DirEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<DirEntry | null>(null);
  const [renameEntry, setRenameEntry] = useState<DirEntry | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Last item clicked/tapped without a modifier — the range-select anchor.
  const [selectAnchor, setSelectAnchor] = useState<string | null>(null);
  // True while files from the OS hover the grid background, so the whole
  // content area can show it will accept the drop.
  const [osDragOver, setOsDragOver] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [showDeleteSelected, setShowDeleteSelected] = useState(false);
  // Folder groups the user has collapsed in the global-results view.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // The whole-cloud index powers global filtering; it is walked lazily the first
  // time the filter bar is touched, then cached (see useCloudIndex).
  const [indexEnabled, setIndexEnabled] = useState(false);
  const cloudIndex = useCloudIndex(client, indexEnabled);

  const filterActive = isFilterActive(filter);
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
  const selectedEntries = useMemo(
    () => displayed.filter((e) => selected.has(e.path)),
    [displayed, selected],
  );

  function clearSelection(): void {
    setSelected(new Set());
    setSelectAnchor(null);
  }

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

  function toggleCollapsed(folder: string): void {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
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

  // Grid only calls this for media entries, so the entry is always in `media`.
  function openMedia(entry: DirEntry): void {
    setViewerIndex(media.findIndex((m) => m.path === entry.path));
  }

  function step(delta: number): void {
    setViewerIndex((cur) => (cur + delta + media.length) % media.length);
  }

  function uploadInto(destDir: string, files: FileList | null): void {
    if (files === null || files.length === 0) return;
    setBusy(`Uploading ${files.length} file(s)…`);
    void (async () => {
      try {
        for (const file of Array.from(files)) {
          await client.upload(destDir, file);
        }
        refreshAll();
      } catch (err: unknown) {
        setBusy(err instanceof Error ? err.message : String(err));
        return;
      }
      setBusy(null);
    })();
  }

  function onUploadPicked(files: FileList | null): void {
    uploadInto(path, files);
  }

  // Drop of dragged entries onto a folder tile. Illegal drops (a folder onto
  // itself or into its own descendant, or an item already in the target) are
  // filtered out rather than reported — the drag simply does nothing.
  function moveInto(destDir: string, paths: readonly string[]): void {
    const movable = movableInto(paths, destDir);
    if (movable.length === 0) return;
    setBusy(`Moving ${movable.length} item(s)…`);
    void (async () => {
      try {
        for (const p of movable) {
          await client.move(p, destDir);
        }
      } catch (err: unknown) {
        setBusy(err instanceof Error ? err.message : String(err));
        return;
      }
      setBusy(null);
      clearSelection();
      refreshAll();
    })();
  }

  function confirmDelete(entry: DirEntry): void {
    setDeleteEntry(null);
    setBusy(`Deleting ${entry.name}…`);
    client
      .remove(entry.path)
      .then(() => {
        setBusy(null);
        refreshAll();
      })
      .catch((err: unknown) => {
        setBusy(err instanceof Error ? err.message : String(err));
      });
  }

  function renameSelected(entry: DirEntry, newName: string): void {
    setRenameEntry(null);
    setBusy(`Renaming ${entry.name}…`);
    client
      .rename(entry.path, newName)
      .then(() => {
        setBusy(null);
        refreshAll();
      })
      .catch((err: unknown) => {
        setBusy(err instanceof Error ? err.message : String(err));
      });
  }

  function createFolder(name: string): void {
    setShowNewFolder(false);
    setBusy(`Creating ${name}…`);
    client
      .createDir(joinPath(path, name))
      .then(() => {
        setBusy(null);
        refreshAll();
      })
      .catch((err: unknown) => {
        setBusy(err instanceof Error ? err.message : String(err));
      });
  }

  function moveSelected(destDir: string): void {
    setShowMove(false);
    setBusy(`Moving ${selectedEntries.length} item(s)…`);
    void (async () => {
      try {
        for (const entry of selectedEntries) {
          await client.move(entry.path, destDir);
        }
      } catch (err: unknown) {
        setBusy(err instanceof Error ? err.message : String(err));
        return;
      }
      setBusy(null);
      clearSelection();
      refreshAll();
    })();
  }

  function deleteSelected(): void {
    setShowDeleteSelected(false);
    const entries = selectedEntries;
    setBusy(`Deleting ${entries.length} item(s)…`);
    void (async () => {
      let failed = 0;
      for (const entry of entries) {
        try {
          await client.remove(entry.path);
        } catch {
          failed += 1;
        }
      }
      setBusy(failed > 0 ? `${failed} item(s) could not be deleted` : null);
      clearSelection();
      refreshAll();
    })();
  }

  function downloadSelected(): void {
    setBusy(`Preparing ${selectedEntries.length} item(s)…`);
    // Global results span folders, so their archive paths are relative to the
    // cloud root; a folder view zips relative to the folder itself.
    const zipBase = globalMode ? "/" : path;
    void (async () => {
      try {
        // Folders are gathered recursively and zipped in the browser: dufs's
        // server ?zip 404s for subfolders under render-spa (the prod config).
        const bytes = await buildSelectionZip(client, zipBase, selectedEntries);
        const base = basename(zipBase);
        saveBytes(bytes, `${base === "/" ? "cloud" : base}.zip`);
      } catch (err: unknown) {
        setBusy(err instanceof Error ? err.message : String(err));
        return;
      }
      setBusy(null);
      clearSelection();
    })();
  }

  const viewerEntry =
    viewerIndex >= 0 && viewerIndex < media.length ? media[viewerIndex] : null;
  const viewerSubtitlesPath = viewerEntry
    ? (meta[viewerEntry.path]?.subtitlesPath ?? null)
    : null;
  const subtitleManifest = useSubtitleManifest(client, viewerSubtitlesPath);
  const showListing = !loading && error === null;

  return (
    <div className="gallery">
      <header className="topbar">
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs(path).map((c, i, all) => (
            <span key={c.path}>
              <button
                type="button"
                className="crumb"
                onClick={() => {
                  go(c.path);
                }}
              >
                {c.name}
              </button>
              {i < all.length - 1 && <span className="crumb-sep">/</span>}
            </span>
          ))}
        </nav>
        <div className="tools">
          {busy !== null && <span className="busy">{busy}</span>}
          <button
            type="button"
            onClick={() => {
              setShowNewFolder(true);
            }}
          >
            New folder
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              fileInput.current?.click();
            }}
          >
            Upload
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              onUploadPicked(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </header>

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
          onActivate={() => {
            setIndexEnabled(true);
          }}
        />
      )}

      {selectedEntries.length > 0 && (
        <div className="selbar">
          <span className="sel-count">{selectedEntries.length} selected</span>
          <button
            type="button"
            onClick={() => {
              setShowMove(true);
            }}
          >
            Move
          </button>
          <button type="button" onClick={downloadSelected}>
            Download
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              setShowDeleteSelected(true);
            }}
          >
            Delete
          </button>
          <button type="button" onClick={clearSelection}>
            Clear
          </button>
        </div>
      )}

      <main
        className={`content${osDragOver ? " content-drop" : ""}`}
        // Files dragged in from the OS and dropped on empty grid space land in
        // the folder being viewed; a folder tile handles its own drop first
        // and stops the event from reaching here. Internal drags are ignored.
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOsDragOver(true);
        }}
        onDragLeave={(e) => {
          // Ignore the leave events fired while crossing child tiles.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setOsDragOver(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setOsDragOver(false);
          uploadInto(path, e.dataTransfer.files);
        }}
      >
        {loading && <p className="muted">Loading…</p>}
        {error !== null && <p className="error">Could not load: {error}</p>}

        {/* Global (whole-cloud) search: an active filter, once indexed. */}
        {showListing && filterActive && !cloudIndex.ready && (
          <p className="muted">Indexing the whole cloud…</p>
        )}
        {showListing && filterActive && cloudIndex.ready && cloudIndex.error !== null && (
          <p className="error">Could not index the cloud: {cloudIndex.error}</p>
        )}
        {globalMode && groups.length === 0 && (
          <p className="muted">Nothing on the cloud matches your filters.</p>
        )}
        {globalMode &&
          groups.map((group) => {
            const isCollapsed = collapsed.has(group.folder);
            return (
              <section key={group.folder} className="result-group">
                <div className="group-head">
                  <button
                    type="button"
                    className="group-toggle"
                    aria-label={
                      isCollapsed
                        ? `Expand ${group.folder}`
                        : `Collapse ${group.folder}`
                    }
                    aria-expanded={!isCollapsed}
                    onClick={() => {
                      toggleCollapsed(group.folder);
                    }}
                  >
                    {isCollapsed ? "▸" : "▾"}
                  </button>
                  <button
                    type="button"
                    className="group-path"
                    onClick={() => {
                      go(group.folder);
                    }}
                  >
                    📁 {group.folder}
                  </button>
                  <span className="group-count muted">
                    {group.entries.length}
                  </span>
                </div>
                {!isCollapsed && (
                  <Grid
                    client={client}
                    entries={group.entries}
                    selected={selected}
                    onToggleSelect={toggleSelect}
                    onOpenDir={go}
                    onOpenMedia={openMedia}
                    onEditText={setEditEntry}
                    onDelete={setDeleteEntry}
                    onRename={setRenameEntry}
                  />
                )}
              </section>
            );
          })}

        {/* Folder browsing: no active filter. */}
        {showListing && !filterActive && entries.length === 0 && (
          <p className="muted">This folder is empty.</p>
        )}
        {showListing && !filterActive && entries.length > 0 && (
          <Grid
            client={client}
            entries={visible}
            selected={selected}
            onToggleSelect={toggleSelect}
            onOpenDir={go}
            onOpenMedia={openMedia}
            onEditText={setEditEntry}
            onDelete={setDeleteEntry}
            onRename={setRenameEntry}
            onMoveInto={moveInto}
            onUploadInto={uploadInto}
          />
        )}
      </main>

      {viewerEntry && (
        <MediaViewer
          key={viewerEntry.path}
          entry={viewerEntry}
          url={client.fileUrl(
            meta[viewerEntry.path]?.proxyPath ?? viewerEntry.path,
          )}
          siblings={displayed}
          subtitlesPath={viewerSubtitlesPath}
          subtitleManifest={subtitleManifest}
          dashPath={meta[viewerEntry.path]?.dashPath ?? null}
          onClose={() => {
            setViewerIndex(-1);
          }}
          onPrev={() => {
            step(-1);
          }}
          onNext={() => {
            step(1);
          }}
        />
      )}
      {editEntry && (
        <TextEditor
          client={client}
          entry={editEntry}
          onClose={() => {
            setEditEntry(null);
            reload();
          }}
        />
      )}
      {deleteEntry && (
        <ConfirmDialog
          message={`Delete "${deleteEntry.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            confirmDelete(deleteEntry);
          }}
          onCancel={() => {
            setDeleteEntry(null);
          }}
        />
      )}
      {showDeleteSelected && (
        <ConfirmDialog
          message={`Delete ${selectedEntries.length} item(s)? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={deleteSelected}
          onCancel={() => {
            setShowDeleteSelected(false);
          }}
        />
      )}
      {showNewFolder && (
        <PromptDialog
          title="New folder name"
          placeholder="Folder name"
          confirmLabel="Create"
          onConfirm={createFolder}
          onCancel={() => {
            setShowNewFolder(false);
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
            renameSelected(renameEntry, newName);
          }}
          onCancel={() => {
            setRenameEntry(null);
          }}
        />
      )}
      {showMove && (
        <FolderPicker
          client={client}
          initialPath={path}
          count={selectedEntries.length}
          onPick={moveSelected}
          onCancel={() => {
            setShowMove(false);
          }}
        />
      )}
    </div>
  );
}
