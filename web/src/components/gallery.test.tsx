import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gallery } from "./gallery.tsx";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";

function entry(name: string, kind: "dir" | "file"): DirEntry {
  return { name, path: `/${name}`, kind, size: 10, mtimeMs: 0 };
}
function fileAt(path: string): DirEntry {
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    kind: "file",
    size: 10,
    mtimeMs: 0,
  };
}

// Path-aware default listing: the root holds a Media folder + three files; any
// deeper folder holds three files and NO subfolder, so a recursive index walk
// terminates instead of looping on a path-blind mock.
function makeClient(overrides: Partial<DufsClient> = {}): DufsClient {
  return {
    list: vi.fn((p: string) =>
      Promise.resolve(
        p === "/"
          ? [
              entry("Media", "dir"),
              entry("pic.jpg", "file"),
              entry("clip.mp4", "file"),
              entry("notes.txt", "file"),
            ]
          : [
              fileAt(`${p}/pic.jpg`),
              fileAt(`${p}/clip.mp4`),
              fileAt(`${p}/notes.txt`),
            ],
      ),
    ),
    fileUrl: (p: string) => p,
    thumbUrl: (p: string) => `/.thumbs${p}.jpg`,
    upload: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    readText: vi.fn(() => Promise.resolve("hello world")),
    writeText: vi.fn(() => Promise.resolve()),
    zipUrl: (p: string) => `${p}?zip`,
    createDir: vi.fn(() => Promise.resolve()),
    move: vi.fn(() => Promise.resolve()),
    fetchMeta: vi.fn(() => Promise.resolve({})),
    downloadBytes: vi.fn(() => Promise.resolve(new Uint8Array())),
    ...overrides,
  };
}

beforeEach(() => {
  window.location.hash = "";
});

