import { fireEvent } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
import { details, input, MB, mount, primeSlider, UNIFORM } from "../test/range-dom.ts";
import { SizeRange } from "./size-range.ts";

interface Detail { minSize: number | null; maxSize: number | null }

function make(props: Partial<Pick<SizeRange, "values" | "minSize" | "maxSize">> = {}) {
  const el = new SizeRange();
  Object.assign(el, props);
  mount(el);
  return { el, seen: details<Detail>(el) };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("size-range", () => {
  it("registers and shows only numeric inputs before the index loads", () => {
    const { el } = make();
    expect(customElements.get("size-range")).toBe(SizeRange);
    expect(el.className).toBe("sizerange");
    expect(input(el, "Minimum size in MB")).toBeInTheDocument();
    expect(el.querySelector("range-slider")).toBeNull();
    expect(el.querySelector(".slider-note")).toBeNull();
  });

  it("converts a min MB input to bytes and clears to null", async () => {
    const { el, seen } = make();
    await userEvent.type(input(el, "Minimum size in MB"), "2");
    expect(seen).toEqual([{ minSize: 2 * MB, maxSize: null }]);
    el.minSize = Math.round(3.14159 * MB);
    expect(input(el, "Minimum size in MB").value).toBe("3.1");
    fireEvent.input(input(el, "Minimum size in MB"), { target: { value: "" } });
    expect(seen.at(-1)).toEqual({ minSize: null, maxSize: null });
  });

  it("converts a max MB input to bytes, keeping the min", () => {
    const { el, seen } = make({ minSize: MB });
    fireEvent.input(input(el, "Maximum size in MB"), { target: { value: "3" } });
    expect(seen).toEqual([{ minSize: MB, maxSize: 3 * MB }]);
  });

  it("keeps the focused input when the parent writes the value back", async () => {
    const { el } = make();
    const field = input(el, "Minimum size in MB");
    await userEvent.type(field, "5");
    el.minSize = 5 * MB;
    expect(input(el, "Minimum size in MB")).toBe(field);
    expect(field).toHaveFocus();
  });

  it("collapses to a note when every file is the same size", () => {
    const { el } = make({ values: [4 * MB, 4 * MB] });
    expect(el.querySelector(".slider")).toBeNull();
    expect(el.querySelector(".slider-note")).toHaveTextContent("all 4.0 MB");
  });

  it("shows the slider and a range note once a distribution is known", () => {
    const { el } = make({ values: UNIFORM });
    expect(el.querySelector(".slider")).not.toBeNull();
    expect(el.querySelector(".slider-note")).toHaveTextContent("0 B – 100 MB");
    el.minSize = 10 * MB;
    el.maxSize = 20 * MB;
    expect(el.querySelector(".slider-note")).toHaveTextContent("10 MB – 20 MB");
  });

  it("maps a slider drag to a size bound, clearing at the extremes", () => {
    const raise = make({ values: UNIFORM });
    fireEvent.pointerDown(primeSlider(raise.el), { clientX: 30, pointerId: 1 });
    expect(raise.seen).toEqual([{ minSize: 30 * MB, maxSize: null }]);

    const floor = make({ values: UNIFORM, minSize: 30 * MB });
    fireEvent.pointerDown(primeSlider(floor.el), { clientX: 0, pointerId: 1 });
    expect(floor.seen.at(-1)).toEqual({ minSize: null, maxSize: null });

    const upper = make({ values: UNIFORM });
    fireEvent.pointerDown(primeSlider(upper.el), { clientX: 70, pointerId: 1 });
    expect(upper.seen.at(-1)).toEqual({ minSize: null, maxSize: 70 * MB });
  });

  it("does not leak the slider's or inputs' native change events", () => {
    const { el } = make({ values: UNIFORM });
    const leaked: Event[] = [];
    document.addEventListener("change", (e) => leaked.push(e));
    fireEvent.change(input(el, "Minimum size in MB"));
    fireEvent.pointerDown(primeSlider(el), { clientX: 30, pointerId: 1 });
    expect(leaked.every((e) => e instanceof CustomEvent && "minSize" in (e.detail as object))).toBe(true);
    expect(leaked).toHaveLength(1);
  });

  it("renders props set before it is attached", () => {
    const el = new SizeRange();
    el.values = UNIFORM;
    el.maxSize = 50 * MB;
    expect(el.values).toBe(UNIFORM);
    expect(el.minSize).toBeNull();
    expect(el.maxSize).toBe(50 * MB);
    mount(el);
    expect(input(el, "Maximum size in MB").value).toBe("50");
  });

  it("keeps the first registration when the module is evaluated again", async () => {
    vi.resetModules();
    await import("./size-range.ts");
    expect(customElements.get("size-range")).toBe(SizeRange);
  });
});
