// <confirm-dialog> props: message (spoken), glyph + subject (painted: what
// and on which entry or count), confirmLabel (spoken), confirmGlyph (painted).
// Events: confirm, cancel.
import { h } from "./dom.ts";
import { define, emit } from "./element-kit.ts";
import { modal, showModal } from "./modal.ts";

export class ConfirmDialog extends HTMLElement {
  #message = "";
  readonly #glyph = h("span", { class: "confirm-glyph", "aria-hidden": "true" });
  readonly #subject = h("span", { class: "confirm-subject" });
  readonly #body = h("p", { class: "confirm-body" }, this.#glyph, this.#subject);
  readonly #confirm = h(
    "button",
    {
      type: "button",
      class: "danger",
      onclick: () => {
        emit(this, "confirm");
      },
    },
    "✓",
  );
  readonly #dialog = modal(
    "dialog",
    () => {
      emit(this, "cancel");
    },
    true,
    this.#body,
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

  get message(): string {
    return this.#message;
  }

  set message(value: string) {
    this.#message = value;
    this.#dialog.setAttribute("aria-label", value);
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

  get confirmLabel(): string {
    return this.#confirm.getAttribute("aria-label") ?? "";
  }

  set confirmLabel(value: string) {
    this.#confirm.setAttribute("aria-label", value);
  }

  get confirmGlyph(): string {
    return this.#confirm.textContent;
  }

  set confirmGlyph(value: string) {
    this.#confirm.replaceChildren(value);
  }

  connectedCallback(): void {
    if (!this.contains(this.#dialog)) this.append(this.#dialog);
    showModal(this, this.#dialog);
  }

  disconnectedCallback(): void {
    this.#dialog.close();
  }
}

define("confirm-dialog", ConfirmDialog);
