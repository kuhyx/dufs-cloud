import { humanSize } from "../lib/paths.ts";
import { nth } from "../lib/quantile.ts";
import { RangeSlider } from "./range-slider.tsx";

interface SizeRangeProps {
  /** Ascending file sizes (bytes) in scope; empty before the index loads. */
  readonly values: readonly number[];
  readonly minSize: number | null;
  readonly maxSize: number | null;
  readonly onChange: (minSize: number | null, maxSize: number | null) => void;
}

const BYTES_PER_MB = 1024 * 1024;

/** Bytes → a MB string for a number input, rounded to 1 decimal so dragging the
 * slider doesn't spray long floats (which also jitters the layout). */
function mbValue(bytes: number | null): string {
  return bytes === null ? "" : String(Math.round((bytes / BYTES_PER_MB) * 10) / 10);
}

/** A MB input string → bytes, or null when the field is cleared. */
function bytesFromMb(text: string): number | null {
  return text === "" ? null : Number(text) * BYTES_PER_MB;
}

/**
 * The size filter: two numeric MB inputs plus — once the cloud index provides a
 * distribution — a quantile-scaled dual-thumb slider (see {@link RangeSlider}).
 * Pushing a handle to a bound clears that side (null), so "full range" means "no
 * size filter". Collapses to a note when every file is the same size.
 */
export function SizeRange({
  values,
  minSize,
  maxSize,
  onChange,
}: SizeRangeProps): React.JSX.Element {
  const min = values.length > 0 ? nth(values, 0) : 0;
  const max = values.length > 0 ? nth(values, values.length - 1) : 0;
  const hasRange = values.length > 1 && min < max;

  return (
    <div className="sizerange">
      <input
        className="filter-size"
        type="number"
        min="0"
        placeholder="min MB"
        aria-label="Minimum size in MB"
        value={mbValue(minSize)}
        onChange={(e) => {
          onChange(bytesFromMb(e.target.value), maxSize);
        }}
      />
      {hasRange && (
        <RangeSlider
          values={values}
          lo={minSize ?? min}
          hi={maxSize ?? max}
          onChange={(lo, hi) => {
            onChange(lo <= min ? null : lo, hi >= max ? null : hi);
          }}
        />
      )}
      <input
        className="filter-size"
        type="number"
        min="0"
        placeholder="max MB"
        aria-label="Maximum size in MB"
        value={mbValue(maxSize)}
        onChange={(e) => {
          onChange(minSize, bytesFromMb(e.target.value));
        }}
      />
      {values.length > 0 && !hasRange && (
        <span className="muted slider-note">all {humanSize(min)}</span>
      )}
      {hasRange && (
        <span className="muted slider-note">
          {humanSize(minSize ?? min)} – {humanSize(maxSize ?? max)}
        </span>
      )}
    </div>
  );
}
