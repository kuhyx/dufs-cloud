export function emit(el: Element, type: string, detail?: unknown): void {
  el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

/** Route props assigned before the upgrade through the class setters. */
export function upgradeProps(el: HTMLElement, names: readonly string[]): void {
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(el, name)) continue;
    const value: unknown = Reflect.get(el, name);
    Reflect.deleteProperty(el, name);
    Reflect.set(el, name, value);
  }
}

/** Make the children exactly `nodes`, moving none that are already in place. */
export function syncChildren(parent: Element, nodes: readonly Node[]): void {
  const keep = new Set(nodes);
  for (const child of [...parent.childNodes]) {
    if (!keep.has(child)) child.remove();
  }
  nodes.forEach((node, i) => {
    const at = parent.childNodes[i];
    if (at !== node) parent.insertBefore(node, at ?? null);
  });
}

export function define(tag: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}

interface Reactive {
  readonly props: Record<string, unknown>;
  render: () => void;
}

/** Accessors for `names` that store into `props` and re-render on set. */
export function reactive(ctor: { prototype: object }, names: readonly string[]): void {
  for (const name of names) {
    Object.defineProperty(ctor.prototype, name, {
      configurable: true,
      get(this: Reactive) {
        return this.props[name];
      },
      set(this: Reactive, v: unknown) {
        this.props[name] = v;
        this.render();
      },
    });
  }
}

/** Assign only changed props, so unchanged children skip their re-render. */
export function setProps(el: object, props: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(props)) {
    if (!Object.is(Reflect.get(el, key), value)) Reflect.set(el, key, value);
  }
}
