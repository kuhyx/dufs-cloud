import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RangeSlider, fractionFromPointer } from "./range-slider.tsx";

/** A uniform 0..100 distribution so quantile ≈ linear (pointer x ≈ value). */
const UNIFORM = Array.from({ length: 101 }, (_, i) => i);

function renderSlider(lo: number, hi: number, values: readonly number[] = UNIFORM) {
  const onChange = vi.fn();
  render(<RangeSlider values={values} lo={lo} hi={hi} onChange={onChange} />);
  const el = document.querySelector(".slider");
  if (el === null) throw new Error("no slider");
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: 0,
    width: 100,
    top: 0,
    right: 100,
    bottom: 10,
    height: 10,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return { onChange, track: el };
}

describe("fractionFromPointer", () => {
  const rect = { left: 0, width: 100 } as DOMRect;
  it("maps x to a 0..1 fraction and clamps the ends", () => {
    expect(fractionFromPointer(rect, 50)).toBe(0.5);
    expect(fractionFromPointer(rect, -10)).toBe(0);
    expect(fractionFromPointer(rect, 200)).toBe(1);
  });
  it("returns 0 for a zero-width track (no layout)", () => {
    expect(fractionFromPointer({ left: 0, width: 0 } as DOMRect, 40)).toBe(0);
  });
});

describe("RangeSlider", () => {
  it("renders two thumbs", () => {
    renderSlider(0, 100);
    expect(document.querySelector(".slider-lo")).not.toBeNull();
    expect(document.querySelector(".slider-hi")).not.toBeNull();
  });

  it("pressing near the low thumb grabs and moves it", () => {
    const { onChange, track } = renderSlider(0, 100);
    fireEvent.pointerDown(track, { clientX: 30, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(30, 100);
  });

  it("pressing near the high thumb grabs and moves it", () => {
    const { onChange, track } = renderSlider(0, 100);
    fireEvent.pointerDown(track, { clientX: 80, pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(0, 80);
  });

  it("clamps the low thumb so it cannot cross the high thumb", () => {
    const { onChange, track } = renderSlider(0, 50);
    fireEvent.pointerDown(track, { clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 90, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(50, 50);
    fireEvent.pointerUp(track, { pointerId: 1 });
  });

  it("clamps the high thumb so it cannot cross the low thumb", () => {
    const { onChange, track } = renderSlider(60, 100);
    fireEvent.pointerDown(track, { clientX: 95, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 20, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(60, 60);
  });

  it("ignores moves and ups when no thumb is held", () => {
    const { onChange, track } = renderSlider(0, 100);
    fireEvent.pointerMove(track, { clientX: 50, pointerId: 1 });
    fireEvent.pointerUp(track, { pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
