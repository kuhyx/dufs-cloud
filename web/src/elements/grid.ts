// <cloud-grid> props: client, entries, selected, dragEnabled (legacy: onMoveInto/onUploadInto given). Events: toggle-select {entry, shiftKey}, open-dir path, open-media entry, edit-text entry, delete entry, rename entry, move-into {destDir, paths}, upload-into {destDir, files}.
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { h } from "./dom.ts";
import { define, emit, syncChildren, upgradeProps } from "./element-kit.ts";
import { buildTile, type Tile, type TileHost } from "./grid-tile.ts";

const PROPS = ["client", "entries", "selected", "dragEnabled"] as const;

export class CloudGrid extends HTMLElement implements TileHost {
  #client: DufsClient | null = null;
  #entries: readonly DirEntry[] = [];
  #selected: ReadonlySet<string> = new Set();
  #dragEnabled = false;
  #dropTarget: string | null = null;
  readonly #list = h("ul", { class: "grid" });
  #tiles = new Map<string, Tile>();

  constructor() {
    super();
    upgradeProps(this, PROPS);
  }

  get client(): DufsClient | null {
    return this.#client;
  }
  set client(v: DufsClient | null) {
    this.#client = v;
    this.#tiles.clear();
    this.#render();
  }
  get entries(): readonly DirEntry[] {
    return this.#entries;
  }
  set entries(v: readonly DirEntry[]) {
    this.#entries = v;
    this.#render();
  }
  get selected(): ReadonlySet<string> {
    return this.#selected;
  }
  set selected(v: ReadonlySet<string>) {
    this.#selected = v;
    this.#render();
  }
  get dragEnabled(): boolean {
    return this.#dragEnabled;
  }
  set dragEnabled(v: boolean) {
    this.#dragEnabled = v;
    this.#render();
  }

  connectedCallback(): void {
    if (this.#list.parentNode !== this) this.append(this.#list);
    this.#render();
  }

  setDropTarget(path: string | null): void {
    this.#dropTarget = path;
    this.#render();
  }

  fire(type: string, detail: unknown): void {
    emit(this, type, detail);
  }

  #render(): void {
    const client = this.#client;
    if (client === null) return;
    const next = new Map<string, Tile>();
    const lis = this.#entries.map((entry) => {
      const cached = this.#tiles.get(entry.path);
      const tile = cached?.entry === entry ? cached : buildTile(this, client, entry);
      next.set(entry.path, tile);
      const isSel = this.#selected.has(entry.path);
      tile.checkbox.checked = isSel;
      tile.li.draggable = this.#dragEnabled;
      tile.li.className = `tile tile-${entry.kind}${isSel ? " tile-selected" : ""}${
        this.#dropTarget === entry.path ? " tile-drop" : ""
      }`;
      return tile.li;
    });
    this.#tiles = next;
    syncChildren(this.#list, lis);
  }
}

define("cloud-grid", CloudGrid);
