import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { deferred, flush } from "../test/store-helpers.ts";
import { fire, mountGallery } from "../test/gallery-harness.ts";
import { DEFAULT_FILTER } from "../lib/filter-sort.ts";
import { SKELETON_TILES } from "./gallery-content.ts";
import type { DirEntry } from "../api/types.ts";

describe("cloud-gallery listing", () => {
  it("shows skeleton tiles while loading, then the grid", async () => {
    const list = deferred<DirEntry[]>();
    const g = await mountGallery({ list: vi.fn(() => list.promise) }, false);
    const skeleton = g.main.querySelector(".skeleton-grid");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton?.querySelectorAll(".skeleton-tile")).toHaveLength(SKELETON_TILES);
    expect(g.main).toHaveAttribute("aria-busy", "true");
    expect(g.main.textContent).toBe("");
    expect(g.kid("filter-bar")).toBeNull();
    list.resolve([{ name: "a.txt", path: "/a.txt", kind: "file", size: 1, mtimeMs: 0 }]);
    await flush();
    expect(g.main).not.toHaveAttribute("aria-busy");
    expect(g.main.querySelector(".skeleton-grid")).toBeNull();
    expect(screen.getByLabelText("Select a.txt")).toBeInTheDocument();
    expect(g.kid("filter-bar")).not.toBeNull();
  });

  it("reports a failed listing and an empty folder", async () => {
    const bad = await mountGallery({ list: vi.fn(() => Promise.reject(new Error("boom"))) });
    expect(screen.getByText("Could not load: boom")).toHaveClass("error");
    expect(bad.kid("filter-bar")).toBeNull();
    await mountGallery({ list: vi.fn(() => Promise.resolve([])) });
    expect(screen.getByText("This folder is empty.")).toHaveClass("muted");
  });

  it("navigates into folders and through the breadcrumb", async () => {
    const g = await mountGallery();
    await userEvent.click(screen.getByText("Media"));
    await flush();
    expect(window.location.hash).toBe("#/Media");
    expect(g.client.list).toHaveBeenLastCalledWith("/Media");
    expect(g.kid("gallery-topbar")?.path).toBe("/Media");
    fire(g.kid("gallery-topbar") as HTMLElement, "go", "/");
    await flush();
    expect(window.location.hash).toBe("#/");
  });

  it("selects tiles and drives the selection bar", async () => {
    const g = await mountGallery();
    await userEvent.click(screen.getByLabelText("Select pic.jpg"));
    const bar = g.kid("selection-bar");
    expect(bar?.count).toBe(1);
    const dialogs = () => g.kid("gallery-dialogs")?.dialogs as Record<string, unknown>;
    fire(bar as HTMLElement, "move");
    expect(dialogs().showMove).toBe(true);
    fire(bar as HTMLElement, "delete");
    expect(dialogs().showDeleteSelected).toBe(true);
    expect(g.kid("gallery-dialogs")?.selectedCount).toBe(1);
    fire(bar as HTMLElement, "download");
    await flush();
    expect(g.client.downloadBytes).toHaveBeenCalled();
    await userEvent.click(screen.getByLabelText("Select notes.txt"));
    fire(g.kid("selection-bar") as HTMLElement, "clear");
    expect(g.kid("selection-bar")).toBeNull();
  });

  it("opens the viewer and follows its index changes", async () => {
    const g = await mountGallery();
    const viewer = g.kid("gallery-viewer") as HTMLElement & Record<string, unknown>;
    expect(viewer.index).toBe(-1);
    await userEvent.click(within(g.main).getByText("clip.mp4"));
    expect(viewer.index).toBe(0);
    expect(viewer.media).toHaveLength(2);
    fire(viewer, "index-change", (cur: number) => cur + 1);
    expect(viewer.index).toBe(1);
    fire(viewer, "index-change", -1);
    expect(viewer.index).toBe(-1);
    expect(viewer.client).toBe(g.client);
  });

  it("routes tile actions to the dialogs and prompts", async () => {
    const g = await mountGallery();
    const dialogs = () => g.kid("gallery-dialogs")?.dialogs as Record<string, unknown>;
    await userEvent.click(within(g.main).getByText("notes.txt"));
    expect((dialogs().editEntry as DirEntry).name).toBe("notes.txt");
    await userEvent.click(screen.getByLabelText("Delete notes.txt"));
    expect((dialogs().deleteEntry as DirEntry).name).toBe("notes.txt");
    await userEvent.click(screen.getByLabelText("Rename notes.txt"));
    const prompt = g.kid("prompt-dialog") as HTMLElement & Record<string, unknown>;
    expect(prompt.title).toBe('Rename "notes.txt"');
    expect(prompt.initialValue).toBe("notes.txt");
    expect(prompt.confirmLabel).toBe("Rename");
    fire(prompt, "confirm", "b.txt");
    await flush();
    expect(g.client.rename).toHaveBeenCalled();
    expect(g.kid("prompt-dialog")).toBeNull();
    await userEvent.click(screen.getByLabelText("Rename pic.jpg"));
    fire(g.kid("prompt-dialog") as HTMLElement, "cancel");
    expect(g.kid("prompt-dialog")).toBeNull();
  });

  it("creates folders through the new-folder prompt", async () => {
    const g = await mountGallery();
    await userEvent.click(screen.getByText("New folder"));
    const prompt = g.kid("prompt-dialog") as HTMLElement & Record<string, unknown>;
    expect(prompt.placeholder).toBe("Folder name");
    const inner = prompt.appendChild(document.createElement("span"));
    fire(inner, "confirm", "ignored-inner");
    expect(g.client.createDir).not.toHaveBeenCalled();
    fire(prompt, "confirm", "New");
    await flush();
    expect(g.client.createDir).toHaveBeenCalledWith("/New");
    await userEvent.click(screen.getByText("New folder"));
    fire(g.kid("prompt-dialog") as HTMLElement, "cancel");
    expect(g.kid("prompt-dialog")).toBeNull();
  });

  it("re-reads the folder when the dialogs ask for a reload", async () => {
    const g = await mountGallery();
    const calls = vi.mocked(g.client.list).mock.calls.length;
    fire(g.kid("gallery-dialogs") as HTMLElement, "reload");
    await flush();
    expect(g.client.list).toHaveBeenCalledTimes(calls + 1);
    expect(g.kid("gallery-dialogs")?.mutations).toBeDefined();
  });

  it("sorts and filters through the filter bar", async () => {
    const g = await mountGallery();
    const bar = g.kid("filter-bar") as HTMLElement & Record<string, unknown>;
    const names = (): (string | null)[] =>
      [...g.main.querySelectorAll(".tile-name")].map((n) => n.textContent);
    const before = names();
    fire(bar, "sort", { key: "name", dir: "desc" });
    expect(names()).toEqual([before[0], ...before.slice(1).reverse()]);
    expect(bar.sort).toEqual({ key: "name", dir: "desc" });
    fire(bar, "filter", { ...DEFAULT_FILTER, query: "zzz" });
    expect(screen.getByText("Indexing the whole cloud…")).toBeInTheDocument();
    fire(bar, "activate");
    expect(bar.indexing).toBe(true);
    await flush();
    expect(screen.getByText("Nothing on the cloud matches your filters.")).toBeInTheDocument();
    fire(bar, "filter", { ...DEFAULT_FILTER, query: "pic" });
    expect(g.kid("result-groups")).not.toBeNull();
    fire(bar, "filter", DEFAULT_FILTER);
    expect(g.kid("result-groups")).toBeNull();
  });
});
