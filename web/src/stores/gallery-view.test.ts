import type { DirEntry } from "../api/types.ts";
import { DEFAULT_FILTER, DEFAULT_SORT } from "../lib/filter-sort.ts";
import { entry, fileAt } from "../test/client-fixtures.ts";
import type { CloudIndexState } from "./cloud-index.ts";
import { createGalleryView, type ViewInput } from "./gallery-view.ts";

const media = entry("Media", "dir");
const pic = fileAt("/Media/pic.jpg");
const clip = fileAt("/Media/clip.mp4");
const doc = fileAt("/Media/doc.pdf");
const song = fileAt("/Media/song.mp3");
const notes = fileAt("/Media/notes.txt");
const away = fileAt("/Other/away.jpg");
const cloudEntries: readonly DirEntry[] = [
  media,
  pic,
  clip,
  doc,
  song,
  notes,
  away,
];

const readyIndex: CloudIndexState = {
  entries: cloudEntries,
  loading: false,
  ready: true,
  error: null,
  progress: { folders: 0, entries: 0, path: "" },
  partial: false,
};

const folderInput: ViewInput = {
  entries: [pic, notes],
  meta: {},
  filter: DEFAULT_FILTER,
  sort: DEFAULT_SORT,
  filterActive: false,
  cloudIndex: readyIndex,
  path: "/Media",
};

const names = (list: readonly DirEntry[]): string[] => list.map((e) => e.name);

describe("createGalleryView folder mode", () => {
  it("shows the folder listing and only its viewable media", () => {
    const view = createGalleryView(folderInput);
    const state = view.getState();
    expect(state.globalMode).toBe(false);
    expect(names(state.displayed)).toEqual(["notes.txt", "pic.jpg"]);
    expect(names(state.media)).toEqual(["pic.jpg"]);
    expect(state.groups).toEqual([]);
    expect(state.extensions).toEqual(
      expect.arrayContaining(["jpg", "mp4", "pdf", "mp3", "txt"]),
    );
    view.dispose();
  });

  it("stays in folder mode while the index is not ready or has failed", () => {
    const loading = createGalleryView({
      ...folderInput,
      filterActive: true,
      cloudIndex: { ...readyIndex, ready: false },
    });
    expect(loading.getState().globalMode).toBe(false);
    const failed = createGalleryView({
      ...folderInput,
      filterActive: true,
      cloudIndex: { ...readyIndex, error: "offline" },
    });
    expect(failed.getState().globalMode).toBe(false);
  });
});

describe("createGalleryView global mode", () => {
  const globalInput: ViewInput = { ...folderInput, filterActive: true };

  it("searches the cloud files under the current path", () => {
    const state = createGalleryView(globalInput).getState();
    expect(state.globalMode).toBe(true);
    expect(names(state.displayed)).toEqual([
      "clip.mp4",
      "doc.pdf",
      "notes.txt",
      "pic.jpg",
      "song.mp3",
    ]);
    expect(names(state.media)).toEqual([
      "clip.mp4",
      "doc.pdf",
      "pic.jpg",
      "song.mp3",
    ]);
    expect(state.groups.length).toBeGreaterThan(0);
  });

  it("searches the whole cloud from the root", () => {
    const state = createGalleryView({ ...globalInput, path: "/" }).getState();
    expect(names(state.displayed)).toContain("away.jpg");
  });

  it("pools folders instead of files for the folder type filter", () => {
    const state = createGalleryView({
      ...globalInput,
      path: "/",
      filter: { ...DEFAULT_FILTER, type: "folder" },
    }).getState();
    expect(names(state.displayed)).toEqual(["Media"]);
  });
});

describe("createGalleryView updates", () => {
  it("keeps the same state and stays silent for identical inputs", () => {
    const view = createGalleryView(folderInput);
    const before = view.getState();
    const listener = vi.fn();
    view.subscribe(listener);
    view.update({ ...folderInput });
    expect(view.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("recomputes only what changed and notifies once", () => {
    const view = createGalleryView(folderInput);
    const before = view.getState();
    const listener = vi.fn();
    view.subscribe(listener);
    view.update({ ...folderInput, entries: [pic] });
    const after = view.getState();
    expect(listener).toHaveBeenCalledOnce();
    expect(names(after.displayed)).toEqual(["pic.jpg"]);
    expect(after.extensions).toBe(before.extensions);
    expect(after.groups).toBe(before.groups);
    expect(after.sizeVals).toBe(before.sizeVals);
  });
});
