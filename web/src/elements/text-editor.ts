// <text-editor> props: client (DufsClient), entry (DirEntry). Events: close.
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import { h } from "./dom.ts";
import { define, emit } from "./element-kit.ts";
import { modal, showModal } from "./modal.ts";

type Status = "loading" | "ready" | "saving" | "error";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A minimal editor for .txt/.md files: GET the text, edit, PUT it back. */
export class TextEditor extends HTMLElement {
  #client: DufsClient | null = null;
  #entry: DirEntry | null = null;
  #generation = 0;
  readonly #name = h("span");
  readonly #status = h("span", { class: "editor-status", role: "status" });
  readonly #area = h("textarea", { class: "editor-area", spellcheck: "false", "aria-label": "File contents" });
  readonly #save = h("button", { type: "button", class: "primary", "aria-label": "Save" }, "💾");
  readonly #dialog = modal(
    "dialog editor",
    () => {
      emit(this, "close");
    },
    false,
    h("header", { class: "editor-head" }, this.#name, this.#status),
    this.#area,
    h(
      "div",
      { class: "dialog-actions" },
      h(
        "button",
        {
          type: "button",
          "aria-label": "Close",
          onclick: () => {
            emit(this, "close");
          },
        },
        "✕",
      ),
      this.#save,
    ),
  );

  constructor() {
    super();
    this.#show("loading", null);
    this.#save.addEventListener("click", () => {
      this.#write();
    });
  }

  get client(): DufsClient | null {
    return this.#client;
  }

  set client(value: DufsClient | null) {
    this.#client = value;
    this.#load();
  }

  get entry(): DirEntry | null {
    return this.#entry;
  }

  set entry(value: DirEntry | null) {
    this.#entry = value;
    this.#name.replaceChildren(value?.name ?? "");
    this.#load();
  }

  connectedCallback(): void {
    if (!this.contains(this.#dialog)) this.append(this.#dialog);
    showModal(this, this.#dialog);
    this.#load();
  }

  disconnectedCallback(): void {
    this.#generation += 1;
    this.#dialog.close();
  }

  // The status paints a glyph (spinner while busy, ✓ once saved, ⚠ on error);
  // the old word or the error message is its spoken name, `data-status` the
  // state tests read.
  #show(status: Status, message: string | null): void {
    const glyph = status === "error" ? "⚠" : status === "ready" ? (message === null ? "" : "✓") : "⟳";
    this.#status.replaceChildren(glyph);
    this.#status.dataset.status = status === "ready" && message !== null ? "saved" : status;
    this.#status.setAttribute("aria-label", message ?? status);
    this.#area.disabled = status === "loading";
    this.#save.disabled = status === "loading" || status === "saving";
  }

  #load(): void {
    const client = this.#client;
    const entry = this.#entry;
    if (!this.isConnected || client === null || entry === null) return;
    const generation = ++this.#generation;
    this.#show("loading", null);
    client
      .readText(entry.path)
      .then((content) => {
        if (generation !== this.#generation) return;
        this.#area.value = content;
        this.#show("ready", null);
      })
      .catch((err: unknown) => {
        if (generation !== this.#generation) return;
        this.#show("error", errorText(err));
      });
  }

  #write(): void {
    const client = this.#client;
    const entry = this.#entry;
    if (client === null || entry === null) return;
    this.#show("saving", null);
    client
      .writeText(entry.path, this.#area.value)
      .then(() => {
        this.#show("ready", "Saved");
      })
      .catch((err: unknown) => {
        this.#show("error", errorText(err));
      });
  }
}

define("text-editor", TextEditor);
