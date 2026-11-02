import { describe, it, expect, vi } from "vitest";
import { clear, h } from "./dom.ts";
import { define, emit, reactive, setProps, syncChildren, upgradeProps } from "./element-kit.ts";

describe("h and clear", () => {
  it("sets string, number and boolean attributes, skips false/null/undefined", () => {
    const onClick = vi.fn();
    const el = h(
      "button",
      { title: "t", tabindex: 2, disabled: true, hidden: false, "data-x": null, "data-y": undefined, onClick },
      "a",
      null,
      undefined,
      false,
      h("span", undefined, "b"),
    );
    expect(el.getAttribute("title")).toBe("t");
    expect(el.getAttribute("tabindex")).toBe("2");
    expect(el.getAttribute("disabled")).toBe("");
    expect(el.hasAttribute("hidden")).toBe(false);
    expect(el.hasAttribute("data-x")).toBe(false);
    expect(el.hasAttribute("data-y")).toBe(false);
    expect(el.textContent).toBe("ab");
    el.dispatchEvent(new Event("click"));
    expect(onClick).toHaveBeenCalledTimes(1);
    clear(el);
    expect(el.childNodes).toHaveLength(0);
  });
});

describe("emit", () => {
  it("dispatches a bubbling, composed CustomEvent with the detail", () => {
    const parent = h("div");
    const child = h("span");
    parent.append(child);
    const seen = vi.fn();
    parent.addEventListener("ping", (e) => {
      const ev = e as CustomEvent;
      seen(ev.detail, ev.bubbles, ev.composed);
    });
    emit(child, "ping", 7);
    expect(seen).toHaveBeenCalledWith(7, true, true);
  });
});

describe("upgradeProps", () => {
  it("routes own props assigned before the upgrade through the setter", () => {
    const el = document.createElement("kit-late") as HTMLElement & { value?: unknown };
    el.value = "early";
    const set = vi.fn();
    class Late extends HTMLElement {
      constructor() {
        super();
        upgradeProps(this, ["value", "absent"]);
      }
      set value(v: unknown) {
        set(v);
      }
    }
    define("kit-late", Late);
    customElements.upgrade(el);
    expect(set).toHaveBeenCalledWith("early");
    expect(Object.prototype.hasOwnProperty.call(el, "value")).toBe(false);
  });
});

describe("define", () => {
  it("registers once and ignores a second definition", () => {
    class A extends HTMLElement {}
    class B extends HTMLElement {}
    define("kit-once", A);
    define("kit-once", B);
    expect(customElements.get("kit-once")).toBe(A);
  });
});

describe("syncChildren", () => {
  it("removes, inserts and reorders without moving nodes already in place", () => {
    const parent = h("div");
    const [a, b, c, d] = ["a", "b", "c", "d"].map((t) => h("span", {}, t)) as [
      HTMLElement, HTMLElement, HTMLElement, HTMLElement,
    ];
    parent.append(a, b, c);
    const removed = vi.spyOn(a, "remove");
    syncChildren(parent, [a, c, d]);
    expect([...parent.childNodes]).toEqual([a, c, d]);
    expect(removed).not.toHaveBeenCalled();
    syncChildren(parent, [d, a]);
    expect([...parent.childNodes]).toEqual([d, a]);
  });
});

describe("reactive", () => {
  it("stores props and re-renders on every set", () => {
    class R {
      readonly props: Record<string, unknown> = { size: 1 };
      render = vi.fn();
      declare size: number;
    }
    reactive(R, ["size"]);
    const r = new R();
    expect(r.size).toBe(1);
    r.size = 3;
    expect(r.props.size).toBe(3);
    expect(r.render).toHaveBeenCalledTimes(1);
  });
});

describe("setProps", () => {
  it("assigns only the values that changed", () => {
    const set = vi.fn();
    const target = { a: 1, get b(): number { return 2; }, set b(v: number) { set(v); } };
    setProps(target, { a: 3, b: 2 });
    expect(target.a).toBe(3);
    expect(set).not.toHaveBeenCalled();
  });
});
