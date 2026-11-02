// <cloud-gallery> props: client. No events: it owns every store and mounts the child elements.
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { h } from "./dom.ts";
import { define, setProps, syncChildren, upgradeProps } from "./element-kit.ts";
import { contentNodes, skeletonGrid } from "./gallery-content.ts";
import { createGalleryState, type GallerySnapshot, type GalleryState } from "./gallery-state.ts";
import type { CloudGrid } from "./grid.ts";
import type { ResultGroups } from "./result-groups.ts";
import "./filter-bar.ts";
import "./gallery-topbar.ts";
import "./grid.ts";
import "./result-groups.ts";

type Kid = HTMLElement & Record<string, unknown>;
const make = (tag: string): Kid => document.createElement(tag) as Kid;
type Handler = (detail: never) => void;
const detailOf = (e: Event): never => (e as CustomEvent).detail as never;

export class CloudGallery extends HTMLElement {
  #client: DufsClient | null = null;
  #state: GalleryState | null = null;
  readonly #root = h("div", { class: "gallery" });
  readonly #topbar = make("gallery-topbar");
  readonly #filterBar = make("filter-bar");
  readonly #main = h("main", { class: "content" });
  readonly #viewer = make("gallery-viewer");
  readonly #dialogs = make("gallery-dialogs");
  readonly #grid = make("cloud-grid") as Kid & CloudGrid;
  readonly #groups = make("result-groups") as Kid & ResultGroups;
  readonly #skeleton = skeletonGrid();
  #banner: Kid | null = null;
  #selBar: Kid | null = null;
  #newFolder: Kid | null = null;
  #rename: { entry: DirEntry; el: Kid } | null = null;
  #wiring: AbortController | null = null;

  constructor() {
    super();
    upgradeProps(this, ["client"]);
  }

  get client(): DufsClient | null {
    return this.#client;
  }
  set client(v: DufsClient | null) {
    this.#client = v;
    if (this.isConnected) this.connectedCallback();
  }

