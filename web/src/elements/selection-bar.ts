// <selection-bar> props: count. Events: move, download, delete, clear.
import { h } from "./dom.ts";
import { define, emit } from "./events.ts";

export class SelectionBar extends HTMLElement {
  #count = 0;
  readonly #label = h("span", { class: "sel-count" });

  get count(): number {
    return this.#count;
  }

  set count(value: number) {
    this.#count = value;
    this.#label.replaceChildren(`${value} selected`);
  }

  connectedCallback(): void {
    if (this.firstChild) return;
    this.style.display = "contents";
    this.count = this.#count;
    const button = (event: string, label: string, cls?: string): HTMLButtonElement =>
      h(
        "button",
        {
          type: "button",
          class: cls,
          onclick: () => {
            emit(this, event);
          },
        },
        label,
      );
    this.append(
      h(
        "div",
        { class: "selbar" },
        this.#label,
        button("move", "Move"),
        button("download", "Download"),
        button("delete", "Delete", "danger"),
        button("clear", "Clear"),
      ),
    );
  }
}

define("selection-bar", SelectionBar);
