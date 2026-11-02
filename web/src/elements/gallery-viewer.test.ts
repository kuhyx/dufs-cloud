import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { GalleryViewer } from "./gallery-viewer.ts";
import { clientWith, deferred, flush } from "../test/store-helpers.ts";
import { meta } from "../test/meta.ts";
import { flush as flushMicrotasks, installDashFakes } from "../test/dash-player-fixtures.ts";
import type { DirEntry, MetaIndex, SubtitleManifest } from "../api/types.ts";

vi.mock("jassub", () => ({
  default: class {
    timeOffset = 0;
    destroy(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

installDashFakes();

function mk(name: string): DirEntry {
  return { name, path: `/${name}`, kind: "file", size: 1, mtimeMs: 0 };
}

const subs: SubtitleManifest = {
  generatedMs: 0,
  fonts: [],
  tracks: [
    { si: 0, codec: "ass", lang: "eng", title: "", default: false, file: "00.eng.ass" },
  ],
};

const media = [mk("a.jpg"), mk("b.mp4"), mk("c.png")];

function setup(over: { meta?: MetaIndex; index?: number } = {}) {
  const client = clientWith({
    fileUrl: (path: string) => `https://cloud${path}`,
    fetchSubtitleManifest: () => Promise.resolve(subs),
  });
  const gallery = new GalleryViewer();
  gallery.client = client;
  gallery.meta = over.meta ?? {};
  gallery.media = media;
  gallery.siblings = media;
  gallery.index = over.index ?? 0;
  const onChange = vi.fn();
  gallery.addEventListener("index-change", onChange);
  document.body.append(gallery);
  return { gallery, client, onChange };
}

function changed(onChange: ReturnType<typeof vi.fn>, call = 0): number {
  return (onChange.mock.calls[call]?.[0] as CustomEvent<number>).detail;
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe("gallery-viewer", () => {
  it("reads its props back and registers once", async () => {
    const { gallery, client } = setup();
    expect(gallery.client).toBe(client);
    expect(gallery.meta).toEqual({});
    expect(gallery.media).toBe(media);
    expect(gallery.siblings).toBe(media);
    expect(gallery.index).toBe(0);
    vi.resetModules();
    await import("./gallery-viewer.ts");
    expect(customElements.get("gallery-viewer")).toBe(GalleryViewer);
  });

  it("renders nothing while closed", () => {
    const { gallery } = setup({ index: -1 });
    expect(gallery).toBeEmptyDOMElement();
  });

  it("renders nothing for an index past the end", () => {
    expect(setup({ index: 9 }).gallery).toBeEmptyDOMElement();
  });

  it("renders nothing without a client", () => {
    const gallery = new GalleryViewer();
    gallery.index = 0;
    gallery.media = media;
    document.body.append(gallery);
    expect(gallery).toBeEmptyDOMElement();
  });

  it("shows the viewer for the indexed entry with its file url", () => {
    setup();
    expect(screen.getByAltText("a.jpg")).toHaveAttribute(
      "src",
      "https://cloud/a.jpg",
    );
  });

  it("plays the proxy when the file has one", () => {
    setup({ index: 1, meta: { "/b.mp4": meta({ proxyPath: "/proxy/b.mp4" }) } });
    expect(document.querySelector("video")).toHaveAttribute(
      "src",
      "https://cloud/proxy/b.mp4",
    );
  });

  it("steps forward and back with wraparound", async () => {
    const first = setup();
    await userEvent.click(screen.getByLabelText("Previous"));
    expect(changed(first.onChange)).toBe(2);
    await userEvent.click(screen.getByLabelText("Next"));
    expect(changed(first.onChange, 1)).toBe(1);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(changed(first.onChange, 2)).toBe(1);
  });

  it("wraps from the last entry to the first", async () => {
    const { onChange } = setup({ index: 2 });
    await userEvent.click(screen.getByLabelText("Next"));
    expect(changed(onChange)).toBe(0);
  });

  it("closes with index -1 and keeps viewer events from leaking", async () => {
    const { onChange } = setup();
    const leaked = vi.fn();
    document.addEventListener("close", leaked);
    document.addEventListener("next", leaked);
    await userEvent.click(screen.getByLabelText("Close"));
    await userEvent.click(screen.getByLabelText("Next"));
    expect(changed(onChange)).toBe(-1);
    expect(leaked).not.toHaveBeenCalled();
    document.removeEventListener("close", leaked);
    document.removeEventListener("next", leaked);
  });

  it("opens, moves on and closes as the index prop changes", () => {
    const { gallery } = setup({ index: -1 });
    gallery.index = 0;
    const first = screen.getByRole("dialog");
    gallery.meta = { "/a.jpg": meta() };
    expect(screen.getByRole("dialog")).toBe(first);
    gallery.index = 2;
    expect(screen.getByAltText("c.png")).toBeInTheDocument();
    expect(screen.queryByAltText("a.jpg")).not.toBeInTheDocument();
    gallery.index = -1;
    expect(gallery).toBeEmptyDOMElement();
  });

  it("fetches the subtitle manifest for the open video", async () => {
    const { client } = setup({
      index: 1,
      meta: { "/b.mp4": meta({ subtitlesPath: "/.subs/b.mp4" }) },
    });
    await flush();
    expect(client.fetchSubtitleManifest).toHaveBeenCalledWith("/.subs/b.mp4");
    expect(screen.getByLabelText("Subtitles")).toHaveTextContent("English");
  });

  it("drops the manifest of the previous video", async () => {
    const pending = deferred<SubtitleManifest | null>();
    const client = clientWith({
      fileUrl: (path: string) => path,
      fetchSubtitleManifest: () => pending.promise,
    });
    const gallery = new GalleryViewer();
    gallery.client = client;
    gallery.meta = { "/b.mp4": meta({ subtitlesPath: "/.subs/b.mp4" }) };
    gallery.media = media;
    gallery.index = 1;
    document.body.append(gallery);
    gallery.index = 0;
    pending.resolve(subs);
    await flush();
    expect(screen.queryByLabelText("Subtitles")).not.toBeInTheDocument();
  });

  it("hands the dash path to the viewer", async () => {
    setup({ index: 1, meta: { "/b.mp4": meta({ dashPath: "/.dash/b.mp4" }) } });
    await flushMicrotasks();
    expect(document.querySelector("video")).toHaveAttribute("src", "blob:dash");
  });

  it("rebuilds when the client is swapped and clears on removal", () => {
    const { gallery } = setup();
    const other = clientWith({ fileUrl: (path: string) => `https://other${path}` });
    gallery.client = other;
    expect(screen.getByAltText("a.jpg")).toHaveAttribute("src", "https://other/a.jpg");
    gallery.remove();
    expect(gallery).toBeEmptyDOMElement();
    gallery.client = other;
    expect(gallery).toBeEmptyDOMElement();
  });
});
