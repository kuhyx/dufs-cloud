// <gallery-topbar> props: path, busy (Busy | null). Events: go path, new-folder, upload-picked FileList|null. Owns the persisted completion-sound toggle.
import { BUSY_GLYPH, busyRunning, type Busy } from "../lib/busy.ts";
import { crumbs } from "../lib/paths.ts";
import { cueEnabled, setCueEnabled } from "../lib/completion-cue.ts";
import { h } from "./dom.ts";
import { define, emit, syncChildren, upgradeProps } from "./element-kit.ts";

/** An icon-only button: the glyph paints, `label` is spoken. */
export function iconButton(label: string, glyph: string, cls?: string): HTMLButtonElement {
  return h("button", { type: "button", class: cls, "aria-label": label }, glyph);
}

export class GalleryTopbar extends HTMLElement {
  #path = "/";
  #busy: Busy | null = null;
  readonly #nav = h("nav", { class: "crumbs", "aria-label": "Breadcrumb" });
  readonly #busyNote = h("span", { class: "busy", role: "status" });
  readonly #tools: HTMLElement;

  constructor() {
    super();
    const fileInput = h("input", { type: "file", multiple: true, hidden: true });
    fileInput.addEventListener("change", () => {
      emit(this, "upload-picked", fileInput.files);
      fileInput.value = "";
    });
    const cue = h("input", { type: "checkbox", "aria-label": "Completion sound" });
    cue.checked = cueEnabled();
    cue.addEventListener("change", () => {
      setCueEnabled(cue.checked);
    });
    const newFolder = iconButton("New folder", "📁＋");
    newFolder.addEventListener("click", () => {
      emit(this, "new-folder");
    });
    const upload = iconButton("Upload", "⭱", "primary");
    upload.addEventListener("click", () => {
      fileInput.click();
    });
    this.#tools = h(
      "div",
      { class: "tools" },
      newFolder,
      upload,
      fileInput,
      h("label", { class: "cue-toggle" }, cue, h("span", { "aria-hidden": "true" }, "🔔")),
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
  get busy(): Busy | null {
    return this.#busy;
  }
  set busy(v: Busy | null) {
    this.#busy = v;
    this.#render();
  }

  connectedCallback(): void {
    if (this.firstChild === null) {
      this.append(h("header", { class: "topbar" }, this.#nav, this.#tools));
    }
    this.#render();
  }

  #renderBusy(b: Busy): void {
    const running = busyRunning(b.kind);
    this.#busyNote.className = running ? "busy" : "busy busy-error";
    this.#busyNote.setAttribute("aria-label", b.spoken);
    this.#busyNote.replaceChildren(
      ...[
        running && h("span", { class: "spinner", "aria-hidden": "true" }, "⟳"),
        h("span", { class: "busy-glyph", "aria-hidden": "true" }, BUSY_GLYPH[b.kind]),
        b.count !== undefined && h("span", { class: "busy-count" }, b.count),
        b.name !== undefined && h("span", { class: "busy-name" }, b.name),
      ].filter((n): n is HTMLSpanElement => n !== false),
    );
  }

  #render(): void {
    const all = crumbs(this.#path);
    this.#nav.replaceChildren(
      ...all.map((c, i) =>
        h(
          "span",
          {},
          // The root crumb is the cloud itself: a home glyph, spoken by name.
          h("button", { type: "button", class: "crumb", "aria-label": i === 0 ? "Cloud" : null, onClick: () => {
            emit(this, "go", c.path);
          } }, i === 0 ? "⌂" : c.name),
          i < all.length - 1 && h("span", { class: "crumb-sep" }, "/"),
        ),
      ),
    );
    if (this.#busy !== null) this.#renderBusy(this.#busy);
    const rest = [...this.#tools.childNodes].filter((n) => n !== this.#busyNote);
    syncChildren(this.#tools, this.#busy === null ? rest : [this.#busyNote, ...rest]);
  }
}

define("gallery-topbar", GalleryTopbar);
