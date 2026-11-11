// Guard: the gallery paints no chrome words. Every painted string (text nodes,
// aria-hidden ones too, placeholders, titles, <option> text) may hold only
// symbols, numbers, measures ("12 MB"), bare unit symbols and user content
// (file and folder names from the fixtures). Old wording lives on as
// aria-label, which screen readers speak and nothing paints.
import css from "./index.css?raw";
import astro from "./pages/index.astro?raw";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { stubDialog } from "./test/dialog-stub.ts";
import { entry, makeClient } from "./test/client-fixtures.ts";
import { fire, mountGallery } from "./test/gallery-harness.ts";
import { flush } from "./test/store-helpers.ts";
import { must } from "./test/viewer-fixtures.ts";
import type { DirEntry } from "./api/types.ts";
import type { SubtitleTrack } from "./lib/subtitles.ts";
import type { DashStream } from "./lib/dash-manifest.ts";
import "./elements/all.ts";

/** User data in the fixtures: shown as-is, never chrome. */
const CONTENT = ["Media", "pic.jpg", "clip.mp4", "notes.txt", "a.txt", "a.bin", "English", "jpg", "mp4", "txt"];
/** Unit symbols may stand alone (an empty range field's unit). */
const UNIT = /^(B|KB|MB|GB|TB|MP|s|ms)$/;

function painted(root: ParentNode): string[] {
  const out: string[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const parent = walk.currentNode.parentElement;
    if (parent && !["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)) {
      out.push(walk.currentNode.textContent ?? "");
    }
  }
  for (const el of root.querySelectorAll("[placeholder], [title]")) {
    out.push(el.getAttribute("placeholder") ?? "", el.getAttribute("title") ?? "");
  }
  for (const el of root.querySelectorAll<HTMLInputElement>("input[type=button], input[type=submit]")) {
    out.push(el.value);
  }
  return out;
}

/** The words in `s` once content, measures and unit symbols are removed. */
function wordsIn(s: string): string[] {
  let rest = s;
  for (const c of CONTENT) rest = rest.split(c).join(" ");
  return rest
    .split(/[\s/·,()–—:]+/)
    .filter((t) => /\p{L}/u.test(t))
    .filter((t) => !UNIT.test(t))
    .filter((t) => !/^\d+(\.\d+)?(B|KB|MB|GB|TB|MP|h|m|s|ms)$/.test(t));
}

function expectNoWords(root: ParentNode = document.body): void {
  const offenders = painted(root).filter((s) => wordsIn(s).length > 0);
  expect(offenders).toEqual([]);
}

const pic = entry("pic.jpg", "file");

beforeAll(stubDialog);

describe("text-free gallery", () => {
  it("root listing: topbar, filter bar and grid", async () => {
    await mountGallery();
    expectNoWords();
  });

  it("empty folder", async () => {
    await mountGallery({ list: vi.fn(() => Promise.resolve([])) });
    expectNoWords();
  });

  it("listing error", async () => {
    await mountGallery({ list: vi.fn(() => Promise.reject(new Error("HTTP 500"))) });
    expectNoWords();
  });

  it("whole-cloud search while indexing and with no match", async () => {
    const g = await mountGallery();
    fire(g.kid("filter-bar") as HTMLElement, "filter", {
      ...(g.kid("filter-bar")?.filter as object), query: "zzz",
    });
    expectNoWords();
    await flush();
    await flush();
    expectNoWords();
  });

  it("selection bar, move picker and bulk delete", async () => {
    const g = await mountGallery();
    fire(g.main, "toggle-select", { entry: pic, shiftKey: false });
    await flush();
    expectNoWords();
    fire(g.kid("selection-bar") as HTMLElement, "move");
    await flush();
    await flush();
    expectNoWords();
    fire(g.kid("selection-bar") as HTMLElement, "delete");
    await flush();
    expectNoWords();
  });

  it("new folder, rename and delete dialogs", async () => {
    const g = await mountGallery();
    fire(g.kid("gallery-topbar") as HTMLElement, "new-folder");
    await flush();
    expectNoWords();
    fire(g.main, "rename", pic);
    await flush();
    expectNoWords();
    fire(g.main, "delete", pic);
    await flush();
    expectNoWords();
  });

  it("busy notes and errors in the topbar", async () => {
    const g = await mountGallery({ remove: vi.fn(() => Promise.reject(new Error("HTTP 403"))) });
    fire(g.main, "delete", pic);
    await flush();
    g.el.querySelector<HTMLButtonElement>("confirm-dialog button.danger")?.click();
    expectNoWords();
    await flush();
    expectNoWords();
  });

  it("text editor in every state", async () => {
    const g = await mountGallery();
    fire(g.main, "edit-text", entry("notes.txt", "file"));
    expectNoWords();
    await flush();
    expectNoWords();
  });

  it("viewer for an image, a video and an unknown file", async () => {
    const g = await mountGallery({
      list: vi.fn(() => Promise.resolve([pic, entry("clip.mp4", "file"), entry("a.bin", "file")] as DirEntry[])),
    });
    for (const name of ["pic.jpg", "clip.mp4", "a.bin"]) {
      fire(g.main, "open-media", entry(name, "file"));
      await flush();
      expectNoWords();
    }
  });

  it("extension picker open, with and without extensions", async () => {
    await mountGallery();
    const picker = must("extension-picker") as HTMLElement & Record<string, unknown>;
    picker.querySelector("button")?.click();
    expectNoWords();
    picker.available = [];
    expectNoWords();
  });

  it("transfer banner during an upload", async () => {
    const g = await mountGallery({ upload: vi.fn(() => new Promise<undefined>(() => undefined)) });
    fire(g.kid("gallery-topbar") as HTMLElement, "upload-picked", [new File(["ab"], "a.txt")]);
    expectNoWords();
  });

  it("subtitle and audio menus, open", () => {
    const subs = document.createElement("subtitle-menu") as HTMLElement & Record<string, unknown>;
    const tracks: SubtitleTrack[] = [
      { id: "0", language: "eng", title: "", codec: "subrip", url: "/s0.vtt" } as unknown as SubtitleTrack,
      { id: "1", language: "", title: "", codec: "subrip", url: "/s1.vtt" } as unknown as SubtitleTrack,
    ];
    subs.tracks = tracks;
    const audio = document.createElement("audio-menu") as HTMLElement & Record<string, unknown>;
    const streams: Pick<DashStream, "id" | "language">[] = [{ id: "a0", language: "" }, { id: "a1", language: "" }];
    audio.tracks = streams;
    document.body.replaceChildren(subs, audio);
    expectNoWords();
    for (const b of document.querySelectorAll<HTMLButtonElement>(".subtitle-toggle, .audio-toggle")) b.click();
    expectNoWords();
  });

  it("range fields with a typed value out of range", () => {
    for (const tag of ["size-range", "duration-range", "resolution-range"]) {
      const el = document.createElement(tag) as HTMLElement & Record<string, unknown>;
      document.body.replaceChildren(el);
      el.values = [];
      expectNoWords();
    }
  });

  it("static page and stylesheet paint no words", () => {
    const body = astro.slice(astro.indexOf("<body>"), astro.indexOf("<script>"));
    expect(body.replace(/<[^>]+>/g, "").trim()).toBe("");
    expect(css.match(/content:\s*"[^"]*\p{L}[^"]*"/gu) ?? []).toEqual([]);
  });

  it("client fixture still lists the default root", () => {
    expect(makeClient().list).toBeDefined();
  });
});
