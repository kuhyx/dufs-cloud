import { describe, it, expect } from "vitest";
import { clear, h } from "./dom.ts";

describe("dom helpers", () => {
  it("builds an element with attributes and children", () => {
    const el = h("a", { href: "/x", hidden: true, title: undefined, "data-off": false }, "go", h("b"));
    expect(el.outerHTML).toBe('<a href="/x" hidden="">go<b></b></a>');
  });

  it("clears an element", () => {
    const el = h("div", {}, "a", "b");
    clear(el);
    expect(el.childNodes).toHaveLength(0);
  });
});
