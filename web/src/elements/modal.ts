import { h, type Child } from "./dom.ts";

/** `<dialog class="overlay">` around `<div class="dialog …">`. Escape and,
 * when `backdrop` is set, a click outside the box call `dismiss`. */
export function modal(
  boxClass: string,
  dismiss: () => void,
  backdrop: boolean,
  ...children: readonly Child[]
): HTMLDialogElement {
  const dialog = h(
    "dialog",
    { class: "overlay", role: "dialog", "aria-modal": "true" },
    h("div", { class: boxClass }, ...children),
  );
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    dismiss();
  });
  if (backdrop) {
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dismiss();
    });
  }
  return dialog;
}

export function showModal(host: HTMLElement, dialog: HTMLDialogElement): void {
  host.style.display = "contents";
  dialog.showModal();
}
