import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Grid } from "./grid.tsx";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";

/** The subset of DataTransfer the drag handlers touch. */
interface FakeTransfer {
  types: string[];
  files: FileList;
  dropEffect: string;
  effectAllowed: string;
  setData: (type: string, value: string) => void;
  getData: (type: string) => string;
}

function entry(name: string, kind: "dir" | "file"): DirEntry {
  return { name, path: `/${name}`, kind, size: 42, mtimeMs: 0 };
}

function makeClient(): DufsClient {
  return {
    list: vi.fn(),
    fileUrl: (p: string) => p,
    thumbUrl: (p: string) => `/.thumbs${p}.jpg`,
    upload: vi.fn(),
    remove: vi.fn(),
    readText: vi.fn(),
    writeText: vi.fn(),
    zipUrl: (p: string) => `${p}?zip`,
    createDir: vi.fn(),
    move: vi.fn(),
    rename: vi.fn(),
    fetchMeta: vi.fn(() => Promise.resolve({})),
    fetchSubtitleManifest: vi.fn(() => Promise.resolve(null)),
    downloadBytes: vi.fn(() => Promise.resolve(new Uint8Array())),
  };
}

const entries: DirEntry[] = [
  entry("Media", "dir"),
  entry("pic.jpg", "file"),
  entry("clip.mp4", "file"),
  entry("notes.txt", "file"),
  entry("data.bin", "file"),
  entry("doc.pdf", "file"),
  entry("song.mp3", "file"),
];

function renderGrid(over: Partial<Parameters<typeof Grid>[0]> = {}) {
  const props = {
    client: makeClient(),
    entries,
    selected: new Set<string>(),
    onToggleSelect: vi.fn(),
    onOpenDir: vi.fn(),
    onOpenMedia: vi.fn(),
    onEditText: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    ...over,
  };
  render(<Grid {...props} />);
  return props;
}

