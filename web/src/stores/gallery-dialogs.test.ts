import { fileAt } from "../test/client-fixtures.ts";
import { createGalleryDialogs } from "./gallery-dialogs.ts";

describe("createGalleryDialogs", () => {
  it("starts closed and patches one field per setter", () => {
    const dialogs = createGalleryDialogs();
    const e = fileAt("/a.txt");
    expect(dialogs.getState()).toEqual({
      editEntry: null,
      deleteEntry: null,
      renameEntry: null,
      showNewFolder: false,
      showMove: false,
      showDeleteSelected: false,
    });
    dialogs.setEditEntry(e);
    dialogs.setDeleteEntry(e);
    dialogs.setRenameEntry(e);
    dialogs.setShowNewFolder(true);
    dialogs.setShowMove(true);
    dialogs.setShowDeleteSelected(true);
    expect(dialogs.getState()).toEqual({
      editEntry: e,
      deleteEntry: e,
      renameEntry: e,
      showNewFolder: true,
      showMove: true,
      showDeleteSelected: true,
    });
    dialogs.setEditEntry(null);
    expect(dialogs.getState().editEntry).toBeNull();
    expect(dialogs.getState().showMove).toBe(true);
  });

  it("opens the three flag dialogs", () => {
    const dialogs = createGalleryDialogs();
    dialogs.openNewFolder();
    expect(dialogs.getState().showNewFolder).toBe(true);
    dialogs.openMove();
    expect(dialogs.getState().showMove).toBe(true);
    dialogs.openDeleteSelected();
    expect(dialogs.getState().showDeleteSelected).toBe(true);
    dialogs.dispose();
  });
});
