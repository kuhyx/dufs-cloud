import type { DufsClient } from "../api/dufs-client.ts";
import { fileAt, makeClient } from "../test/client-fixtures.ts";
import { createMutations } from "./mutations.ts";

const a = fileAt("/a.txt");
const b = fileAt("/b.txt");

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

function setup(overrides: Partial<DufsClient> = {}) {
  const client = makeClient(overrides);
  const setBusy = vi.fn();
  const refreshAll = vi.fn();
  const clearSelection = vi.fn();
  const mutations = createMutations({
    client,
    getPath: () => "/dir",
    getSelectedEntries: () => [a, b],
    setBusy,
    refreshAll,
    clearSelection,
  });
  return { client, setBusy, refreshAll, clearSelection, mutations };
}

describe("moveInto", () => {
  it("does nothing when no path may move there", async () => {
    const { client, setBusy, mutations } = setup();
    mutations.moveInto("/Dest", ["/Dest/x.txt", "/Dest"]);
    await flush();
    expect(setBusy).not.toHaveBeenCalled();
    expect(client.move).not.toHaveBeenCalled();
  });

  it("moves only the movable paths, then clears and refreshes", async () => {
    const { client, setBusy, refreshAll, clearSelection, mutations } = setup();
    mutations.moveInto("/Dest", ["/a.txt", "/Dest/x.txt"]);
    expect(setBusy).toHaveBeenCalledWith("Moving 1 item(s)…");
    await flush();
    expect(client.move).toHaveBeenCalledExactlyOnceWith("/a.txt", "/Dest");
    expect(setBusy).toHaveBeenLastCalledWith(null);
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(refreshAll).toHaveBeenCalledOnce();
  });

  it("reports the error message and stops on failure", async () => {
    const { setBusy, refreshAll, mutations } = setup({
      move: vi.fn(() => Promise.reject(new Error("nope"))),
    });
    mutations.moveInto("/Dest", ["/a.txt"]);
    await flush();
    expect(setBusy).toHaveBeenLastCalledWith("nope");
    expect(refreshAll).not.toHaveBeenCalled();
  });
});

describe("non-Error rejections", () => {
  it("are stringified by move, rename and create", async () => {
    const reject = vi.fn().mockRejectedValue("odd") as DufsClient["createDir"];
    const { setBusy, mutations } = setup({
      move: reject,
      rename: reject,
      createDir: reject,
    });
    mutations.moveInto("/Dest", ["/a.txt"]);
    await flush();
    mutations.renameSelected(a, "c.txt");
    await flush();
    mutations.createFolder("New");
    await flush();
    expect(setBusy.mock.calls.filter(([m]) => m === "odd")).toHaveLength(3);
  });

  it("keep the Error message when moving the selection", async () => {
    const { setBusy, mutations } = setup({
      move: vi.fn(() => Promise.reject(new Error("busy"))),
    });
    mutations.moveSelected("/Dest");
    await flush();
    expect(setBusy).toHaveBeenLastCalledWith("busy");
  });
});

describe("confirmDelete", () => {
  it("removes the entry then refreshes", async () => {
    const { client, setBusy, refreshAll, mutations } = setup();
    mutations.confirmDelete(a);
    expect(setBusy).toHaveBeenCalledWith("Deleting a.txt…");
    await flush();
    expect(client.remove).toHaveBeenCalledWith("/a.txt");
    expect(setBusy).toHaveBeenLastCalledWith(null);
    expect(refreshAll).toHaveBeenCalledOnce();
  });

  it("reports a thrown Error and a non-Error rejection", async () => {
    const failing = setup({
      remove: vi.fn(() => Promise.reject(new Error("denied"))),
    });
    failing.mutations.confirmDelete(a);
    await flush();
    expect(failing.setBusy).toHaveBeenLastCalledWith("denied");
    const odd = setup({ remove: vi.fn().mockRejectedValue("plain") });
    odd.mutations.confirmDelete(a);
    await flush();
    expect(odd.setBusy).toHaveBeenLastCalledWith("plain");
    expect(odd.refreshAll).not.toHaveBeenCalled();
  });
});

