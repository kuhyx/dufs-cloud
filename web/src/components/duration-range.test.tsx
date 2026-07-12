import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DurationRange } from "./duration-range.tsx";

/** Uniform 0..100s distribution (ms) so quantile ≈ linear (pointer x ≈ seconds). */
const UNIFORM = Array.from({ length: 101 }, (_, i) => i * 1000);

function renderRange(opts: {
  values?: readonly number[];
  minMs?: number | null;
  maxMs?: number | null;
} = {}) {
  const onChange = vi.fn();
  render(
    <DurationRange
      values={opts.values ?? []}
      minMs={opts.minMs ?? null}
      maxMs={opts.maxMs ?? null}
      onChange={onChange}
    />,
  );
  return { onChange };
}

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

describe("DurationRange", () => {
  it("shows the second inputs and a hint when nothing is indexed", () => {
    renderRange();
    expect(
      screen.getByLabelText("Minimum duration in seconds"),
    ).toBeInTheDocument();
    expect(screen.getByText("no durations indexed")).toBeInTheDocument();
    expect(document.querySelector(".slider")).toBeNull();
  });

  it("converts seconds to ms and shows an existing bound", () => {
    const { onChange } = renderRange({ minMs: 30_000 });
    const min = screen.getByLabelText<HTMLInputElement>(
      "Minimum duration in seconds",
    );
    expect(min.value).toBe("30");
    fireEvent.change(screen.getByLabelText("Maximum duration in seconds"), {
      target: { value: "90" },
    });
    expect(onChange).toHaveBeenCalledWith(30_000, 90_000);
    fireEvent.change(min, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null, null);
  });

  it("renders a slider with an h/m/s range label", () => {
    // 0 .. 5073s → label reads "0s – 1h 24m 33s".
    renderRange({ values: [0, 5_073_000] });
    expect(document.querySelector(".slider")).not.toBeNull();
    expect(screen.getByText(/0s – 1h 24m 33s/)).toBeInTheDocument();
  });

  it("maps a slider drag to a duration bound, clearing at the extremes", () => {
    const set = renderRange({ values: UNIFORM });
    fireEvent.pointerDown(primeSlider(), { clientX: 40, pointerId: 1 });
    expect(set.onChange).toHaveBeenCalledWith(40_000, null);

    const ceil = renderRange({ values: UNIFORM, maxMs: 40_000 });
    fireEvent.pointerDown(primeSlider(), { clientX: 100, pointerId: 1 });
    expect(ceil.onChange).toHaveBeenLastCalledWith(null, null);

    const upper = renderRange({ values: UNIFORM });
    fireEvent.pointerDown(primeSlider(), { clientX: 70, pointerId: 1 });
    expect(upper.onChange).toHaveBeenLastCalledWith(null, 70_000);
  });
});
