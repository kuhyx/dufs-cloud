import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import type { DirEntry } from "../api/types.ts";
import { entry, fileAt, makeClient } from "../test/client-fixtures.ts";
import { CloudGrid } from "./grid.ts";
import { DRAG_TYPE, draggedPaths } from "./grid-tile.ts";

function mount(entries: readonly DirEntry[], selected: string[] = [], drag = true): CloudGrid {
  const grid = document.createElement("cloud-grid") as CloudGrid;
  grid.client = makeClient();
  grid.entries = entries;
  grid.selected = new Set(selected);
  grid.dragEnabled = drag;
  document.body.append(grid);
  return grid;
}

function listen(el: Element, type: string): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  el.addEventListener(type, (e) => {
    fn((e as CustomEvent).detail);
  });
  return fn;
}

interface FakeDt {
  types: string[];
  files: { length: number };
  dropEffect: string;
  effectAllowed: string;
  data: Record<string, string>;
  setData: (t: string, v: string) => void;
  getData: (t: string) => string;
}

function fakeDt(types: string[] = [], files = 0, data: Record<string, string> = {}): FakeDt {
  return {
    types,
    files: { length: files },
    dropEffect: "",
    effectAllowed: "",
    data,
    setData(t, v) {
      this.data[t] = v;
    },
    getData(t) {
      return this.data[t] ?? "";
    },
  };
}

function drag(el: Element, type: string, dt?: FakeDt): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  if (dt) Object.defineProperty(ev, "dataTransfer", { value: dt });
  el.dispatchEvent(ev);
  return ev;
}

const tileOf = (name: string): HTMLElement =>
  screen.getByLabelText(`Select ${name}`).closest("li") as HTMLElement;

afterEach(() => {
  document.body.replaceChildren();
});

describe("cloud-grid tiles", () => {
  it("renders an icon per type, a play badge on videos and sizes on files", () => {
    mount([
      entry("Media", "dir"),
      entry("pic.jpg", "file"),
      entry("clip.mp4", "file"),
      entry("doc.pdf", "file"),
      entry("song.mp3", "file"),
      entry("notes.txt", "file"),
      entry("blob.bin", "file"),
    ]);
    expect(tileOf("Media")).toHaveClass("tile", "tile-dir");
    expect(within(tileOf("Media")).getByText("📁")).toHaveClass("tile-icon");
    expect(within(tileOf("Media")).queryByLabelText("Delete Media")).toBeNull();
    expect(within(tileOf("pic.jpg")).getByAltText("pic.jpg")).toHaveAttribute(
      "src",
      "/.thumbs/pic.jpg.jpg",
    );
    expect(within(tileOf("clip.mp4")).getByText("▶")).toHaveClass("play-badge");
    expect(within(tileOf("doc.pdf")).getByText("📕")).toBeInTheDocument();
    expect(within(tileOf("song.mp3")).getByText("🎵")).toBeInTheDocument();
    expect(within(tileOf("notes.txt")).getByText("📝")).toBeInTheDocument();
    expect(within(tileOf("blob.bin")).getByText("📄")).toBeInTheDocument();
    expect(tileOf("blob.bin").querySelector(".tile-size")).not.toBeNull();
    expect(screen.getByLabelText("Download blob.bin")).toHaveAttribute("href", "/blob.bin");
    expect(tileOf("blob.bin")).toHaveAttribute("draggable", "true");
  });

  it("falls back to an emoji when a thumbnail fails", () => {
    mount([entry("pic.jpg", "file"), entry("clip.mp4", "file")]);
    fireEvent.error(screen.getByAltText("pic.jpg"));
    fireEvent.error(screen.getByAltText("clip.mp4"));
    expect(within(tileOf("pic.jpg")).getByText("🖼")).toHaveClass("thumb-fallback");
    expect(within(tileOf("clip.mp4")).getByText("🎞")).toBeInTheDocument();
  });

  it("fires open/edit/rename/delete events", async () => {
    const user = userEvent.setup();
    const files = [
      entry("Media", "dir"),
      entry("pic.jpg", "file"),
      entry("notes.txt", "file"),
      entry("blob.bin", "file"),
    ];
    const grid = mount(files);
    const openDir = listen(grid, "open-dir");
    const openMedia = listen(grid, "open-media");
    const edit = listen(grid, "edit-text");
    const rename = listen(grid, "rename");
    const del = listen(grid, "delete");
    const main = (n: string): HTMLElement => screen.getByTitle(n);
    await user.click(main("Media"));
    await user.click(main("pic.jpg"));
    await user.click(main("notes.txt"));
    await user.click(main("blob.bin"));
    await user.click(screen.getByLabelText("Rename blob.bin"));
    await user.click(screen.getByLabelText("Delete notes.txt"));
    expect(openDir).toHaveBeenCalledWith("/Media");
    expect(openMedia).toHaveBeenCalledWith(files[1]);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(edit).toHaveBeenCalledWith(files[2]);
    expect(rename).toHaveBeenCalledWith(files[3]);
    expect(del).toHaveBeenCalledWith(files[2]);
  });

  it("reports checkbox clicks with shift and re-renders the selection in place", async () => {
    const user = userEvent.setup();
    const files = [entry("a.txt", "file"), entry("b.txt", "file")];
    const grid = mount(files);
    const toggle = listen(grid, "toggle-select");
    await user.click(screen.getByLabelText("Select a.txt"));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByLabelText("Select b.txt"));
    await user.keyboard("{/Shift}");
    expect(toggle).toHaveBeenNthCalledWith(1, { entry: files[0], shiftKey: false });
    expect(toggle).toHaveBeenNthCalledWith(2, { entry: files[1], shiftKey: true });
    const before = tileOf("a.txt");
    grid.selected = new Set(["/a.txt"]);
    expect(tileOf("a.txt")).toBe(before);
    expect(before).toHaveClass("tile-selected");
    expect(screen.getByLabelText("Select a.txt")).toBeChecked();
    expect(screen.getByLabelText("Select b.txt")).not.toBeChecked();
    expect(grid.selected.has("/a.txt")).toBe(true);
    expect(grid.entries).toBe(files);
    expect(grid.dragEnabled).toBe(true);
    expect(grid.client).not.toBeNull();
  });

  it("does nothing until a client is set", () => {
    const grid = document.createElement("cloud-grid") as CloudGrid;
    grid.entries = [entry("a.txt", "file")];
    document.body.append(grid);
    document.body.append(grid);
    expect(grid.querySelectorAll("li")).toHaveLength(0);
    expect(grid.querySelectorAll("ul")).toHaveLength(1);
  });
});

