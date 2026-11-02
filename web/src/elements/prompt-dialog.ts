// <prompt-dialog> props: title, placeholder, confirmLabel, initialValue.
// Events: confirm (detail: trimmed value), cancel.
import { h } from "./dom.ts";
import { define, emit } from "./element-kit.ts";
import { modal, showModal } from "./modal.ts";

export class PromptDialog extends HTMLElement {
  #seeded = false;
  #initialValue = "";
  readonly #title = h("p");
  readonly #input = h("input", { class: "prompt-input", type: "text" });
  readonly #confirm = h("button", { type: "button", class: "primary", disabled: true });
  readonly #dialog = modal(
    "dialog",
    () => {
      emit(this, "cancel");
    },
    true,
    this.#title,
    this.#input,
    h(
      "div",
      { class: "dialog-actions" },
      h(
        "button",
        {
          type: "button",
          onclick: () => {
            emit(this, "cancel");
          },
        },
        "Cancel",
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

  override get title(): string {
    return this.#title.textContent;
  }

  override set title(value: string) {
    this.#title.replaceChildren(value);
    this.#input.setAttribute("aria-label", value);
  }

  get placeholder(): string {
    return this.#input.placeholder;
  }

  set placeholder(value: string) {
    this.#input.placeholder = value;
  }

  get confirmLabel(): string {
    return this.#confirm.textContent;
  }

  set confirmLabel(value: string) {
    this.#confirm.replaceChildren(value);
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
