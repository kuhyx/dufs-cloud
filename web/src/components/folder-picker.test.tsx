import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderPicker } from "./folder-picker.tsx";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";

function dir(name: string, parent = ""): DirEntry {
  return { name, path: `${parent}/${name}`, kind: "dir", size: 0, mtimeMs: 0 };
}
function fileEntry(name: string): DirEntry {
  return { name, path: `/${name}`, kind: "file", size: 1, mtimeMs: 0 };
}

function makeClient(list: DufsClient["list"]): DufsClient {
  return {
    list: vi.fn(list),
    fileUrl: (p: string) => p,
    thumbUrl: (p: string) => p,
    zipUrl: (p: string) => `${p}?zip`,
    upload: vi.fn(),
    remove: vi.fn(),
    createDir: vi.fn(),
    move: vi.fn(),
    rename: vi.fn(),
    readText: vi.fn(),
    writeText: vi.fn(),
    fetchMeta: vi.fn(() => Promise.resolve({})),
    downloadBytes: vi.fn(() => Promise.resolve(new Uint8Array())),
  };
}

function renderPicker(client: DufsClient, initialPath = "/Media") {
  const onPick = vi.fn();
  const onCancel = vi.fn();
  const { unmount } = render(
    <FolderPicker
      client={client}
      initialPath={initialPath}
      count={2}
      onPick={onPick}
      onCancel={onCancel}
    />,
  );
  return { onPick, onCancel, unmount };
}

describe("FolderPicker", () => {
  it("lists only folders and picks the current directory", async () => {
    const client = makeClient(() =>
      Promise.resolve([dir("2026", "/Media"), fileEntry("stray.jpg")]),
    );
    const { onPick } = renderPicker(client);
    expect(await screen.findByText("📁 2026")).toBeInTheDocument();
    // The file is filtered out of a folder picker.
    expect(screen.queryByText("stray.jpg")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Move here" }));
    expect(onPick).toHaveBeenCalledWith("/Media");
  });

  it("descends into a subfolder and steps back up", async () => {
    const client = makeClient((p) =>
      p === "/Media"
        ? Promise.resolve([dir("2026", "/Media")])
        : Promise.resolve([dir("07", "/Media/2026")]),
    );
    const { onPick } = renderPicker(client);
    await userEvent.click(await screen.findByText("📁 2026"));
    // Now inside /Media/2026, "Move here" would target it.
    expect(await screen.findByText("📁 07")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Move here" }));
    expect(onPick).toHaveBeenLastCalledWith("/Media/2026");
    // The ".." row climbs back to /Media.
    await userEvent.click(screen.getByText("📁 .."));
    await waitFor(() => {
      expect(screen.getByText("📁 2026")).toBeInTheDocument();
    });
  });

  it("hides the up row at the root", async () => {
    const client = makeClient(() => Promise.resolve([dir("Media", "")]));
    renderPicker(client, "/");
    await screen.findByText("📁 Media");
    expect(screen.queryByText("📁 ..")).toBeNull();
  });

  it("shows an empty message when there are no subfolders", async () => {
    const client = makeClient(() => Promise.resolve([]));
    renderPicker(client);
    expect(await screen.findByText("No subfolders.")).toBeInTheDocument();
  });

  it("surfaces a load error (Error and non-Error)", async () => {
    const err = makeClient(() => Promise.reject(new Error("nope")));
    renderPicker(err);
    expect(await screen.findByText(/nope/)).toBeInTheDocument();

    const plain = makeClient(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject("boom-string"),
    );
    renderPicker(plain);
    expect(await screen.findByText(/boom-string/)).toBeInTheDocument();
  });

  it("cancels via the button", async () => {
    const client = makeClient(() => Promise.resolve([]));
    const { onCancel } = renderPicker(client);
    await screen.findByText("No subfolders.");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("ignores a listing that resolves after unmount", async () => {
    let resolve!: (v: DirEntry[]) => void;
    const pending = new Promise<DirEntry[]>((r) => {
      resolve = r;
    });
    const client = makeClient(() => pending);
    const { unmount } = renderPicker(client);
    unmount();
    resolve([dir("Late", "/Media")]);
    await pending;
    // No throw / act warning: the cancelled guard swallowed the late settle.
    expect(screen.queryByText("📁 Late")).toBeNull();
  });
});