describe("cloud-grid drag and drop", () => {
  it("drags the whole selection from a selected tile, else just itself", () => {
    mount([entry("a.txt", "file"), entry("b.txt", "file")], ["/a.txt", "/x"]);
    const sel = fakeDt();
    drag(tileOf("a.txt"), "dragstart", sel);
    expect(JSON.parse(sel.data[DRAG_TYPE] ?? "")).toEqual(["/a.txt", "/x"]);
    expect(sel.effectAllowed).toBe("move");
    const one = fakeDt();
    drag(tileOf("b.txt"), "dragstart", one);
    expect(JSON.parse(one.data[DRAG_TYPE] ?? "")).toEqual(["/b.txt"]);
  });

  it("highlights a folder under the pointer and picks copy for OS files", () => {
    mount([entry("Media", "dir")]);
    const files = fakeDt(["Files"]);
    const ev = drag(tileOf("Media"), "dragover", files);
    expect(ev.defaultPrevented).toBe(true);
    expect(files.dropEffect).toBe("copy");
    expect(tileOf("Media")).toHaveClass("tile-drop");
    const moving = fakeDt([DRAG_TYPE]);
    drag(tileOf("Media"), "dragover", moving);
    expect(moving.dropEffect).toBe("move");
    drag(tileOf("Media"), "dragleave");
    expect(tileOf("Media")).not.toHaveClass("tile-drop");
  });

  it("uploads dropped files and moves dropped paths into the folder", () => {
    const grid = mount([entry("Media", "dir")]);
    const upload = listen(grid, "upload-into");
    const move = listen(grid, "move-into");
    const bg = vi.fn();
    document.body.addEventListener("drop", bg);
    const files = fakeDt(["Files"], 2);
    const ev = drag(tileOf("Media"), "drop", files);
    expect(ev.defaultPrevented).toBe(true);
    expect(bg).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledWith({ destDir: "/Media", files: files.files });
    drag(tileOf("Media"), "drop", fakeDt([], 0, { [DRAG_TYPE]: '["/a.txt"]' }));
    expect(move).toHaveBeenCalledWith({ destDir: "/Media", paths: ["/a.txt"] });
    drag(tileOf("Media"), "drop", fakeDt([], 0, { [DRAG_TYPE]: "[]" }));
    drag(tileOf("Media"), "drop", fakeDt());
    expect(move).toHaveBeenCalledTimes(1);
    document.body.removeEventListener("drop", bg);
  });

  it("ignores drops on files, with drag disabled, or without a dataTransfer", () => {
    const grid = mount([entry("Media", "dir"), fileAt("/f.txt")], [], false);
    const upload = listen(grid, "upload-into");
    expect(tileOf("Media")).toHaveAttribute("draggable", "false");
    for (const name of ["Media", "f.txt"]) {
      expect(drag(tileOf(name), "dragover", fakeDt(["Files"])).defaultPrevented).toBe(false);
      drag(tileOf(name), "dragleave");
      drag(tileOf(name), "drop", fakeDt(["Files"], 1));
    }
    grid.dragEnabled = true;
    drag(tileOf("Media"), "dragover");
    drag(tileOf("Media"), "drop");
    drag(tileOf("Media"), "dragstart");
    expect(upload).not.toHaveBeenCalled();
    expect(tileOf("Media")).not.toHaveClass("tile-drop");
  });

  it("parses only string arrays from the drag payload", () => {
    expect(draggedPaths('["/a", 3, "/b"]')).toEqual(["/a", "/b"]);
    expect(draggedPaths('{"a":1}')).toEqual([]);
    expect(draggedPaths("not json")).toEqual([]);
  });

  it("rebuilds tiles when the client changes", () => {
    const grid = mount([entry("a.txt", "file")]);
    const before = tileOf("a.txt");
    grid.client = makeClient();
    expect(tileOf("a.txt")).not.toBe(before);
    expect(customElements.get("cloud-grid")).toBe(CloudGrid);
  });
});
