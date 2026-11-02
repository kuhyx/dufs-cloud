/** Dispatches a bubbling, composed CustomEvent from `el`. */
export function emit(el: Element, name: string, detail?: unknown): void {
  el.dispatchEvent(
    new CustomEvent(name, { detail, bubbles: true, composed: true }),
  );
}
