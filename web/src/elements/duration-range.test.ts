import { fireEvent } from "@testing-library/dom";
import { afterEach, describe, it, expect, vi } from "vitest";
import { details, input, mount, primeSlider } from "../test/range-dom.ts";
import { DurationRange } from "./duration-range.ts";

interface Detail { minMs: number | null; maxMs: number | null }

/** 0..100 s evenly, so quantile ~ linear. */
const SECONDS = Array.from({ length: 101 }, (_, i) => i * 1000);

function make(props: Partial<Pick<DurationRange, "values" | "minMs" | "maxMs">> = {}) {
  const el = new DurationRange();
  Object.assign(el, props);
  mount(el);
  return { el, seen: details<Detail>(el) };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("duration-range", () => {
  it("registers, keeps the inputs and hints when nothing is indexed", () => {
    const { el } = make();
    expect(customElements.get("duration-range")).toBe(DurationRange);
    expect(el.className).toBe("duration-filter");
    expect(input(el, "Minimum duration in seconds")).toBeInTheDocument();
    expect(el.querySelector("range-slider")).toBeNull();
    expect(el.querySelector(".slider-note")).toHaveTextContent("∅");
  });

  it("converts seconds inputs to ms and clears to null", () => {
    const { el, seen } = make({ maxMs: 9000 });
    fireEvent.input(input(el, "Minimum duration in seconds"), {
      target: { value: "5" },
    });
    expect(seen.at(-1)).toEqual({ minMs: 5000, maxMs: 9000 });
    expect(input(el, "Maximum duration in seconds").value).toBe("9");
    fireEvent.input(input(el, "Maximum duration in seconds"), {
      target: { value: "" },
    });
    expect(seen.at(-1)).toEqual({ minMs: null, maxMs: null });
  });

  it("shows no note when all videos share one duration", () => {
    const { el } = make({ values: [4000, 4000] });
    expect(el.querySelector(".slider")).toBeNull();
    expect(el.querySelector(".slider-note")).toBeNull();
  });

  it("shows the slider and an h/m/s note for a real range", () => {
    const { el } = make({ values: SECONDS });
    expect(el.querySelector(".slider")).not.toBeNull();
    expect(el.querySelector(".slider-note")).toHaveTextContent("0s – 1m 40s");
    el.minMs = 5000;
    el.maxMs = 60_000;
    expect(el.querySelector(".slider-note")).toHaveTextContent("5s – 1m");
    expect(el.minMs).toBe(5000);
    expect(el.maxMs).toBe(60_000);
    expect(el.values).toBe(SECONDS);
  });

  it("maps a slider drag to bounds, clearing at the extremes", () => {
    const raise = make({ values: SECONDS });
    fireEvent.pointerDown(primeSlider(raise.el), { clientX: 30, pointerId: 1 });
    expect(raise.seen).toEqual([{ minMs: 30_000, maxMs: null }]);

    const upper = make({ values: SECONDS });
    fireEvent.pointerDown(primeSlider(upper.el), { clientX: 100, pointerId: 1 });
    expect(upper.seen).toEqual([{ minMs: null, maxMs: null }]);
  });

  it("keeps the first registration when the module is evaluated again", async () => {
    vi.resetModules();
    await import("./duration-range.ts");
    expect(customElements.get("duration-range")).toBe(DurationRange);
  });
});
