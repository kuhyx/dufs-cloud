// <media-viewer> props: entry, url, siblings, subtitlesPath, subtitleManifest, dashPath. Events: close, prev, next.
// A new entry path remounts the stage (zoom, players); set `url` before `entry`.
import type { DirEntry, SubtitleManifest } from "../api/types.ts";
import { isAudio, isImage, isPdf, isVideo } from "../lib/paths.ts";
import { h } from "./dom.ts";
import { emit } from "./element-kit.ts";
import { createControls, type Controls } from "./viewer-controls.ts";

const NO_SIBLINGS: readonly DirEntry[] = [];

/** Clicks on the media itself must not reach the stage's close handler. */
function keepClicks<T extends HTMLElement>(el: T): T {
  el.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  return el;
}

export class MediaViewer extends HTMLElement {
  #entry: DirEntry | null = null;
  #url = "";
  #siblings: readonly DirEntry[] = NO_SIBLINGS;
  #subtitlesPath: string | null = null;
  #subtitleManifest: SubtitleManifest | null = null;
  #dashPath: string | null = null;
  #video: HTMLVideoElement | null = null;
  #media: HTMLElement | null = null;
  #controls: Controls | null = null;
  #stop: (() => void) | null = null;

  get entry(): DirEntry | null {
    return this.#entry;
  }

  set entry(value: DirEntry | null) {
    const remount = value?.path !== this.#entry?.path;
    this.#entry = value;
    if (remount && this.isConnected) this.#mount();
    else this.#push();
  }

  get url(): string {
    return this.#url;
  }

  set url(value: string) {
    this.#url = value;
    this.#push();
  }

  get siblings(): readonly DirEntry[] {
    return this.#siblings;
  }

  set siblings(value: readonly DirEntry[]) {
    this.#siblings = value;
    this.#push();
  }

  get subtitlesPath(): string | null {
    return this.#subtitlesPath;
  }

  set subtitlesPath(value: string | null) {
    this.#subtitlesPath = value;
    this.#push();
  }

  get subtitleManifest(): SubtitleManifest | null {
    return this.#subtitleManifest;
  }

  set subtitleManifest(value: SubtitleManifest | null) {
    this.#subtitleManifest = value;
    this.#push();
  }

  get dashPath(): string | null {
    return this.#dashPath;
  }

  set dashPath(value: string | null) {
    this.#dashPath = value;
    this.#push();
  }

  connectedCallback(): void {
    this.#mount();
  }

  disconnectedCallback(): void {
    this.#unmount();
  }

  #push(): void {
    const entry = this.#entry;
    if (entry === null) return;
    if (this.#controls === null) {
      this.#media?.setAttribute(this.#media.localName === "a" ? "href" : "src", this.#url);
      return;
    }
    this.#controls.update({
      entry,
      url: this.#url,
      siblings: this.#siblings,
      subtitlesPath: this.#subtitlesPath,
      subtitleManifest: this.#subtitleManifest,
      dashPath: this.#dashPath,
    });
  }

  #mount(): void {
    this.#unmount();
    const entry = this.#entry;
    if (entry === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") emit(this, "close");
      // Arrows seek the video once it has focus.
      else if (e.target === this.#video) return;
      else if (e.key === "ArrowLeft") emit(this, "prev");
      else if (e.key === "ArrowRight") emit(this, "next");
    };
    window.addEventListener("keydown", onKey);
    this.#stop = () => {
      window.removeEventListener("keydown", onKey);
    };
    const stage = h("div", { class: "viewer-stage" }, this.#stageContent(entry));
    stage.addEventListener("click", () => {
      emit(this, "close");
    });
    const overlay = h(
      "div",
      { class: "overlay viewer", role: "dialog", "aria-modal": "true" },
      this.#button("viewer-close", "Close", "✕", "close"),
      this.#button("viewer-nav prev", "Previous", "‹", "prev"),
      stage,
      this.#button("viewer-nav next", "Next", "›", "next"),
    );
    if (this.#video !== null) {
      this.#controls = createControls(this.#video, {
        entry,
        url: this.#url,
        siblings: this.#siblings,
        subtitlesPath: this.#subtitlesPath,
        subtitleManifest: this.#subtitleManifest,
        dashPath: this.#dashPath,
      });
      overlay.append(this.#controls.el);
    }
    overlay.append(h("div", { class: "viewer-caption" }, entry.name));
    this.replaceChildren(overlay);
  }

  #unmount(): void {
    this.#stop?.();
    this.#controls?.dispose();
    this.#stop = null;
    this.#controls = null;
    this.#video = null;
    this.#media = null;
    this.replaceChildren();
  }

  #button(cls: string, label: string, glyph: string, event: string): HTMLElement {
    const button = h("button", { type: "button", class: cls, "aria-label": label }, glyph);
    button.addEventListener("click", () => {
      emit(this, event);
    });
    return button;
  }

  #stageContent(entry: DirEntry): HTMLElement {
    const url = this.#url;
    const name = entry.name;
    if (isVideo(name)) {
      this.#video = h("video", { class: "viewer-video", src: url, controls: true, autoplay: true });
      this.#media = keepClicks(this.#video);
      return this.#media;
    }
    if (isImage(name)) {
      const img = h("img", { class: "viewer-img", src: url, alt: name });
      img.addEventListener("click", (e) => {
        e.stopPropagation();
        img.className = img.classList.contains("zoomed") ? "viewer-img" : "viewer-img zoomed";
      });
      this.#media = img;
      return img;
    }
    if (isPdf(name)) {
      this.#media = keepClicks(h("iframe", { class: "viewer-pdf", src: url, title: name }));
      return this.#media;
    }
    if (isAudio(name)) {
      this.#media = h("audio", { class: "viewer-audio", src: url, controls: true, autoplay: true });
      return keepClicks(h("div", { class: "viewer-fallback" }, h("p", {}, name), this.#media));
    }
    this.#media = h("a", { href: url, download: true }, "Download");
    return h("div", { class: "viewer-fallback" }, h("p", {}, name), this.#media);
  }
}

if (!customElements.get("media-viewer")) {
  customElements.define("media-viewer", MediaViewer);
}