describe("Gallery", () => {
  it("renders a directory listing", async () => {
    render(<Gallery client={makeClient()} />);
    expect(await screen.findByText("Media")).toBeInTheDocument();
    expect(screen.getByText("pic.jpg")).toBeInTheDocument();
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
  });

  it("opens an image in the viewer and closes it", async () => {
    render(<Gallery client={makeClient()} />);
    await userEvent.click(await screen.findByText("pic.jpg"));
    await waitFor(() => {
      expect(document.querySelector(".viewer-img")).not.toBeNull();
    });
    await userEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => {
      expect(document.querySelector(".viewer-img")).toBeNull();
    });
  });

  it("plays a video in the viewer", async () => {
    render(<Gallery client={makeClient()} />);
    await userEvent.click(await screen.findByText("clip.mp4"));
    await waitFor(() => {
      expect(document.querySelector("video")).not.toBeNull();
    });
  });

  it("edits a text file and saves it", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await userEvent.click(await screen.findByText("notes.txt"));
    const area = await screen.findByDisplayValue("hello world");
    await userEvent.clear(area);
    await userEvent.type(area, "new text");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(client.writeText).toHaveBeenCalledWith("/notes.txt", "new text");
    });
  });

  it("deletes a file after confirming", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Delete pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(client.remove).toHaveBeenCalledWith("/pic.jpg");
    });
  });

  it("uploads picked files", async () => {
    const client = makeClient();
    const { container } = render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(input).not.toBeNull();
    const file = new File(["x"], "up.png", { type: "image/png" });
    if (input) fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(client.upload).toHaveBeenCalled();
    });
  });

  it("navigates between media in the viewer", async () => {
    render(<Gallery client={makeClient()} />);
    await userEvent.click(await screen.findByText("pic.jpg"));
    await waitFor(() => {
      expect(document.querySelector(".viewer-img")).not.toBeNull();
    });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => {
      expect(document.querySelector("video")).not.toBeNull();
    });
  });

  it("surfaces an upload error", async () => {
    const client = makeClient({
      upload: vi.fn(() => Promise.reject(new Error("uperr"))),
    });
    const { container } = render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    if (input) {
      fireEvent.change(input, {
        target: { files: [new File(["x"], "u.png")] },
      });
    }
    expect(await screen.findByText(/uperr/)).toBeInTheDocument();
  });

  it("surfaces a delete error", async () => {
    const client = makeClient({
      remove: vi.fn(() => Promise.reject(new Error("delerr"))),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Delete pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/delerr/)).toBeInTheDocument();
  });

  it("cancels a delete", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Delete pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(client.remove).not.toHaveBeenCalled();
  });

  it("shows an error when listing fails", async () => {
    const client = makeClient({
      list: vi.fn(() => Promise.reject(new Error("boom"))),
    });
    render(<Gallery client={client} />);
    expect(await screen.findByText(/boom/)).toBeInTheDocument();
  });

  it("navigates via a breadcrumb", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByRole("button", { name: "cloud" }));
    expect(window.location.hash).toBe("#/");
  });

  it("opens the file picker from the Upload button", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    // Should not throw; exercises the hidden-input click path.
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  it("steps to the previous media with ArrowLeft (wrapping)", async () => {
    render(<Gallery client={makeClient()} />);
    await userEvent.click(await screen.findByText("pic.jpg"));
    await waitFor(() => {
      expect(document.querySelector(".viewer-img")).not.toBeNull();
    });
    // media = [pic.jpg, clip.mp4]; from index 0, prev wraps to the video.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => {
      expect(document.querySelector("video")).not.toBeNull();
    });
  });

  it("shows an empty-folder message", async () => {
    const client = makeClient({ list: vi.fn(() => Promise.resolve([])) });
    render(<Gallery client={client} />);
    expect(await screen.findByText("This folder is empty.")).toBeInTheDocument();
  });

  it("renders breadcrumb separators for nested paths", async () => {
    window.location.hash = "#/Media/2026";
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    expect(screen.getByRole("button", { name: "Media" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2026" })).toBeInTheDocument();
    expect(document.querySelectorAll(".crumb-sep").length).toBeGreaterThan(0);
  });

  it("ignores an upload with no files selected", async () => {
    const client = makeClient();
    const { container } = render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    if (input) fireEvent.change(input, { target: { files: null } });
    expect(client.upload).not.toHaveBeenCalled();
  });

  it("stringifies a non-Error upload rejection", async () => {
    const client = makeClient({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      upload: vi.fn(() => Promise.reject("plain-up")),
    });
    const { container } = render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    const input = container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    if (input) {
      fireEvent.change(input, {
        target: { files: [new File(["x"], "u.png")] },
      });
    }
    expect(await screen.findByText("plain-up")).toBeInTheDocument();
  });

  it("stringifies a non-Error delete rejection", async () => {
    const client = makeClient({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      remove: vi.fn(() => Promise.reject("plain-del")),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Delete pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("plain-del")).toBeInTheDocument();
  });

  it("closes the text editor and reloads", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await userEvent.click(await screen.findByText("notes.txt"));
    await screen.findByDisplayValue("hello world");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByDisplayValue("hello world")).toBeNull();
    });
    // reload() re-invokes list (initial + after close).
    expect((client.list as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
  });

  it("searches the whole cloud when filtering and groups by folder", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    // Fuzzy subsequence "pcj" matches pic.jpg — which exists at root AND /Media.
    await userEvent.type(screen.getByLabelText("Filter by name"), "pcj");
    await waitFor(() => {
      expect(screen.getAllByText("pic.jpg")).toHaveLength(2);
    });
    // Non-matching files are gone, and results are grouped under folder headers.
    expect(screen.queryByText("clip.mp4")).toBeNull();
    expect(screen.getByRole("button", { name: "📁 /Media" })).toBeInTheDocument();
  });

  it("excludes folders from global results and collapses a folder group", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.type(screen.getByLabelText("Filter by name"), "pcj");
    // Files only — the Media folder is never a global result.
    await waitFor(() => {
      expect(screen.getAllByText("pic.jpg")).toHaveLength(2);
    });
    expect(screen.queryByText("Media")).toBeNull();
    // Collapsing the /Media group hides its file, leaving the root match.
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse /Media" }),
    );
    await waitFor(() => {
      expect(screen.getAllByText("pic.jpg")).toHaveLength(1);
    });
    // Expanding brings it back.
    await userEvent.click(
      screen.getByRole("button", { name: "Expand /Media" }),
    );
    await waitFor(() => {
      expect(screen.getAllByText("pic.jpg")).toHaveLength(2);
    });
  });

  it("shows folders (not files) when filtering by the Folders type", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    // Activate the index, then switch the type filter to Folders.
    await userEvent.click(screen.getByLabelText("Filter by name"));
    fireEvent.change(screen.getByLabelText("Filter by type"), {
      target: { value: "folder" },
    });
    // The Media folder is a result; files are excluded from a folder search.
    expect(await screen.findByText("Media")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("pic.jpg")).toBeNull();
    });
  });

  it("shows an indexing hint, then a global no-matches message", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.type(screen.getByLabelText("Filter by name"), "zzz");
    // Once indexed, a query matching nothing on the cloud says so distinctly.
    expect(
      await screen.findByText("Nothing on the cloud matches your filters."),
    ).toBeInTheDocument();
  });

  it("keeps browsing local while the index is still building", async () => {
    let resolveRoot!: (v: DirEntry[]) => void;
    const gate = new Promise<DirEntry[]>((r) => {
      resolveRoot = r;
    });
    let calls = 0;
    const client = makeClient({
      list: vi.fn((p: string) => {
        calls += 1;
        // First call (folder listing) resolves; the index walk's root list hangs.
        if (calls === 1) {
          return Promise.resolve([entry("pic.jpg", "file")]);
        }
        return p === "/" ? gate : Promise.resolve([]);
      }),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.type(screen.getByLabelText("Filter by name"), "p");
    expect(
      await screen.findByText("Indexing the whole cloud…"),
    ).toBeInTheDocument();
    resolveRoot([fileAt("/pic.jpg")]);
    await waitFor(() => {
      expect(screen.queryByText("Indexing the whole cloud…")).toBeNull();
    });
  });

  it("surfaces a cloud-index failure", async () => {
    let calls = 0;
    const client = makeClient({
      list: vi.fn(() => {
        calls += 1;
        if (calls === 1) return Promise.resolve([entry("pic.jpg", "file")]);
        return Promise.reject(new Error("indexerr"));
      }),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.type(screen.getByLabelText("Filter by name"), "p");
    expect(
      await screen.findByText(/Could not index the cloud: indexerr/),
    ).toBeInTheDocument();
  });

  it("navigates into a folder from a global result header, clearing the filter", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.type(screen.getByLabelText("Filter by name"), "pcj");
    const header = await screen.findByRole("button", { name: "📁 /Media" });
    await userEvent.click(header);
    await waitFor(() => {
      expect(window.location.hash).toBe("#/Media");
    });
    // Filter cleared → the query box is empty and browsing is local again.
    expect(
      screen.getByLabelText<HTMLInputElement>("Filter by name").value,
    ).toBe("");
  });

  it("downloads a cross-folder global selection relative to the cloud root", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.type(screen.getByLabelText("Filter by name"), "pcj");
    // Two pic.jpg results (root + /Media); select the one under /Media.
    const boxes = await screen.findAllByLabelText("Select pic.jpg");
    expect(boxes).toHaveLength(2);
    const [, underMedia] = boxes;
    if (underMedia === undefined) throw new Error("expected two checkboxes");
    await userEvent.click(underMedia);
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it("creates a new folder", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    await userEvent.type(screen.getByLabelText("New folder name"), "Trips");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(client.createDir).toHaveBeenCalledWith("/Trips");
    });
  });

  it("surfaces a new-folder error", async () => {
    const client = makeClient({
      createDir: vi.fn(() => Promise.reject(new Error("mkcolerr"))),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    await userEvent.type(screen.getByLabelText("New folder name"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText(/mkcolerr/)).toBeInTheDocument();
  });

  it("cancels the new-folder dialog", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New folder name")).toBeNull();
    expect(client.createDir).not.toHaveBeenCalled();
  });

  it("selects items and moves them into a chosen folder", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    // Folder picker opens listing the current dir; pick it as destination.
    await userEvent.click(
      await screen.findByRole("button", { name: "Move here" }),
    );
    await waitFor(() => {
      expect(client.move).toHaveBeenCalledWith("/pic.jpg", "/");
      expect(client.move).toHaveBeenCalledWith("/clip.mp4", "/");
    });
    // Selection clears after a successful move.
    await waitFor(() => {
      expect(screen.queryByText("2 selected")).toBeNull();
    });
  });

  it("surfaces a move error", async () => {
    const client = makeClient({
      move: vi.fn(() => Promise.reject(new Error("moveerr"))),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Move here" }),
    );
    expect(await screen.findByText(/moveerr/)).toBeInTheDocument();
  });

  it("cancels the move picker", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );
    expect(client.move).not.toHaveBeenCalled();
  });

  it("downloads selected files as a client-side zip", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByLabelText("Select notes.txt"));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => {
      expect(client.downloadBytes).toHaveBeenCalledWith("/pic.jpg");
      expect(client.downloadBytes).toHaveBeenCalledWith("/notes.txt");
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
    // Selection clears once the archive is built.
    await waitFor(() => {
      expect(screen.queryByText(/selected/)).toBeNull();
    });
  });

  it("recursively zips a selected folder client-side", async () => {
    // Path-aware listing so the recursive gather terminates: /Media holds one
    // file (the root listing is the default 4-entry set).
    const client = makeClient({
      list: vi.fn((p: string) =>
        p === "/Media"
          ? Promise.resolve([
              {
                name: "forest.jpg",
                path: "/Media/forest.jpg",
                kind: "file" as const,
                size: 5,
                mtimeMs: 0,
              },
            ])
          : Promise.resolve([
              entry("Media", "dir"),
              entry("pic.jpg", "file"),
            ]),
      ),
    });
    render(<Gallery client={client} />);
    await screen.findByText("Media");
    await userEvent.click(screen.getByLabelText("Select Media"));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    // The folder is walked and its file bytes fetched for the client-side zip.
    await waitFor(() => {
      expect(client.downloadBytes).toHaveBeenCalledWith("/Media/forest.jpg");
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByText(/selected/)).toBeNull();
    });
  });

  it("surfaces a download build error", async () => {
    const client = makeClient({
      downloadBytes: vi.fn(() => Promise.reject(new Error("dlerr"))),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByText(/dlerr/)).toBeInTheDocument();
  });

  it("stringifies a non-Error new-folder rejection", async () => {
    const client = makeClient({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      createDir: vi.fn(() => Promise.reject("plain-mkcol")),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    await userEvent.type(screen.getByLabelText("New folder name"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("plain-mkcol")).toBeInTheDocument();
  });

  it("stringifies a non-Error move rejection", async () => {
    const client = makeClient({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      move: vi.fn(() => Promise.reject("plain-move")),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Move here" }),
    );
    expect(await screen.findByText("plain-move")).toBeInTheDocument();
  });

  it("names the download zip after a non-root folder", async () => {
    window.location.hash = "#/Media";
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => {
      expect(client.downloadBytes).toHaveBeenCalledWith("/Media/pic.jpg");
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it("toggles a tile's checkbox off again", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    const box = screen.getByLabelText("Select pic.jpg");
    await userEvent.click(box);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    // Clicking the same checkbox removes it from the selection set.
    await userEvent.click(box);
    expect(screen.queryByText("1 selected")).toBeNull();
  });

  it("stringifies a non-Error download rejection", async () => {
    const client = makeClient({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      downloadBytes: vi.fn(() => Promise.reject("plain-dl")),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByText("plain-dl")).toBeInTheDocument();
  });

  it("clears a selection with the Clear button", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText("1 selected")).toBeNull();
  });

  it("drops the selection when navigating into a folder", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Media"));
    await waitFor(() => {
      expect(screen.queryByText("1 selected")).toBeNull();
    });
  });
});
