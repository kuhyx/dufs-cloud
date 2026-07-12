import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SizeRange } from "./size-range.tsx";

const MB = 1024 * 1024;
/** A uniform 0..100 MB distribution so quantile ≈ linear (pointer x ≈ MB). */
const UNIFORM = Array.from({ length: 101 }, (_, i) => i * MB);

function renderRange(opts: {
  values?: readonly number[];
  minSize?: number | null;
  maxSize?: number | null;
} = {}) {
  const onChange = vi.fn();
  render(
    <SizeRange
      values={opts.values ?? []}
      minSize={opts.minSize ?? null}
      maxSize={opts.maxSize ?? null}
      onChange={onChange}
    />,
  );
  return { onChange };
}

/** Give the most-recently-rendered slider a 0..100px geometry (pointer x == %). */
function primeSlider() {
  const all = document.querySelectorAll(".slider");
  const el = all[all.length - 1];
  if (el === undefined) throw new Error("no slider");
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
  return el;
}

describe("SizeRange", () => {
  it("shows only numeric inputs (no slider) before the index loads", () => {
    renderRange();
    expect(screen.getByLabelText("Minimum size in MB")).toBeInTheDocument();
    expect(document.querySelector(".slider")).toBeNull();
  });

  it("converts a min MB input to bytes and rounds the shown value", () => {
    const { onChange } = renderRange();
    fireEvent.change(screen.getByLabelText("Minimum size in MB"), {
      target: { value: "2" },
    });
    expect(onChange).toHaveBeenCalledWith(2 * MB, null);

    const bound = renderRange({ minSize: Math.round(3.14159 * MB) });
    const mins = screen.getAllByLabelText<HTMLInputElement>(
      "Minimum size in MB",
    );
    const last = mins[mins.length - 1];
    if (last === undefined) throw new Error("no min input");
    expect(last.value).toBe("3.1");
    fireEvent.change(last, { target: { value: "" } });
    expect(bound.onChange).toHaveBeenLastCalledWith(null, null);
  });

  it("converts a max MB input to bytes", () => {
    const { onChange } = renderRange();
    fireEvent.change(screen.getByLabelText("Maximum size in MB"), {
      target: { value: "3" },
    });
    expect(onChange).toHaveBeenCalledWith(null, 3 * MB);
  });

  it("collapses to a note when every file is the same size", () => {
    renderRange({ values: [4 * MB, 4 * MB] });
    expect(document.querySelector(".slider")).toBeNull();
    expect(screen.getByText(/all 4.0 MB/)).toBeInTheDocument();
  });

  it("shows the slider and a range note once a distribution is known", () => {
    renderRange({ values: UNIFORM });
    expect(document.querySelector(".slider")).not.toBeNull();
    expect(screen.getByText(/0 B – 100 MB/)).toBeInTheDocument();
  });

  it("maps a slider drag to a size bound, clearing at the extremes", () => {
    const raise = renderRange({ values: UNIFORM });
    fireEvent.pointerDown(primeSlider(), { clientX: 30, pointerId: 1 });
    expect(raise.onChange).toHaveBeenCalledWith(30 * MB, null);

    const floor = renderRange({ values: UNIFORM, minSize: 30 * MB });
    fireEvent.pointerDown(primeSlider(), { clientX: 0, pointerId: 1 });
    expect(floor.onChange).toHaveBeenLastCalledWith(null, null);

    const upper = renderRange({ values: UNIFORM });
    fireEvent.pointerDown(primeSlider(), { clientX: 70, pointerId: 1 });
    expect(upper.onChange).toHaveBeenLastCalledWith(null, 70 * MB);
  });
});
