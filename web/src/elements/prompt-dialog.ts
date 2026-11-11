// <prompt-dialog> props: title (spoken), glyph (painted heading), subject
// (painted user content, e.g. the entry renamed), placeholder, confirmLabel
// (spoken; the button paints ✓), initialValue.
// Events: confirm (detail: trimmed value), cancel.
import { h } from "./dom.ts";
import { define, emit } from "./element-kit.ts";
import { modal, showModal } from "./modal.ts";

export class PromptDialog extends HTMLElement {
  #seeded = false;
  #initialValue = "";
  #title = "";
  readonly #glyph = h("span", { class: "prompt-glyph", "aria-hidden": "true" });
  readonly #subject = h("span", { class: "prompt-subject" });
  readonly #heading = h("p", { class: "prompt-heading" }, this.#glyph, this.#subject);
  readonly #input = h("input", { class: "prompt-input", type: "text" });
  readonly #confirm = h("button", { type: "button", class: "primary", disabled: true }, "✓");
  readonly #dialog = modal(
    "dialog",
    () => {
      emit(this, "cancel");
    },
    true,
    this.#heading,
    this.#input,
    h(
      "div",
      { class: "dialog-actions" },
      h(
        "button",
        {
          type: "button",
          "aria-label": "Cancel",
          onclick: () => {
            emit(this, "cancel");
          },
        },
        "✕",
      ),
      this.#confirm,
    ),
  );

  constructor() {
    super();
    this.#input.addEventListener("input", () => {
      this.#confirm.disabled = this.#trimmed() === "";
    });
    this.#input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.#submit();
    });
    this.#confirm.addEventListener("click", () => {
      this.#submit();
    });
  }

  /** Spoken only: names the input for screen readers. */
  override get title(): string {
    return this.#title;
  }

  override set title(value: string) {
    this.#title = value;
    this.#input.setAttribute("aria-label", value);
  }

  get glyph(): string {
    return this.#glyph.textContent;
  }

  set glyph(value: string) {
    this.#glyph.replaceChildren(value);
  }

  get subject(): string {
    return this.#subject.textContent;
  }

  set subject(value: string) {
    this.#subject.replaceChildren(value);
  }

  get placeholder(): string {
    return this.#input.placeholder;
  }

  set placeholder(value: string) {
    this.#input.placeholder = value;
  }

  get confirmLabel(): string {
    return this.#confirm.getAttribute("aria-label") ?? "";
  }

  set confirmLabel(value: string) {
    this.#confirm.setAttribute("aria-label", value);
  }

  get initialValue(): string {
    return this.#initialValue;
  }

  /** Seeds the input once, like the legacy `useState(initialValue)`. */
  set initialValue(value: string) {
    this.#initialValue = value;
    if (this.#seeded) return;
    this.#input.value = value;
    this.#confirm.disabled = this.#trimmed() === "";
  }

  connectedCallback(): void {
    if (!this.contains(this.#dialog)) this.append(this.#dialog);
    showModal(this, this.#dialog);
    this.#seeded = true;
    this.#input.focus();
    this.#input.select();
  }

  disconnectedCallback(): void {
    this.#dialog.close();
  }

  #trimmed(): string {
    return this.#input.value.trim();
  }

  #submit(): void {
    const value = this.#trimmed();
    if (value !== "") emit(this, "confirm", value);
  }
}

define("prompt-dialog", PromptDialog);
