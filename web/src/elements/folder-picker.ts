// <folder-picker> props: client (DufsClient), initialPath, count. Events: pick (detail: destDir), cancel.
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { parentPath } from "../lib/paths.ts";
import { h } from "./dom.ts";

const SKELETON_ROWS = 3;

export class FolderPicker extends HTMLElement {
  #client: DufsClient | undefined;
  #dir = "";
  #count = 0;
  /** Which directory the folders/error below describe; loading = it differs from #dir. */
  #loadedDir: string | null = null;
  #folders: readonly DirEntry[] = [];
  #error: string | null = null;
  #token = 0;

  get client(): DufsClient | undefined {
    return this.#client;
  }
  set client(value: DufsClient | undefined) {
    this.#client = value;
    this.#load();
  }
  get initialPath(): string {
    return this.#dir;
  }
  set initialPath(value: string) {
    this.#navigate(value);
  }
  get count(): number {
    return this.#count;
  }
  set count(value: number) {
    this.#count = value;
    this.#render();
  }

  connectedCallback(): void {
    this.#load();
    this.#render();
  }

  disconnectedCallback(): void {
    this.#token++;
  }

  #navigate(dir: string): void {
    this.#dir = dir;
    this.#load();
    this.#render();
  }

  /** Newest request wins; a settle after navigation or disconnect is dropped. */
  #load(): void {
    const client = this.#client;
    if (client === undefined || !this.isConnected) return;
    const token = ++this.#token;
    const dir = this.#dir;
    void client
      .list(dir)
      .then(
        (all) => ({
          folders: all.filter((e) => e.kind === "dir"),
          error: null,
        }),
        (err: unknown) => ({
          folders: [],
          error: err instanceof Error ? err.message : String(err),
        }),
      )
      .then((result) => {
        if (token !== this.#token) return;
        this.#loadedDir = dir;
        this.#folders = result.folders;
        this.#error = result.error;
        this.#render();
      });
  }

  #emit(name: string, detail?: string): void {
    this.dispatchEvent(
      new CustomEvent(name, { bubbles: true, composed: true, detail }),
    );
  }

  #rowButton(label: string, dir: string): HTMLLIElement {
    const button = h("button", { type: "button", class: "picker-row" }, label);
    button.addEventListener("click", () => {
      this.#navigate(dir);
    });
    return h("li", {}, button);
  }

  #listItems(): HTMLLIElement[] {
    const loading = this.#loadedDir !== this.#dir;
    const items: HTMLLIElement[] = [];
    if (this.#dir !== "/") {
      items.push(this.#rowButton("📁 ..", parentPath(this.#dir)));
    }
    if (loading) {
      for (let i = 0; i < SKELETON_ROWS; i++) {
        items.push(h("li", { class: "skeleton-row", "aria-hidden": "true" }));
      }
    } else if (this.#error !== null) {
      items.push(h("li", { class: "error", role: "alert", "aria-label": `Could not load: ${this.#error}` }, "⚠"));
    } else if (this.#folders.length === 0) {
      items.push(h("li", { class: "muted empty-glyph", "aria-label": "No subfolders." }, "∅"));
    }
    for (const f of this.#folders) items.push(this.#rowButton(`📁 ${f.name}`, f.path));
    return items;
  }

  #actions(): HTMLElement {
    const cancel = h("button", { type: "button", "aria-label": "Cancel" }, "✕");
    cancel.addEventListener("click", () => {
      this.#emit("cancel");
    });
    const pick = h("button", { type: "button", class: "primary", "aria-label": "Move here" }, "✓");
    pick.addEventListener("click", () => {
      this.#emit("pick", this.#dir);
    });
    return h("div", { class: "dialog-actions" }, cancel, pick);
  }

  #render(): void {
    const plural = this.#count === 1 ? "" : "s";
    const dialog = h(
      "div",
      { class: "dialog" },
      h("p", { class: "picker-heading" }, h("span", { "aria-hidden": "true" }, "➜📁 "), String(this.#count)),
      h("p", { class: "picker-path muted" }, this.#dir),
      h("ul", { class: "picker-list" }, ...this.#listItems()),
      this.#actions(),
    );
    dialog.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    const overlay = h(
      "div",
      {
        class: "overlay", role: "dialog", "aria-modal": "true",
        "aria-label": `Move ${this.#count} item${plural} to:`,
      },
      dialog,
    );
    overlay.addEventListener("click", () => {
      this.#emit("cancel");
    });
    this.replaceChildren(overlay);
  }
}

if (!customElements.get("folder-picker")) {
  customElements.define("folder-picker", FolderPicker);
}
