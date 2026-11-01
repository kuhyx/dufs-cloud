import type { DufsClient } from "../api/dufs-client.ts";
import type { GalleryDialogState } from "../hooks/use-gallery-dialogs.ts";
import type { Mutations } from "../hooks/use-mutations.ts";
import { TextEditor } from "./text-editor.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { FolderPicker } from "./folder-picker.tsx";

interface GalleryDialogsProps {
  readonly client: DufsClient;
  readonly path: string;
  readonly selectedCount: number;
  readonly dialogs: GalleryDialogState;
  readonly mutations: Mutations;
  readonly reload: () => void;
}

/** Text editor, delete confirmations and the move picker. */
export function GalleryDialogs({
  client,
  path,
  selectedCount,
  dialogs,
  mutations,
  reload,
}: GalleryDialogsProps): React.JSX.Element {
  const { editEntry, deleteEntry } = dialogs;
  return (
    <>
      {editEntry && (
        <TextEditor
          client={client}
          entry={editEntry}
          onClose={() => {
            dialogs.setEditEntry(null);
            reload();
          }}
        />
      )}
      {deleteEntry && (
        <ConfirmDialog
          message={`Delete "${deleteEntry.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            dialogs.setDeleteEntry(null);
            mutations.confirmDelete(deleteEntry);
          }}
          onCancel={() => {
            dialogs.setDeleteEntry(null);
          }}
        />
      )}
      {dialogs.showDeleteSelected && (
        <ConfirmDialog
          message={`Delete ${selectedCount} item(s)? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            dialogs.setShowDeleteSelected(false);
            mutations.deleteSelected();
          }}
          onCancel={() => {
            dialogs.setShowDeleteSelected(false);
          }}
        />
      )}
      {dialogs.showMove && (
        <FolderPicker
          client={client}
          initialPath={path}
          count={selectedCount}
          onPick={(destDir) => {
            dialogs.setShowMove(false);
            mutations.moveSelected(destDir);
          }}
          onCancel={() => {
            dialogs.setShowMove(false);
          }}
        />
      )}
    </>
  );
}
