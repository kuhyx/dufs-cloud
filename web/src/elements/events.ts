/** Fire a bubbling, composed CustomEvent: the element form of a callback prop. */
export function emit(el: Element, name: string, detail?: unknown): void {
  el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
}

/** Register `ctor` as `tag` unless a previous import already did. */
export function define(tag: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}
