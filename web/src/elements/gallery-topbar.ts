// <gallery-topbar> props: path, busy. Events: go path, new-folder, upload-picked FileList|null. Owns the persisted "Completion sound" toggle.
import { crumbs } from "../lib/paths.ts";
import { cueEnabled, setCueEnabled } from "../lib/completion-cue.ts";
import { h } from "./dom.ts";
import { define, emit, syncChildren, upgradeProps } from "./element-kit.ts";

export class GalleryTopbar extends HTMLElement {
  #path = "/";
  #busy: string | null = null;
  readonly #nav = h("nav", { class: "crumbs", "aria-label": "Breadcrumb" });
  readonly #busyNote = h("span", { class: "busy" });
  readonly #tools: HTMLElement;

  constructor() {
    super();
    const fileInput = h("input", { type: "file", multiple: true, hidden: true });
    fileInput.addEventListener("change", () => {
      emit(this, "upload-picked", fileInput.files);
      fileInput.value = "";
    });
    const cue = h("input", { type: "checkbox" });
    cue.checked = cueEnabled();
    cue.addEventListener("change", () => {
      setCueEnabled(cue.checked);
    });
    this.#tools = h(
      "div",
      { class: "tools" },
      h("button", { type: "button", onClick: () => {
        emit(this, "new-folder");
      } }, "New folder"),
      h("button", { type: "button", class: "primary", onClick: () => {
        fileInput.click();
      } }, "Upload"),
      fileInput,
      h("label", { class: "cue-toggle" }, cue, "Completion sound"),
    );
    upgradeProps(this, ["path", "busy"]);
  }

  get path(): string {
    return this.#path;
  }
  set path(v: string) {
    this.#path = v;
    this.#render();
  }
  get busy(): string | null {
    return this.#busy;
  }
  set busy(v: string | null) {
    this.#busy = v;
    this.#render();
  }

  connectedCallback(): void {
    if (this.firstChild === null) {
      this.append(h("header", { class: "topbar" }, this.#nav, this.#tools));
    }
    this.#render();
  }

  #render(): void {
    const all = crumbs(this.#path);
    this.#nav.replaceChildren(
      ...all.map((c, i) =>
        h(
          "span",
          {},
          h("button", { type: "button", class: "crumb", onClick: () => {
            emit(this, "go", c.path);
          } }, c.name),
          i < all.length - 1 && h("span", { class: "crumb-sep" }, "/"),
        ),
      ),
    );
    this.#busyNote.textContent = this.#busy;
    const rest = [...this.#tools.childNodes].filter((n) => n !== this.#busyNote);
    syncChildren(this.#tools, this.#busy === null ? rest : [this.#busyNote, ...rest]);
  }
}

define("gallery-topbar", GalleryTopbar);
