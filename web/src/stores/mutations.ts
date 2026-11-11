import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { busyError, type Busy } from "../lib/busy.ts";
import { joinPath, movableInto } from "../lib/paths.ts";

export interface MutationDeps {
  readonly client: DufsClient;
  readonly getPath: () => string;
  readonly getSelectedEntries: () => readonly DirEntry[];
  readonly setBusy: (busy: Busy | null) => void;
  readonly refreshAll: () => void;
  readonly clearSelection: () => void;
}

export interface Mutations {
  readonly moveInto: (destDir: string, paths: readonly string[]) => void;
  readonly confirmDelete: (entry: DirEntry) => void;
  readonly renameSelected: (entry: DirEntry, newName: string) => void;
  readonly createFolder: (name: string) => void;
  readonly moveSelected: (destDir: string) => void;
  readonly deleteSelected: () => void;
}

const moving = (n: number): Busy => ({ kind: "move", spoken: `Moving ${n} item(s)…`, count: String(n) });

/** Stateless server-side edits (move/delete/rename/mkdir) reporting through
 * `setBusy`; path and selection are read when an action runs. */
export function createMutations({
  client,
  getPath,
  getSelectedEntries,
  setBusy,
  refreshAll,
  clearSelection,
}: MutationDeps): Mutations {
  // Drop of dragged entries onto a folder tile. Illegal drops (a folder onto
  // itself or into its own descendant, or an item already in the target) are
  // filtered out rather than reported — the drag simply does nothing.
  function moveInto(destDir: string, paths: readonly string[]): void {
    const movable = movableInto(paths, destDir);
    if (movable.length === 0) return;
    setBusy(moving(movable.length));
    void (async () => {
      try {
        for (const p of movable) {
          await client.move(p, destDir);
        }
      } catch (err: unknown) {
        setBusy(busyError(err));
        return;
      }
      setBusy(null);
      clearSelection();
      refreshAll();
    })();
  }

  // One server call for one entry: busy while it runs, refresh after.
  function single(busy: Busy, call: Promise<void>): void {
    setBusy(busy);
    call
      .then(() => {
        setBusy(null);
        refreshAll();
      })
      .catch((err: unknown) => {
        setBusy(busyError(err));
      });
  }

  function confirmDelete(entry: DirEntry): void {
    single(
      { kind: "delete", spoken: `Deleting ${entry.name}…`, name: entry.name },
      client.remove(entry.path),
    );
  }

  function renameSelected(entry: DirEntry, newName: string): void {
    single(
      { kind: "rename", spoken: `Renaming ${entry.name}…`, name: entry.name },
      client.rename(entry.path, newName),
    );
  }

  function createFolder(name: string): void {
    single(
      { kind: "create", spoken: `Creating ${name}…`, name },
      client.createDir(joinPath(getPath(), name)),
    );
  }

  function moveSelected(destDir: string): void {
    const selectedEntries = getSelectedEntries();
    setBusy(moving(selectedEntries.length));
    void (async () => {
      try {
        for (const entry of selectedEntries) {
          await client.move(entry.path, destDir);
        }
      } catch (err: unknown) {
        setBusy(busyError(err));
        return;
      }
      setBusy(null);
      clearSelection();
      refreshAll();
    })();
  }

  function deleteSelected(): void {
    const entries = getSelectedEntries();
    setBusy({ kind: "delete", spoken: `Deleting ${entries.length} item(s)…`, count: String(entries.length) });
    void (async () => {
      let failed = 0;
      for (const entry of entries) {
        try {
          await client.remove(entry.path);
        } catch {
          failed += 1;
        }
      }
      setBusy(
        failed > 0
          ? { kind: "failed", spoken: `${failed} item(s) could not be deleted`, count: String(failed) }
          : null,
      );
      clearSelection();
      refreshAll();
    })();
  }

  return {
    moveInto,
    confirmDelete,
    renameSelected,
    createFolder,
    moveSelected,
    deleteSelected,
  };
}
