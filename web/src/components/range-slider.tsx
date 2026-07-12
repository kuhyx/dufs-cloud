import { useState } from "react";
import { clamp01, quantileValue, valueQuantile } from "../lib/quantile.ts";

interface RangeSliderProps {
  /** The sorted (ascending) distribution the track is scaled to. */
  readonly values: readonly number[];
  /** Current thumb values, already resolved (callers pass min/max for "unset"). */
  readonly lo: number;
  readonly hi: number;
  /** Reports both thumb values (raw, clamped so lo ≤ hi) on every change. */
  readonly onChange: (lo: number, hi: number) => void;
}

/** The pointer's position along the track as a fraction (0..1). Pure, so the
 * geometry is testable without layout (jsdom gives none). */
export function fractionFromPointer(rect: DOMRect, clientX: number): number {
  return rect.width === 0 ? 0 : clamp01((clientX - rect.left) / rect.width);
}

/**
 * A fully-controlled dual-thumb slider whose scale follows the *distribution* of
 * `values` (quantile-mapped), not a linear min→max ramp. Dragging to the middle
 * of the track selects the median, so equal track distance ≈ equal number of
 * items — the intuitive behaviour when values are lopsided (many small, few
 * huge). Pressing anywhere grabs the nearer thumb; pointer capture keeps the
 * drag alive off the track. Deals only in raw values; callers translate the
 * extremes to "no filter".
 */
export function RangeSlider({
  values,
  lo,
  hi,
  onChange,
}: RangeSliderProps): React.JSX.Element {
  const [drag, setDrag] = useState<"lo" | "hi" | null>(null);
  const pct = (v: number): number => valueQuantile(values, v) * 100;

  function apply(which: "lo" | "hi", value: number): void {
    if (which === "lo") onChange(Math.min(value, hi), hi);
    else onChange(lo, Math.max(value, lo));
  }

  function valueAt(e: React.PointerEvent<HTMLSpanElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    return quantileValue(values, fractionFromPointer(rect, e.clientX));
  }

  return (
    <span
      className="slider"
      onPointerDown={(e) => {
        const value = valueAt(e);
        const which = Math.abs(value - lo) <= Math.abs(value - hi) ? "lo" : "hi";
        setDrag(which);
        e.currentTarget.setPointerCapture(e.pointerId);
        apply(which, value);
      }}
      onPointerMove={(e) => {
        if (drag === null) return;
        apply(drag, valueAt(e));
      }}
      onPointerUp={(e) => {
        if (drag === null) return;
        setDrag(null);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    >
      <span className="slider-track" />
      <span
        className="slider-fill"
        style={{ left: `${String(pct(lo))}%`, right: `${String(100 - pct(hi))}%` }}
      />
      <span className="slider-thumb slider-lo" style={{ left: `${String(pct(lo))}%` }} />
      <span className="slider-thumb slider-hi" style={{ left: `${String(pct(hi))}%` }} />
    </span>
  );
}
