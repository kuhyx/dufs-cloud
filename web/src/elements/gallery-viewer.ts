// <gallery-viewer> props: client, meta, media, siblings, index (-1 = closed). Events: index-change (detail: number).
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry, MetaIndex } from "../api/types.ts";
import {
  createSubtitleManifest,
  type SubtitleManifestStore,
} from "../stores/subtitle-manifest.ts";
import { emit } from "./emit.ts";
import { MediaViewer } from "./media-viewer.ts";

export class GalleryViewer extends HTMLElement {
  #client: DufsClient | null = null;
  #meta: MetaIndex = {};
  #media: readonly DirEntry[] = [];
  #siblings: readonly DirEntry[] = [];
  #index = -1;
  #manifests: SubtitleManifestStore | null = null;
  #unsubscribe: (() => void) | null = null;
  #viewer: MediaViewer | null = null;

  get client(): DufsClient | null {
    return this.#client;
  }

  set client(value: DufsClient | null) {
    this.#client = value;
    if (this.isConnected) this.#attach();
  }

  get meta(): MetaIndex {
    return this.#meta;
  }

  set meta(value: MetaIndex) {
    this.#meta = value;
    this.#render();
  }

  get media(): readonly DirEntry[] {
    return this.#media;
  }

  set media(value: readonly DirEntry[]) {
    this.#media = value;
    this.#render();
  }

  get siblings(): readonly DirEntry[] {
    return this.#siblings;
  }

  set siblings(value: readonly DirEntry[]) {
    this.#siblings = value;
    this.#render();
  }

  get index(): number {
    return this.#index;
  }

  set index(value: number) {
    this.#index = value;
    this.#render();
  }

  connectedCallback(): void {
    this.#attach();
  }

  disconnectedCallback(): void {
    this.#detach();
  }

  #attach(): void {
    this.#detach();
    if (this.#client === null) return;
    this.#manifests = createSubtitleManifest(this.#client);
    this.#unsubscribe = this.#manifests.subscribe(() => {
      this.#render();
    });
    this.#render();
  }

  #detach(): void {
    this.#unsubscribe?.();
    this.#manifests?.dispose();
    this.#unsubscribe = null;
    this.#manifests = null;
    this.#viewer = null;
    this.replaceChildren();
  }

  #step(delta: number): void {
    const count = this.#media.length;
    emit(this, "index-change", (this.#index + delta + count) % count);
  }

  #current(): DirEntry | null {
    return this.#media[this.#index] ?? null;
  }

  #render(): void {
    const manifests = this.#manifests;
    const client = this.#client;
    if (manifests === null || client === null) return;
    const entry = this.#current();
    const meta = entry === null ? undefined : this.#meta[entry.path];
    const subtitlesPath = meta?.subtitlesPath ?? null;
    manifests.setDir(subtitlesPath);
    if (entry === null) {
      this.#viewer = null;
      this.replaceChildren();
      return;
    }
    // Keyed by path: a different file gets a fresh viewer (zoom, players).
    const kept = this.#viewer?.entry?.path === entry.path ? this.#viewer : null;
    const viewer = kept ?? this.#create();
    viewer.url = client.fileUrl(meta?.proxyPath ?? entry.path);
    viewer.siblings = this.#siblings;
    viewer.subtitlesPath = subtitlesPath;
    viewer.subtitleManifest = manifests.getState();
    viewer.dashPath = meta?.dashPath ?? null;
    viewer.entry = entry;
    if (kept === null) this.replaceChildren(viewer);
  }

  #create(): MediaViewer {
    const viewer = new MediaViewer();
    const relay = (name: string, handler: () => void): void => {
      viewer.addEventListener(name, (e) => {
        e.stopPropagation();
        handler();
      });
    };
    relay("close", () => {
      emit(this, "index-change", -1);
    });
    relay("prev", () => {
      this.#step(-1);
    });
    relay("next", () => {
      this.#step(1);
    });
    this.#viewer = viewer;
    return viewer;
  }
}

if (!customElements.get("gallery-viewer")) {
  customElements.define("gallery-viewer", GalleryViewer);
}
