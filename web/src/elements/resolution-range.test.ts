import { fireEvent } from "@testing-library/dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import { details, input, mount } from "../test/range-dom.ts";
import { ResolutionRange } from "./resolution-range.ts";

interface Detail { minPixels: number | null; maxPixels: number | null }

function make(min: number | null = null, max: number | null = null) {
  const el = new ResolutionRange();
  el.minPixels = min;
  el.maxPixels = max;
  mount(el);
  return { el, seen: details<Detail>(el) };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("resolution-range", () => {
  it("registers and renders two megapixel inputs", () => {
    const { el } = make();
    expect(customElements.get("resolution-range")).toBe(ResolutionRange);
    expect(el.className).toBe("resrange");
    expect(el.querySelectorAll("input.filter-size")).toHaveLength(2);
    expect(input(el, "Minimum resolution in megapixels").placeholder).toBe("≥ MP");
    expect(input(el, "Maximum resolution in megapixels").placeholder).toBe("≤ MP");
  });

  it("converts MP to pixels on both sides and clears to null", () => {
    const { el, seen } = make(2_000_000, 8_000_000);
    fireEvent.input(input(el, "Minimum resolution in megapixels"), {
      target: { value: "1.5" },
    });
    expect(seen.at(-1)).toEqual({ minPixels: 1_500_000, maxPixels: 8_000_000 });
    fireEvent.input(input(el, "Maximum resolution in megapixels"), {
      target: { value: "" },
    });
    expect(seen.at(-1)).toEqual({ minPixels: 2_000_000, maxPixels: null });
  });

  it("rounds the shown value to one decimal and follows prop updates", () => {
    const { el } = make(Math.round(2.04 * 1_000_000));
    expect(input(el, "Minimum resolution in megapixels").value).toBe("2");
    el.maxPixels = 12_345_678;
    expect(el.maxPixels).toBe(12_345_678);
    expect(el.minPixels).toBe(2_040_000);
    expect(input(el, "Maximum resolution in megapixels").value).toBe("12.3");
    el.maxPixels = null;
    expect(input(el, "Maximum resolution in megapixels").value).toBe("");
  });

  it("does not leak the native change event", () => {
    const { el } = make();
    let leaked = 0;
    document.addEventListener("change", () => leaked++);
    fireEvent.change(input(el, "Minimum resolution in megapixels"));
    expect(leaked).toBe(0);
  });

  it("keeps its inputs across re-renders", () => {
    const { el } = make();
    const field = input(el, "Minimum resolution in megapixels");
    el.minPixels = 3_000_000;
    expect(input(el, "Minimum resolution in megapixels")).toBe(field);
  });

  it("keeps the first registration when the module is evaluated again", async () => {
    vi.resetModules();
    await import("./resolution-range.ts");
    expect(customElements.get("resolution-range")).toBe(ResolutionRange);
  });
});
