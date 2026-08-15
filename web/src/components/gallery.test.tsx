import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  createEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gallery } from "./gallery.tsx";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { meta as makeMeta } from "../test/meta.ts";

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
    rename: vi.fn(() => Promise.resolve()),
    fetchMeta: vi.fn(() => Promise.resolve({})),
    fetchSubtitleManifest: vi.fn(() => Promise.resolve(null)),
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

  it("plays a video's proxy in preference to the original when indexed", async () => {
    const client = makeClient({
      fetchMeta: vi.fn(() =>
        Promise.resolve({
          "/clip.mp4": makeMeta({ proxyPath: "/.proxies/clip.mp4.mp4" }),
        }),
      ),
    });
    render(<Gallery client={client} />);
    await userEvent.click(await screen.findByText("clip.mp4"));
    await waitFor(() => {
      const video = document.querySelector("video");
      expect(video).not.toBeNull();
      expect(video?.getAttribute("src")).toBe("/.proxies/clip.mp4.mp4");
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

  it("renames a file, pre-filled with its current name", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Rename pic.jpg"));
    const input = screen.getByLabelText('Rename "pic.jpg"');
    expect(input).toHaveValue("pic.jpg");
    await userEvent.clear(input);
    await userEvent.type(input, "renamed.jpg");
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => {
      expect(client.rename).toHaveBeenCalledWith("/pic.jpg", "renamed.jpg");
    });
  });

  it("cancels a rename", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Rename pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(client.rename).not.toHaveBeenCalled();
  });

  it("surfaces a rename error", async () => {
    const client = makeClient({
      rename: vi.fn(() => Promise.reject(new Error("renameerr"))),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Rename pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(await screen.findByText(/renameerr/)).toBeInTheDocument();
  });

  it("stringifies a non-Error rename rejection", async () => {
    const client = makeClient({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      rename: vi.fn(() => Promise.reject("plain-rename")),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Rename pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(await screen.findByText("plain-rename")).toBeInTheDocument();
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

  it("shift-clicks a checkbox to range-select from the anchor", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    // Sorted (dirs first, then name asc): Media, clip.mp4, notes.txt, pic.jpg.
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    fireEvent.click(screen.getByLabelText("Select pic.jpg"), {
      shiftKey: true,
    });
    // clip.mp4..pic.jpg inclusive = clip.mp4, notes.txt, pic.jpg (not Media).
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(
      screen.getByLabelText<HTMLInputElement>("Select clip.mp4").checked,
    ).toBe(true);
    expect(
      screen.getByLabelText<HTMLInputElement>("Select notes.txt").checked,
    ).toBe(true);
    expect(
      screen.getByLabelText<HTMLInputElement>("Select Media").checked,
    ).toBe(false);
  });

  it("renders the box you just clicked as checked, not only its neighbours",
    async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    // Regression: cancelling the click to read modifier keys desynced the
    // input from React's value tracker, so the clicked box alone rendered
    // unchecked while the app counted it as selected.
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(
      screen.getByLabelText<HTMLInputElement>("Select clip.mp4").checked,
    ).toBe(true);
    // Same for the shift-clicked endpoint, which is the other clicked box.
    fireEvent.click(screen.getByLabelText("Select pic.jpg"), {
      shiftKey: true,
    });
    expect(
      screen.getByLabelText<HTMLInputElement>("Select pic.jpg").checked,
    ).toBe(true);
    // And unchecking again must clear it rather than stick.
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    expect(
      screen.getByLabelText<HTMLInputElement>("Select pic.jpg").checked,
    ).toBe(false);
  });

  it("re-anchors on each shift-click, so a later one ranges from there", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    // Anchor -> pic.jpg. Range pic.jpg..clip.mp4 adds notes.txt + clip.mp4.
    fireEvent.click(screen.getByLabelText("Select clip.mp4"), {
      shiftKey: true,
    });
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    // Anchor is now clip.mp4 (not pic.jpg): ranging to Media only adds
    // Media itself, since clip.mp4..Media already covers what's selected.
    fireEvent.click(screen.getByLabelText("Select Media"), {
      shiftKey: true,
    });
    expect(screen.getByText("4 selected")).toBeInTheDocument();
  });

  it("falls back to a plain toggle when the anchor scrolled out of view", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    // Filtering clip.mp4 out of view invalidates it as a range endpoint;
    // the shift-click below must fall back to a plain toggle of notes.txt
    // instead of throwing or ranging against a stale index.
    await userEvent.type(screen.getByLabelText("Filter by name"), "notes");
    const notesBoxes = await screen.findAllByLabelText(
      "Select notes.txt",
      {},
      { timeout: 3000 },
    );
    const notesBox = notesBoxes.at(0);
    expect(notesBox).toBeDefined();
    if (notesBox) fireEvent.click(notesBox, { shiftKey: true });
    // clip.mp4 is still selected in state but no longer displayed, so the
    // visible count only reflects notes.txt (displayed ∩ selected).
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("plain click still just toggles one item after a shift-click", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    fireEvent.click(screen.getByLabelText("Select pic.jpg"), {
      shiftKey: true,
    });
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Select notes.txt"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
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

  it("selects items and deletes them after confirming", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete 2 item(s)?");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => {
      expect(client.remove).toHaveBeenCalledWith("/pic.jpg");
      expect(client.remove).toHaveBeenCalledWith("/clip.mp4");
    });
    // Selection clears after a successful bulk delete.
    await waitFor(() => {
      expect(screen.queryByText("2 selected")).toBeNull();
    });
  });

  it("cancelling the bulk-delete confirm does nothing", async () => {
    const client = makeClient();
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(client.remove).not.toHaveBeenCalled();
  });

  it("reports how many items failed to delete in a bulk delete", async () => {
    const client = makeClient({
      remove: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("nope")),
    });
    render(<Gallery client={client} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    await userEvent.click(screen.getByLabelText("Select clip.mp4"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByText("1 item(s) could not be deleted"),
      ).toBeInTheDocument();
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
  describe("drag and drop", () => {
    function transfer(over = {}) {
      const store = new Map<string, string>();
      return {
        types: [] as string[],
        files: [] as unknown as FileList,
        dropEffect: "",
        effectAllowed: "",
        setData: (t: string, v: string) => store.set(t, v),
        getData: (t: string) => store.get(t) ?? "",
        ...over,
      };
    }

    function tileFor(name: string): HTMLElement {
      const tile = screen.getByText(name).closest("li");
      if (tile === null) throw new Error(`no tile for ${name}`);
      return tile;
    }

    it("moves dropped entries into the folder tile they landed on", async () => {
      const client = makeClient();
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      const dt = transfer();
      fireEvent.dragStart(tileFor("pic.jpg"), { dataTransfer: dt });
      fireEvent.drop(tileFor("Media"), { dataTransfer: dt });
      await waitFor(() => {
        expect(client.move).toHaveBeenCalledWith("/pic.jpg", "/Media");
      });
    });

    it("moves the whole selection and clears it afterwards", async () => {
      const client = makeClient();
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      await userEvent.click(screen.getByLabelText("Select pic.jpg"));
      await userEvent.click(screen.getByLabelText("Select notes.txt"));
      expect(screen.getByText("2 selected")).toBeInTheDocument();
      const dt = transfer();
      fireEvent.dragStart(tileFor("pic.jpg"), { dataTransfer: dt });
      fireEvent.drop(tileFor("Media"), { dataTransfer: dt });
      await waitFor(() => {
        expect(client.move).toHaveBeenCalledWith("/pic.jpg", "/Media");
      });
      expect(client.move).toHaveBeenCalledWith("/notes.txt", "/Media");
      await waitFor(() => {
        expect(screen.queryByText("2 selected")).toBeNull();
      });
    });

    it("refuses to drop a folder into itself", async () => {
      const client = makeClient();
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      const dt = transfer();
      fireEvent.dragStart(tileFor("Media"), { dataTransfer: dt });
      fireEvent.drop(tileFor("Media"), { dataTransfer: dt });
      await waitFor(() => {
        expect(screen.getByText("pic.jpg")).toBeInTheDocument();
      });
      expect(client.move).not.toHaveBeenCalled();
    });

    it("reports a failed move in the busy banner", async () => {
      const client = makeClient({
        move: vi.fn(() => Promise.reject(new Error("nope"))),
      });
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      const dt = transfer();
      fireEvent.dragStart(tileFor("pic.jpg"), { dataTransfer: dt });
      fireEvent.drop(tileFor("Media"), { dataTransfer: dt });
      expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("stringifies a non-Error move rejection", async () => {
      const client = makeClient({
        // Some rejections are not Errors (e.g. a bare string from a
        // third-party layer); the banner must still say something useful.
        move: vi.fn(
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the point of the test is a non-Error rejection
          () => Promise.reject("plain string"),
        ),
      });
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      const dt = transfer();
      fireEvent.dragStart(tileFor("pic.jpg"), { dataTransfer: dt });
      fireEvent.drop(tileFor("Media"), { dataTransfer: dt });
      expect(await screen.findByText("plain string")).toBeInTheDocument();
    });

    it("uploads OS files dropped on empty grid space into the current folder", async () => {
      const client = makeClient();
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      const main = document.querySelector("main.content");
      if (main === null) throw new Error("no main");
      const file = new File(["x"], "a.txt");
      const files = [file] as unknown as FileList;
      fireEvent.dragOver(main, { dataTransfer: transfer({ types: ["Files"] }) });
      expect(main).toHaveClass("content-drop");
      fireEvent.drop(main, {
        dataTransfer: transfer({ types: ["Files"], files }),
      });
      await waitFor(() => {
        expect(client.upload).toHaveBeenCalledWith("/", file);
      });
    });

    it("ignores our own drag over the grid background", async () => {
      render(<Gallery client={makeClient()} />);
      await screen.findByText("pic.jpg");
      const main = document.querySelector("main.content");
      if (main === null) throw new Error("no main");
      fireEvent.dragOver(main, { dataTransfer: transfer() });
      expect(main).not.toHaveClass("content-drop");
      // A drop with no files must not start an upload either.
      fireEvent.drop(main, { dataTransfer: transfer() });
      expect(main).not.toHaveClass("content-drop");
    });

    it("keeps the highlight while crossing child tiles, clearing on real exit", async () => {
      render(<Gallery client={makeClient()} />);
      await screen.findByText("pic.jpg");
      const main = document.querySelector("main.content");
      if (main === null) throw new Error("no main");
      fireEvent.dragOver(main, { dataTransfer: transfer({ types: ["Files"] }) });
      // relatedTarget is read-only on the event prototype, so fireEvent's
      // property bag cannot set it -- define it on the event directly.
      const leaveTowards = (target: Node): void => {
        const ev = createEvent.dragLeave(main);
        Object.defineProperty(ev, "relatedTarget", { value: target });
        fireEvent(main, ev);
      };
      // Leaving towards a child tile is not a real exit.
      leaveTowards(tileFor("pic.jpg"));
      expect(main).toHaveClass("content-drop");
      // Leaving the content area entirely clears it.
      leaveTowards(document.body);
      expect(main).not.toHaveClass("content-drop");
    });

    it("uploads OS files dropped on a folder tile into that folder", async () => {
      const client = makeClient();
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      const file = new File(["x"], "b.txt");
      const files = [file] as unknown as FileList;
      fireEvent.drop(tileFor("Media"), {
        dataTransfer: transfer({ types: ["Files"], files }),
      });
      await waitFor(() => {
        expect(client.upload).toHaveBeenCalledWith("/Media", file);
      });
    });
  });
});
