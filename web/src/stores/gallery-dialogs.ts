import type { DirEntry } from "../api/types.ts";
import { createStore, type Readable } from "./store.ts";

/** Which modal (edit/delete/rename/new-folder/move) is currently open. */
export interface GalleryDialogState {
  readonly editEntry: DirEntry | null;
  readonly deleteEntry: DirEntry | null;
  readonly renameEntry: DirEntry | null;
  readonly showNewFolder: boolean;
  readonly showMove: boolean;
  readonly showDeleteSelected: boolean;
}

export interface GalleryDialogs extends Readable<GalleryDialogState> {
  setEditEntry: (entry: DirEntry | null) => void;
  setDeleteEntry: (entry: DirEntry | null) => void;
  setRenameEntry: (entry: DirEntry | null) => void;
  setShowNewFolder: (show: boolean) => void;
  setShowMove: (show: boolean) => void;
  setShowDeleteSelected: (show: boolean) => void;
  openNewFolder: () => void;
  openMove: () => void;
  openDeleteSelected: () => void;
  dispose: () => void;
}

export function createGalleryDialogs(): GalleryDialogs {
  const store = createStore<GalleryDialogState>({
    editEntry: null,
    deleteEntry: null,
    renameEntry: null,
    showNewFolder: false,
    showMove: false,
    showDeleteSelected: false,
  });
  const patch = (change: Partial<GalleryDialogState>): void => {
    store.setState((cur) => ({ ...cur, ...change }));
  };
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    setEditEntry: (editEntry) => {
      patch({ editEntry });
    },
    setDeleteEntry: (deleteEntry) => {
      patch({ deleteEntry });
    },
    setRenameEntry: (renameEntry) => {
      patch({ renameEntry });
    },
    setShowNewFolder: (showNewFolder) => {
      patch({ showNewFolder });
    },
    setShowMove: (showMove) => {
      patch({ showMove });
    },
    setShowDeleteSelected: (showDeleteSelected) => {
      patch({ showDeleteSelected });
    },
    openNewFolder: () => {
      patch({ showNewFolder: true });
    },
    openMove: () => {
      patch({ showMove: true });
    },
    openDeleteSelected: () => {
      patch({ showDeleteSelected: true });
    },
    dispose: () => undefined,
  };
}