describe("Grid", () => {
  it("activates dir, media and text entries via their tiles", async () => {
    const onOpenDir = vi.fn();
    const onOpenMedia = vi.fn();
    const onEditText = vi.fn();
    renderGrid({ onOpenDir, onOpenMedia, onEditText });
    await userEvent.click(screen.getByText("Media"));
    await userEvent.click(screen.getByText("pic.jpg"));
    await userEvent.click(screen.getByText("notes.txt"));
    // Non-media, non-text file does nothing on activate.
    await userEvent.click(screen.getByText("data.bin"));
    await userEvent.click(screen.getByText("doc.pdf"));
    await userEvent.click(screen.getByText("song.mp3"));
    expect(onOpenDir).toHaveBeenCalledWith("/Media");
    expect(onOpenMedia).toHaveBeenCalledWith(entries[1]);
    expect(onEditText).toHaveBeenCalledWith(entries[3]);
    expect(onOpenMedia).toHaveBeenCalledWith(entries[5]);
    expect(onOpenMedia).toHaveBeenCalledWith(entries[6]);
  });

  it("shows distinct icons for PDF and audio tiles", () => {
    renderGrid();
    expect(screen.getByText("📕")).toBeInTheDocument();
    expect(screen.getByText("🎵")).toBeInTheDocument();
  });

  it("renders a download link, a rename button and a delete button for files", async () => {
    const onDelete = vi.fn();
    const onRename = vi.fn();
    renderGrid({ onDelete, onRename });
    const download = screen.getByLabelText("Download pic.jpg");
    expect(download).toHaveAttribute("href", "/pic.jpg");
    await userEvent.click(screen.getByLabelText("Rename pic.jpg"));
    expect(onRename).toHaveBeenCalledWith(entries[1]);
    await userEvent.click(screen.getByLabelText("Delete pic.jpg"));
    expect(onDelete).toHaveBeenCalledWith(entries[1]);
  });

  it("toggles selection and marks selected tiles", async () => {
    const onToggleSelect = vi.fn();
    renderGrid({ selected: new Set(["/pic.jpg"]), onToggleSelect });
    // A selected entry reports checked and carries the highlight class.
    const picBox = screen.getByLabelText<HTMLInputElement>("Select pic.jpg");
    expect(picBox.checked).toBe(true);
    expect(picBox.closest(".tile")).toHaveClass("tile-selected");
    // Clicking another tile's checkbox reports it back to the parent.
    await userEvent.click(screen.getByLabelText("Select Media"));
    expect(onToggleSelect).toHaveBeenCalledWith(entries[0], false);
  });

  it("reports shift-click so the caller can range-select", () => {
    const onToggleSelect = vi.fn();
    renderGrid({ onToggleSelect });
    fireEvent.click(screen.getByLabelText("Select clip.mp4"), {
      shiftKey: true,
    });
    expect(onToggleSelect).toHaveBeenCalledWith(entries[2], true);
  });

  describe("drag and drop", () => {
    // jsdom has no DataTransfer, so stand in with the slice the handlers use.
    function transfer(over: Partial<FakeTransfer> = {}): FakeTransfer {
      const store = new Map<string, string>();
      return {
        types: [],
        files: [] as unknown as FileList,
        dropEffect: "",
        effectAllowed: "",
        setData: (type: string, value: string) => store.set(type, value),
        getData: (type: string) => store.get(type) ?? "",
        ...over,
      };
    }

    function tileFor(name: string): HTMLElement {
      const tile = screen.getByText(name).closest("li");
      if (tile === null) throw new Error(`no tile for ${name}`);
      return tile;
    }

    it("is off entirely when no drop handlers are supplied", () => {
      renderGrid();
      expect(tileFor("Media").draggable).toBe(false);
    });

    it("drags just the entry when it is not part of the selection", () => {
      renderGrid({ onMoveInto: vi.fn(), selected: new Set(["/notes.txt"]) });
      const dt = transfer();
      fireEvent.dragStart(tileFor("pic.jpg"), { dataTransfer: dt });
      expect(dt.getData("application/x-dufs-paths")).toBe('["/pic.jpg"]');
    });

    it("drags the whole selection when the dragged entry is selected", () => {
      renderGrid({
        onMoveInto: vi.fn(),
        selected: new Set(["/pic.jpg", "/notes.txt"]),
      });
      const dt = transfer();
      fireEvent.dragStart(tileFor("pic.jpg"), { dataTransfer: dt });
      expect(
        JSON.parse(dt.getData("application/x-dufs-paths")) as string[],
      ).toEqual(["/pic.jpg", "/notes.txt"]);
    });

    it("highlights only a folder tile under the drag, and clears on leave", () => {
      renderGrid({ onMoveInto: vi.fn() });
      const folder = tileFor("Media");
      fireEvent.dragOver(folder, { dataTransfer: transfer() });
      expect(folder).toHaveClass("tile-drop");
      fireEvent.dragLeave(folder);
      expect(folder).not.toHaveClass("tile-drop");
      // A file tile is not a drop target at all.
      const file = tileFor("pic.jpg");
      fireEvent.dragOver(file, { dataTransfer: transfer() });
      expect(file).not.toHaveClass("tile-drop");
    });

    it("shows a copy cursor for OS files and a move cursor for our own drag", () => {
      renderGrid({ onMoveInto: vi.fn() });
      const osDrag = transfer({ types: ["Files"] });
      fireEvent.dragOver(tileFor("Media"), { dataTransfer: osDrag });
      expect(osDrag.dropEffect).toBe("copy");
      const ourDrag = transfer();
      fireEvent.dragOver(tileFor("Media"), { dataTransfer: ourDrag });
      expect(ourDrag.dropEffect).toBe("move");
    });

    it("drops dragged entries onto a folder as a move", () => {
      const onMoveInto = vi.fn();
      renderGrid({ onMoveInto });
      const dt = transfer();
      dt.setData("application/x-dufs-paths", '["/pic.jpg","/notes.txt"]');
      fireEvent.drop(tileFor("Media"), { dataTransfer: dt });
      expect(onMoveInto).toHaveBeenCalledWith("/Media", [
        "/pic.jpg",
        "/notes.txt",
      ]);
    });

    it("drops OS files onto a folder as an upload into it", () => {
      const onUploadInto = vi.fn();
      const onMoveInto = vi.fn();
      const files = [new File(["x"], "a.txt")] as unknown as FileList;
      renderGrid({ onUploadInto, onMoveInto });
      fireEvent.drop(tileFor("Media"), {
        dataTransfer: transfer({ files, types: ["Files"] }),
      });
      expect(onUploadInto).toHaveBeenCalledWith("/Media", files);
      expect(onMoveInto).not.toHaveBeenCalled();
    });

    it("ignores a drop carrying nothing we understand", () => {
      const onMoveInto = vi.fn();
      renderGrid({ onMoveInto });
      // Empty payload, and a payload that is neither JSON nor an array.
      fireEvent.drop(tileFor("Media"), { dataTransfer: transfer() });
      const bad = transfer();
      bad.setData("application/x-dufs-paths", "not json");
      fireEvent.drop(tileFor("Media"), { dataTransfer: bad });
      const notArray = transfer();
      notArray.setData("application/x-dufs-paths", '{"nope":1}');
      fireEvent.drop(tileFor("Media"), { dataTransfer: notArray });
      // Non-string members are filtered out rather than passed through.
      const mixed = transfer();
      mixed.setData("application/x-dufs-paths", '["/pic.jpg",7]');
      fireEvent.drop(tileFor("Media"), { dataTransfer: mixed });
      expect(onMoveInto).toHaveBeenCalledTimes(1);
      expect(onMoveInto).toHaveBeenCalledWith("/Media", ["/pic.jpg"]);
    });

    it("clears the highlight once the drop lands", () => {
      renderGrid({ onMoveInto: vi.fn() });
      const folder = tileFor("Media");
      fireEvent.dragOver(folder, { dataTransfer: transfer() });
      expect(folder).toHaveClass("tile-drop");
      fireEvent.drop(folder, { dataTransfer: transfer() });
      expect(folder).not.toHaveClass("tile-drop");
    });
  });

  it("falls back to an icon when a thumbnail fails to load", () => {
    renderGrid();
    // Image thumbnail breaks -> picture fallback glyph.
    fireEvent.error(screen.getByAltText("pic.jpg"));
    expect(screen.getByText("🖼")).toBeInTheDocument();
    // Video thumbnail breaks -> film fallback glyph.
    fireEvent.error(screen.getByAltText("clip.mp4"));
    expect(screen.getByText("🎞")).toBeInTheDocument();
  });
});
