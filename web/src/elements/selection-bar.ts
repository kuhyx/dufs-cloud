// <selection-bar> props: count. Events: move, download, delete, clear.
import { h } from "./dom.ts";
import { define, emit } from "./element-kit.ts";

export class SelectionBar extends HTMLElement {
  #count = 0;
  readonly #label = h("span", { class: "sel-count", role: "status" });

  get count(): number {
    return this.#count;
  }

  set count(value: number) {
    this.#count = value;
    this.#label.setAttribute("aria-label", `${value} selected`);
    this.#label.replaceChildren(h("span", { "aria-hidden": "true" }, "☑ "), String(value));
  }

  connectedCallback(): void {
    if (this.firstChild) return;
    this.style.display = "contents";
    this.count = this.#count;
    // Icon-only: the glyph paints, the old word is the spoken label.
    const button = (event: string, label: string, glyph: string, cls?: string): HTMLButtonElement =>
      h(
        "button",
        {
          type: "button",
          class: cls,
          "aria-label": label,
          onclick: () => {
            emit(this, event);
          },
        },
        glyph,
      );
    this.append(
      h(
        "div",
        { class: "selbar" },
        this.#label,
        button("move", "Move", "➜📁"),
        button("download", "Download", "⭳"),
        button("delete", "Delete", "🗑", "danger"),
        button("clear", "Clear", "✕"),
      ),
    );
  }
}

define("selection-bar", SelectionBar);
