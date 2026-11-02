import { getByLabelText, getByRole, queryByLabelText } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
import { details, mount } from "../test/range-dom.ts";
import { ExtensionPicker } from "./extension-picker.ts";

interface Detail { includes: string[]; excludes: string[] }

function make(
  props: Partial<Pick<ExtensionPicker, "available" | "includes" | "excludes">> = {},
) {
  const el = new ExtensionPicker();
  el.available = props.available ?? ["jpg", "png", "webp"];
  el.includes = props.includes ?? [];
  el.excludes = props.excludes ?? [];
  mount(el);
  return { el, seen: details<Detail>(el) };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("extension-picker", () => {
  it("registers, summarises the selection and toggles the menu", async () => {
    const { el } = make();
    expect(customElements.get("extension-picker")).toBe(ExtensionPicker);
    expect(el.className).toBe("extpicker");
    const btn = getByRole(el, "button", { name: /Any ext/ });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveAttribute("aria-haspopup", "true");
    expect(queryByLabelText(el, "webp: off")).toBeNull();
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(getByLabelText(el, "webp: off")).toBeInTheDocument();
    expect(el.querySelector(".extpicker-hint")).toHaveTextContent(
      "Click to cycle: keep ✓ · drop ✕",
    );
    await userEvent.click(btn);
    expect(el.querySelector(".extpicker-menu")).toBeNull();
  });

  it("closes through the backdrop", async () => {
    const { el } = make();
    await userEvent.click(getByRole(el, "button", { name: /Any ext/ }));
    await userEvent.click(getByLabelText(el, "Close extension menu"));
    expect(el.querySelector(".extpicker-menu")).toBeNull();
    expect(el.querySelector(".extpicker-backdrop")).toBeNull();
  });

  it("cycles off → include → exclude → off", async () => {
    const off = make();
    await userEvent.click(getByRole(off.el, "button", { name: /Any ext/ }));
    await userEvent.click(getByLabelText(off.el, "webp: off"));
    expect(off.seen).toEqual([{ includes: ["webp"], excludes: [] }]);

    const inc = make({ includes: ["webp"] });
    await userEvent.click(getByRole(inc.el, "button", { name: "webp ▾" }));
    await userEvent.click(getByLabelText(inc.el, "webp: include"));
    expect(inc.seen).toEqual([{ includes: [], excludes: ["webp"] }]);

    const exc = make({ excludes: ["webp"] });
    await userEvent.click(getByRole(exc.el, "button", { name: "not webp ▾" }));
    await userEvent.click(getByLabelText(exc.el, "webp: exclude"));
    expect(exc.seen).toEqual([{ includes: [], excludes: [] }]);
  });

  it("keeps the other extensions when one cycles", async () => {
    const { el, seen } = make({ includes: ["png"], excludes: ["jpg"] });
    await userEvent.click(getByRole(el, "button", { name: "png · not jpg ▾" }));
    await userEvent.click(getByLabelText(el, "webp: off"));
    expect(seen).toEqual([{ includes: ["png", "webp"], excludes: ["jpg"] }]);
  });

  it("shows glyph and state class per option", async () => {
    const { el } = make({ includes: ["png"], excludes: ["webp"] });
    await userEvent.click(getByRole(el, "button", { name: /png/ }));
    const glyph = (label: string): string | null | undefined =>
      getByLabelText(el, label).querySelector(".ext-glyph")?.textContent;
    expect(glyph("jpg: off")).toBe("☐");
    expect(glyph("png: include")).toBe("✓");
    expect(glyph("webp: exclude")).toBe("✕");
    expect(getByLabelText(el, "png: include")).toHaveClass("extpicker-opt", "ext-include");
    expect(el.querySelector(".ext-glyph")).toHaveAttribute("aria-hidden", "true");
  });

  it("explains an empty scope", async () => {
    const { el } = make({ available: [] });
    await userEvent.click(getByRole(el, "button", { name: /Any ext/ }));
    expect(el.querySelector(".extpicker-empty")).toHaveTextContent("No extensions in view.");
  });

  it("keeps focus on the same option and the toggle across re-renders", async () => {
    const { el } = make();
    const btn = getByRole(el, "button", { name: /Any ext/ });
    await userEvent.click(btn);
    expect(btn).toHaveFocus();
    await userEvent.click(getByLabelText(el, "png: off"));
    el.includes = ["png"];
    expect(getByLabelText(el, "png: include")).toHaveFocus();
    expect(el.available).toEqual(["jpg", "png", "webp"]);
    expect(el.includes).toEqual(["png"]);
    expect(el.excludes).toEqual([]);
  });

  it("keeps the first registration when the module is evaluated again", async () => {
    vi.resetModules();
    await import("./extension-picker.ts");
    expect(customElements.get("extension-picker")).toBe(ExtensionPicker);
  });
});
