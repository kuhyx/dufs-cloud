// <transfer-banner> props: progress (TransferProgress). Events: cancel.
import {
  transferDetail,
  transferFraction,
  transferTitle,
  type TransferProgress,
} from "../lib/transfer.ts";
import { h } from "./dom.ts";
import { define, emit } from "./element-kit.ts";

export class TransferBanner extends HTMLElement {
  #progress: TransferProgress | null = null;
  readonly #title = h("div", { class: "transfer-title" });
  readonly #detail = h("div", { class: "transfer-detail" });
  readonly #bar = h("progress", { class: "transfer-bar" });

  get progress(): TransferProgress | null {
    return this.#progress;
  }

  set progress(value: TransferProgress | null) {
    this.#progress = value;
    if (value === null) return;
    this.#title.replaceChildren(transferTitle(value));
    this.#detail.replaceChildren(transferDetail(value));
    const fraction = transferFraction(value);
    // An indeterminate <progress> has no value attribute at all.
    if (fraction === null) {
      this.#bar.removeAttribute("value");
      this.#bar.removeAttribute("max");
    } else {
      this.#bar.max = 1;
      this.#bar.value = fraction;
    }
  }

  connectedCallback(): void {
    if (this.firstChild) return;
    this.style.display = "contents";
    this.append(
      h(
        "div",
        { class: "transfer", role: "status" },
        h("div", { class: "transfer-text" }, this.#title, this.#detail, this.#bar),
        h(
          "button",
          {
            type: "button",
            class: "ghost",
            onclick: () => {
              emit(this, "cancel");
            },
          },
          "Cancel",
        ),
      ),
    );
  }
}

define("transfer-banner", TransferBanner);
