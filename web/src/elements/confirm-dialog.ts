// <confirm-dialog> props: message, confirmLabel. Events: confirm, cancel.
import { h } from "./dom.ts";
import { define, emit } from "./element-kit.ts";
import { modal, showModal } from "./modal.ts";

export class ConfirmDialog extends HTMLElement {
  readonly #message = h("p");
  readonly #confirm = h(
    "button",
    {
      type: "button",
      class: "danger",
      onclick: () => {
        emit(this, "confirm");
      },
    },
  );
  readonly #dialog = modal(
    "dialog",
    () => {
      emit(this, "cancel");
    },
    true,
    this.#message,
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

  get message(): string {
    return this.#message.textContent;
  }

  set message(value: string) {
    this.#message.replaceChildren(value);
  }

  get confirmLabel(): string {
    return this.#confirm.textContent;
  }

  set confirmLabel(value: string) {
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