describe("renameSelected", () => {
  it("renames then refreshes", async () => {
    const { client, setBusy, refreshAll, mutations } = setup();
    mutations.renameSelected(a, "c.txt");
    expect(setBusy).toHaveBeenCalledWith("Renaming a.txt…");
    await flush();
    expect(client.rename).toHaveBeenCalledWith("/a.txt", "c.txt");
    expect(setBusy).toHaveBeenLastCalledWith(null);
    expect(refreshAll).toHaveBeenCalledOnce();
  });

  it("reports the failure", async () => {
    const { setBusy, mutations } = setup({
      rename: vi.fn(() => Promise.reject(new Error("exists"))),
    });
    mutations.renameSelected(a, "c.txt");
    await flush();
    expect(setBusy).toHaveBeenLastCalledWith("exists");
  });
});

describe("createFolder", () => {
  it("creates under the current path then refreshes", async () => {
    const { client, setBusy, refreshAll, mutations } = setup();
    mutations.createFolder("New");
    expect(setBusy).toHaveBeenCalledWith("Creating New…");
    await flush();
    expect(client.createDir).toHaveBeenCalledWith("/dir/New");
    expect(setBusy).toHaveBeenLastCalledWith(null);
    expect(refreshAll).toHaveBeenCalledOnce();
  });

  it("reports the failure", async () => {
    const { setBusy, mutations } = setup({
      createDir: vi.fn(() => Promise.reject(new Error("forbidden"))),
    });
    mutations.createFolder("New");
    await flush();
    expect(setBusy).toHaveBeenLastCalledWith("forbidden");
  });
});

describe("moveSelected", () => {
  it("moves every selected entry, then clears and refreshes", async () => {
    const { client, setBusy, refreshAll, clearSelection, mutations } = setup();
    mutations.moveSelected("/Dest");
    expect(setBusy).toHaveBeenCalledWith("Moving 2 item(s)…");
    await flush();
    expect(client.move).toHaveBeenCalledTimes(2);
    expect(client.move).toHaveBeenCalledWith("/b.txt", "/Dest");
    expect(setBusy).toHaveBeenLastCalledWith(null);
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(refreshAll).toHaveBeenCalledOnce();
  });

  it("reports the failure and skips clear and refresh", async () => {
    const { setBusy, refreshAll, clearSelection, mutations } = setup({
      move: vi.fn().mockRejectedValue("boom"),
    });
    mutations.moveSelected("/Dest");
    await flush();
    expect(setBusy).toHaveBeenLastCalledWith("boom");
    expect(clearSelection).not.toHaveBeenCalled();
    expect(refreshAll).not.toHaveBeenCalled();
  });
});

describe("deleteSelected", () => {
  it("deletes all selected entries and clears the busy message", async () => {
    const { client, setBusy, refreshAll, clearSelection, mutations } = setup();
    mutations.deleteSelected();
    expect(setBusy).toHaveBeenCalledWith("Deleting 2 item(s)…");
    await flush();
    expect(client.remove).toHaveBeenCalledTimes(2);
    expect(setBusy).toHaveBeenLastCalledWith(null);
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(refreshAll).toHaveBeenCalledOnce();
  });

  it("counts failures but still deletes the rest", async () => {
    const remove = vi
      .fn<DufsClient["remove"]>()
      .mockRejectedValueOnce(new Error("locked"))
      .mockResolvedValue(undefined);
    const { setBusy, refreshAll, clearSelection, mutations } = setup({
      remove,
    });
    mutations.deleteSelected();
    await flush();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(setBusy).toHaveBeenLastCalledWith("1 item(s) could not be deleted");
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(refreshAll).toHaveBeenCalledOnce();
  });
});