  connectedCallback(): void {
    if (this.#client === null || this.#state !== null) return;
    const st = createGalleryState(this.#client, () => {
      this.#render(st);
    });
    this.#state = st;
    this.#wire(st);
    this.append(this.#root);
    this.#render(st);
  }

  disconnectedCallback(): void {
    this.#state?.dispose();
    this.#state = null;
    this.#wiring?.abort();
    this.#banner = this.#selBar = this.#newFolder = null;
    this.#rename = null;
    this.#root.remove();
  }

  #own(el: HTMLElement, type: string, fn: Handler): void {
    el.addEventListener(type, (e) => {
      if (e.target === el) fn(detailOf(e));
    }, { signal: this.#wiring?.signal });
  }

  #wire(st: GalleryState): void {
    this.#wiring = new AbortController();
    const { signal } = this.#wiring;
    this.#own(this.#topbar, "go", st.go);
    this.#own(this.#topbar, "new-folder", st.dialogs.openNewFolder);
    this.#own(this.#topbar, "upload-picked", (files: FileList | null) => {
      st.uploadInto(st.snapshot().path, files);
    });
    this.#own(this.#filterBar, "filter", st.setFilter);
    this.#own(this.#filterBar, "sort", st.setSort);
    this.#own(this.#filterBar, "activate", st.activateIndex);
    this.#own(this.#filterBar, "cancel-index", st.cancelIndex);
    const m = this.#main;
    const on = (type: string, fn: Handler): void => {
      m.addEventListener(type, (e) => {
        fn(detailOf(e));
      }, { signal });
    };
    on("toggle-select", (d: { entry: DirEntry; shiftKey: boolean }) => {
      st.toggleSelect(d.entry, d.shiftKey);
    });
    on("open-dir", st.go);
    on("open-media", st.openMedia);
    on("edit-text", st.dialogs.setEditEntry);
    on("delete", st.dialogs.setDeleteEntry);
    on("rename", st.dialogs.setRenameEntry);
    on("toggle-collapsed", st.toggleCollapsed);
    on("move-into", (d: { destDir: string; paths: readonly string[] }) => {
      st.mutations.moveInto(d.destDir, d.paths);
    });
    on("upload-into", (d: { destDir: string; files: FileList }) => {
      st.uploadInto(d.destDir, d.files);
    });
    const drop = st.osDrop.handlers;
    m.addEventListener("dragover", (e) => {
      drop.onDragOver(e);
    });
    m.addEventListener("dragleave", (e) => {
      drop.onDragLeave(e);
    });
    m.addEventListener("drop", (e) => {
      drop.onDrop(e);
    });
    this.#own(this.#viewer, "index-change", st.setViewerIndex);
    this.#own(this.#dialogs, "reload", st.reload);
    setProps(this.#grid, { client: st.client, dragEnabled: true });
    setProps(this.#groups, { client: st.client });
    setProps(this.#viewer, { client: st.client });
    setProps(this.#dialogs, { client: st.client, mutations: st.mutations, dialogs: st.dialogs });
  }

  #mountBanner(st: GalleryState, s: GallerySnapshot): Kid | null {
    if (s.transfer === null) return (this.#banner = null);
    if (this.#banner === null) {
      this.#banner = make("transfer-banner");
      this.#own(this.#banner, "cancel", st.cancelTransfer);
    }
    setProps(this.#banner, { progress: s.transfer });
    return this.#banner;
  }

  #mountSelBar(st: GalleryState, s: GallerySnapshot): Kid | null {
    if (s.selection.selectedEntries.length === 0) return (this.#selBar = null);
    if (this.#selBar === null) {
      const bar = make("selection-bar");
      this.#own(bar, "move", st.dialogs.openMove);
      this.#own(bar, "download", st.downloadSelected);
      this.#own(bar, "delete", st.dialogs.openDeleteSelected);
      this.#own(bar, "clear", st.clearSelection);
      this.#selBar = bar;
    }
    setProps(this.#selBar, { count: s.selection.selectedEntries.length });
    return this.#selBar;
  }

  #mountPrompts(st: GalleryState, s: GallerySnapshot): Kid[] {
    const d = st.dialogs;
    if (!s.dialogs.showNewFolder) this.#newFolder = null;
    else if (this.#newFolder === null) {
      const el = make("prompt-dialog");
      setProps(el, { title: "New folder name", placeholder: "Folder name", confirmLabel: "Create" });
      this.#own(el, "confirm", (name: string) => {
        d.setShowNewFolder(false);
        st.mutations.createFolder(name);
      });
      this.#own(el, "cancel", () => {
        d.setShowNewFolder(false);
      });
      this.#newFolder = el;
    }
    const entry = s.dialogs.renameEntry;
    if (entry === null) this.#rename = null;
    else if (this.#rename?.entry !== entry) {
      const el = make("prompt-dialog");
      setProps(el, {
        title: `Rename "${entry.name}"`, placeholder: "New name", confirmLabel: "Rename", initialValue: entry.name,
      });
      this.#own(el, "confirm", (newName: string) => {
        d.setRenameEntry(null);
        st.mutations.renameSelected(entry, newName);
      });
      this.#own(el, "cancel", () => {
        d.setRenameEntry(null);
      });
      this.#rename = { entry, el };
    }
    return [this.#newFolder, this.#rename?.el ?? null].filter((n): n is Kid => n !== null);
  }

  #render(st: GalleryState): void {
    const s = st.snapshot();
    const showListing = !s.listing.loading && s.listing.error === null;
    setProps(this.#topbar, { path: s.path, busy: s.busy });
    setProps(this.#filterBar, {
      filter: s.filter, sort: s.sort, extensions: s.view.extensions, sizeValues: s.view.sizeVals,
      durationValues: s.view.durVals, indexing: s.filterActive && s.cloudIndex.loading,
      indexProgress: s.cloudIndex.progress,
    });
    setProps(this.#grid, { entries: s.view.visible, selected: s.selection.selected });
    setProps(this.#groups, { groups: s.view.groups, collapsed: s.collapsed, selected: s.selection.selected });
    setProps(this.#viewer, { meta: s.meta, media: s.view.media, siblings: s.view.displayed, index: s.viewerIndex });
    setProps(this.#dialogs, { path: s.path, selectedCount: s.selection.selectedEntries.length });
    this.#main.className = `content${s.osDragOver ? " content-drop" : ""}`;
    if (s.listing.loading) this.#main.setAttribute("aria-busy", "true");
    else this.#main.removeAttribute("aria-busy");
    syncChildren(this.#main, contentNodes(s, { skeleton: this.#skeleton, grid: this.#grid, groups: this.#groups }));
    const parts: (HTMLElement | null | false)[] = [
      this.#topbar, this.#mountBanner(st, s), showListing && this.#filterBar,
      this.#mountSelBar(st, s), this.#main, this.#viewer, this.#dialogs, ...this.#mountPrompts(st, s),
    ];
    syncChildren(this.#root, parts.filter((n): n is HTMLElement => n !== null && n !== false));
  }
}

define("cloud-gallery", CloudGallery);
