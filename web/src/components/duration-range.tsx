import { formatDuration } from "../lib/paths.ts";
import { nth } from "../lib/quantile.ts";
import { RangeSlider } from "./range-slider.tsx";

interface DurationRangeProps {
  /** Ascending video durations (ms) in scope; empty when none are indexed. */
  readonly values: readonly number[];
  readonly minMs: number | null;
  readonly maxMs: number | null;
  readonly onChange: (minMs: number | null, maxMs: number | null) => void;
}

/** Milliseconds → whole-seconds string for a duration input (empty when unset). */
function secValue(ms: number | null): string {
  return ms === null ? "" : String(Math.round(ms / 1000));
}

/** A seconds input string → milliseconds, or null when the field is cleared. */
function msFromSec(text: string): number | null {
  return text === "" ? null : Number(text) * 1000;
}

/**
 * The video-duration filter: min/max seconds inputs plus a quantile-scaled
 * slider bounded to the indexed videos in scope. Mirrors {@link SizeRange}.
 * Shown whenever the type filter is Video (the inputs stay visible even before
 * an index provides a distribution); the slider appears once there is a real
 * range. Labels use h/m/s (e.g. "1h 24m 33s"). Durations come from the metadata
 * index — if none are indexed, only the inputs show, with a hint.
 */
export function DurationRange({
  values,
  minMs,
  maxMs,
  onChange,
}: DurationRangeProps): React.JSX.Element {
  const min = values.length > 0 ? nth(values, 0) : 0;
  const max = values.length > 0 ? nth(values, values.length - 1) : 0;
  const hasRange = values.length > 1 && min < max;

  return (
    <span className="duration-filter">
      <input
        className="filter-size"
        type="number"
        min="0"
        placeholder="min s"
        aria-label="Minimum duration in seconds"
        value={secValue(minMs)}
        onChange={(e) => {
          onChange(msFromSec(e.target.value), maxMs);
        }}
      />
      {hasRange && (
        <RangeSlider
          values={values}
          lo={minMs ?? min}
          hi={maxMs ?? max}
          onChange={(lo, hi) => {
            onChange(lo <= min ? null : lo, hi >= max ? null : hi);
          }}
        />
      )}
      <input
        className="filter-size"
        type="number"
        min="0"
        placeholder="max s"
        aria-label="Maximum duration in seconds"
        value={secValue(maxMs)}
        onChange={(e) => {
          onChange(minMs, msFromSec(e.target.value));
        }}
      />
      {values.length === 0 && (
        <span className="muted slider-note">no durations indexed</span>
      )}
      {hasRange && (
        <span className="muted slider-note">
          {formatDuration(minMs ?? min)} – {formatDuration(maxMs ?? max)}
        </span>
      )}
    </span>
  );
}
