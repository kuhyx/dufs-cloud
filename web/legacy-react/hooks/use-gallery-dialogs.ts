import { useState } from "react";
import type { DirEntry } from "../api/types.ts";

export interface GalleryDialogState {
  readonly editEntry: DirEntry | null;
  readonly setEditEntry: (entry: DirEntry | null) => void;
  readonly deleteEntry: DirEntry | null;
  readonly setDeleteEntry: (entry: DirEntry | null) => void;
  readonly renameEntry: DirEntry | null;
  readonly setRenameEntry: (entry: DirEntry | null) => void;
  readonly showNewFolder: boolean;
  readonly setShowNewFolder: (show: boolean) => void;
  readonly showMove: boolean;
  readonly setShowMove: (show: boolean) => void;
  readonly showDeleteSelected: boolean;
  readonly setShowDeleteSelected: (show: boolean) => void;
  readonly openNewFolder: () => void;
  readonly openMove: () => void;
  readonly openDeleteSelected: () => void;
}

/** Which modal (edit/delete/rename/new-folder/move) is currently open. */
export function useGalleryDialogs(): GalleryDialogState {
  const [editEntry, setEditEntry] = useState<DirEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<DirEntry | null>(null);
  const [renameEntry, setRenameEntry] = useState<DirEntry | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [showDeleteSelected, setShowDeleteSelected] = useState(false);

  function openNewFolder(): void {
    setShowNewFolder(true);
  }

  function openMove(): void {
    setShowMove(true);
  }

  function openDeleteSelected(): void {
    setShowDeleteSelected(true);
  }

  return {
    editEntry,
    setEditEntry,
    deleteEntry,
    setDeleteEntry,
    renameEntry,
    setRenameEntry,
    showNewFolder,
    setShowNewFolder,
    showMove,
    setShowMove,
    showDeleteSelected,
    setShowDeleteSelected,
    openNewFolder,
    openMove,
    openDeleteSelected,
  };
}
