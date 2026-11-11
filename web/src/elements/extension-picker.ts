// <extension-picker> props: available, includes, excludes (string[]). Event: change {includes, excludes}.
import { h } from "./dom.ts";

type ExtState = "off" | "include" | "exclude";

const GLYPH: Readonly<Record<ExtState, string>> = {
  off: "☐",
  include: "✓",
  exclude: "✕",
};
const NEXT: Readonly<Record<ExtState, ExtState>> = {
  off: "include",
  include: "exclude",
  exclude: "off",
};

export class ExtensionPicker extends HTMLElement {
  #available: readonly string[] = [];
  #includes: readonly string[] = [];
  #excludes: readonly string[] = [];
  #open = false;
  readonly #button = h("button", {
    type: "button",
    class: "extpicker-btn",
    "aria-haspopup": "true",
  });

  constructor() {
    super();
    this.#button.addEventListener("click", () => {
      this.#open = !this.#open;
      this.#render();
    });
  }

  get available(): readonly string[] {
    return this.#available;
  }
  set available(value: readonly string[]) {
    this.#available = value;
    this.#render();
  }
  get includes(): readonly string[] {
    return this.#includes;
  }
  set includes(value: readonly string[]) {
    this.#includes = value;
    this.#render();
  }
  get excludes(): readonly string[] {
    return this.#excludes;
  }
  set excludes(value: readonly string[]) {
    this.#excludes = value;
    this.#render();
  }

  connectedCallback(): void {
    this.className = "extpicker";
    this.#render();
  }

  #stateOf(ext: string): ExtState {
    if (this.#includes.includes(ext)) return "include";
    return this.#excludes.includes(ext) ? "exclude" : "off";
  }

  /** off → include → exclude → off, rebuilding both lists from the new state. */
  #cycle(ext: string): void {
    const next = NEXT[this.#stateOf(ext)];
    const includes = this.#includes.filter((e) => e !== ext);
    const excludes = this.#excludes.filter((e) => e !== ext);
    if (next === "include") includes.push(ext);
    else if (next === "exclude") excludes.push(ext);
    this.dispatchEvent(
      new CustomEvent("change", {
        bubbles: true,
        composed: true,
        detail: { includes, excludes },
      }),
    );
  }

  #summary(): string {
    const parts = [
      this.#includes.length > 0 ? this.#includes.join(", ") : "",
      this.#excludes.length > 0 ? `✕ ${this.#excludes.join(", ")}` : "",
    ].filter((s) => s !== "");
    // Extensions are user data; "any" is the same ✱ the type filter uses.
    return parts.join(" · ") || "✱";
  }

  /** The toggle's spoken name: the old summary sentence. */
  #spoken(): string {
    const parts = [
      this.#includes.length > 0 ? this.#includes.join(", ") : "",
      this.#excludes.length > 0 ? `not ${this.#excludes.join(", ")}` : "",
    ].filter((s) => s !== "");
    return parts.join(" · ") || "Any ext";
  }

  #option(ext: string): HTMLButtonElement {
    const state = this.#stateOf(ext);
    const option = h(
      "button",
      {
        type: "button",
        class: `extpicker-opt ext-${state}`,
        "aria-label": `${ext}: ${state}`,
      },
      h("span", { class: "ext-glyph", "aria-hidden": "true" }, GLYPH[state]),
      ext,
    );
    option.addEventListener("click", () => {
      this.#cycle(ext);
    });
    return option;
  }

  #buildPopup(): Node[] {
    const backdrop = h("button", {
      type: "button",
      class: "extpicker-backdrop",
      "aria-label": "Close extension menu",
    });
    backdrop.addEventListener("click", () => {
      this.#open = false;
      this.#render();
    });
    // No hint line: each option's ✓ / ✕ / blank glyph already shows its state.
    const menu = h("div", { class: "extpicker-menu" });
    if (this.#available.length === 0) {
      menu.append(
        h("p", { class: "muted extpicker-empty", "aria-label": "No extensions in view." }, "∅"),
      );
    }
    menu.append(...this.#available.map((ext) => this.#option(ext)));
    return [backdrop, menu];
  }

  #render(): void {
    // The option buttons are rebuilt each time; hand focus to the same slot.
    const options = [...this.querySelectorAll(".extpicker-opt")];
    const focused = options.findIndex((o) => o === document.activeElement);
    this.#button.textContent = `${this.#summary()} ▾`;
    this.#button.setAttribute("aria-label", this.#spoken());
    this.#button.setAttribute("aria-expanded", String(this.#open));
    // The toggle button stays put (keeps focus); only the popup is swapped.
    if (this.#button.parentNode !== this) this.prepend(this.#button);
    for (const node of [...this.childNodes]) {
      if (node !== this.#button) node.remove();
    }
    if (this.#open) this.append(...this.#buildPopup());
    if (focused >= 0) {
      this.querySelectorAll<HTMLElement>(".extpicker-opt")[focused]?.focus();
    }
  }
}

if (!customElements.get("extension-picker")) {
  customElements.define("extension-picker", ExtensionPicker);
}
