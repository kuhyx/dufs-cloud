import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeClient, entry, fileAt } from "../test/client-fixtures.ts";
import { DEFAULT_FILTER } from "../lib/filter-sort.ts";
import { deferred, flush } from "../test/store-helpers.ts";
import { createGalleryState, type GalleryState } from "./gallery-state.ts";
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import type { CueRun } from "../lib/completion-cue.ts";

function fakeCue() {
  const succeeded = vi.fn<() => void>();
  return { begin: vi.fn<() => CueRun>(() => ({ succeeded })), succeeded };
}

function files(...names: string[]): FileList {
  return names.map((n) => new File(["x"], n)) as unknown as FileList;
}

let st: GalleryState | null = null;
function make(client: DufsClient, cue = fakeCue()): { st: GalleryState; cue: ReturnType<typeof fakeCue> } {
  st = createGalleryState(client, vi.fn(), cue);
  return { st, cue };
}

describe("gallery state completion cue", () => {
  beforeEach(() => {
    window.location.hash = "";
  });
  afterEach(() => {
    st?.dispose();
  });

  it("cues a successful upload once, ignoring the start-of-transfer busy reset", async () => {
    const { st: s, cue } = make(makeClient());
    s.uploadInto("/", files("a.txt"));
    expect(cue.begin).toHaveBeenCalledTimes(1);
    expect(cue.succeeded).not.toHaveBeenCalled();
    await flush();
    expect(cue.succeeded).toHaveBeenCalledTimes(1);
  });

  it("stays silent for empty, failed or cancelled uploads", async () => {
    const pending = deferred<undefined>();
    const client = makeClient({
      upload: vi.fn(() => pending.promise),
    });
    const { st: s, cue } = make(client);
    s.uploadInto("/", null);
    s.uploadInto("/", files());
    expect(cue.begin).not.toHaveBeenCalled();
    s.uploadInto("/", files("a.txt"));
    s.cancelTransfer();
    pending.reject(new DOMException("aborted", "AbortError"));
    await flush();
    const failing = make(makeClient({ upload: vi.fn(() => Promise.reject(new Error("x"))) }));
    failing.st.uploadInto("/", files("b.txt"));
    await flush();
    expect(cue.succeeded).not.toHaveBeenCalled();
    expect(failing.cue.succeeded).not.toHaveBeenCalled();
    expect(failing.st.snapshot().busy?.spoken).toBe("1 of 1 failed: b.txt");
  });

  it("cues a finished zip download but not a failed one", async () => {
    const { st: s, cue } = make(makeClient());
    await flush();
    s.toggleSelect(entry("pic.jpg", "file"), false);
    s.downloadSelected();
    await flush();
    expect(cue.succeeded).toHaveBeenCalledTimes(1);
    const bad = make(makeClient({ downloadBytes: vi.fn(() => Promise.reject(new Error("nope"))) }));
    await flush();
    bad.st.toggleSelect(entry("pic.jpg", "file"), false);
    bad.st.downloadSelected();
    await flush();
    expect(bad.cue.succeeded).not.toHaveBeenCalled();
  });

  it("cues the first index build only when it completes cleanly", async () => {
    const { st: s, cue } = make(makeClient());
    s.activateIndex();
    s.activateIndex();
    expect(cue.begin).toHaveBeenCalledTimes(1);
    await flush();
    expect(s.snapshot().cloudIndex.ready).toBe(true);
    expect(cue.succeeded).toHaveBeenCalledTimes(1);
    s.reload();
    await flush();
    expect(cue.succeeded).toHaveBeenCalledTimes(1);
  });

  it("stays silent for a cancelled or failed index build", async () => {
    const root = deferred<never>();
    let calls = 0;
    const client = makeClient({
      list: vi.fn(() => (++calls === 1 ? Promise.resolve([]) : root.promise)),
    });
    const { st: s, cue } = make(client);
    await flush();
    s.activateIndex();
    root.reject(new Error("down"));
    await flush();
    expect(s.snapshot().cloudIndex.error).toBe("down");
    expect(cue.succeeded).not.toHaveBeenCalled();

    const gate = deferred<DirEntry[]>();
    const slow = make(makeClient({ list: vi.fn((p: string) => (p === "/" ? Promise.resolve([entry("Media", "dir")]) : gate.promise)) }));
    await flush();
    slow.st.activateIndex();
    await flush();
    slow.st.cancelIndex();
    gate.resolve([]);
    await flush();
    expect(slow.st.snapshot().cloudIndex.ready).toBe(true);
    expect(slow.cue.succeeded).not.toHaveBeenCalled();
  });

  it("hands the live selection to the bulk mutations", async () => {
    const { st: s } = make(makeClient());
    await flush();
    s.toggleSelect(entry("pic.jpg", "file"), false);
    s.mutations.deleteSelected();
    await flush();
    expect(s.client.remove).toHaveBeenCalledWith("/pic.jpg");
  });

  it("zips global results from the cloud root", async () => {
    const { st: s, cue } = make(makeClient());
    s.activateIndex();
    s.setFilter({ ...DEFAULT_FILTER, query: "pic" });
    await flush();
    expect(s.snapshot().view.globalMode).toBe(true);
    s.toggleSelect(fileAt("/Media/pic.jpg"), false);
    s.downloadSelected();
    await flush();
    expect(s.client.downloadBytes).toHaveBeenCalledWith("/Media/pic.jpg", expect.anything());
    expect(cue.succeeded).toHaveBeenCalledTimes(2);
  });

  it("uses the real cue by default", () => {
    st = createGalleryState(makeClient(), vi.fn());
    expect(st.snapshot().path).toBe("/");
  });
});
