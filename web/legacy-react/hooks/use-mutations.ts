import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { joinPath, movableInto } from "../lib/paths.ts";

interface MutationDeps {
  readonly client: DufsClient;
  readonly path: string;
  readonly selectedEntries: readonly DirEntry[];
  readonly setBusy: (message: string | null) => void;
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

/** Server-side edits (move/delete/rename/mkdir) reporting through `setBusy`. */
export function useMutations({
  client,
  path,
  selectedEntries,
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

  return {
    moveInto,
    confirmDelete,
    renameSelected,
    createFolder,
    moveSelected,
    deleteSelected,
  };
}
