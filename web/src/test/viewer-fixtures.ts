import { vi } from "vitest";
import { MediaViewer } from "../elements/media-viewer.ts";
import type { DirEntry, SubtitleManifest } from "../api/types.ts";
import { jassub } from "./fake-jassub.ts";

export function mk(name: string): DirEntry {
  return { name, path: `/${name}`, kind: "file", size: 1, mtimeMs: 0 };
}

export const manifest: SubtitleManifest = {
  generatedMs: 0,
  fonts: [],
  tracks: [
    { si: 0, codec: "ass", lang: "eng", title: "", default: false, file: "00.eng.ass" },
    { si: 1, codec: "ass", lang: "pol", title: "", default: false, file: "01.pol.ass" },
  ],
};

type Props = Partial<
  Pick<MediaViewer, "siblings" | "subtitlesPath" | "subtitleManifest" | "dashPath">
>;

export function open(name: string, props: Props = {}) {
  const viewer = new MediaViewer();
  viewer.url = `/${name}`;
  viewer.entry = mk(name);
  Object.assign(viewer, props);
  const onClose = vi.fn();
  const onPrev = vi.fn();
  const onNext = vi.fn();
  viewer.addEventListener("close", onClose);
  viewer.addEventListener("prev", onPrev);
  viewer.addEventListener("next", onNext);
  document.body.append(viewer);
  return { viewer, onClose, onPrev, onNext };
}

export function query(selector: string): Element | null {
  return document.body.querySelector(selector);
}

export function must(selector: string): Element {
  const el = query(selector);
  if (el === null) throw new Error(`missing ${selector}`);
  return el;
}

export function resetViewer(): void {
  document.body.replaceChildren();
  localStorage.clear();
  jassub.made.length = 0;
  jassub.destroyed = 0;
}
