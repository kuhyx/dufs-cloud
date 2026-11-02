// <duration-range> props: values (ascending ms), minMs, maxMs (ms|null). Event: change {minMs, maxMs}.
import { formatDuration } from "../lib/paths.ts";
import { NumericRange, type NumericRangeSpec } from "./numeric-range.ts";

const SPEC: NumericRangeSpec = {
  className: "duration-filter",
  placeholders: ["min s", "max s"],
  labels: ["Minimum duration in seconds", "Maximum duration in seconds"],
  keys: ["minMs", "maxMs"],
  toText: (ms) => (ms === null ? "" : String(Math.round(ms / 1000))),
  fromText: (text) => (text === "" ? null : Number(text) * 1000),
  note: (values, { lo, hi }, hasRange) => {
    if (hasRange) return `${formatDuration(lo)} – ${formatDuration(hi)}`;
    return values.length === 0 ? "no durations indexed" : null;
  },
};

export class DurationRange extends NumericRange {
  protected readonly spec = SPEC;
  get values(): readonly number[] {
    return this.rangeValues;
  }
  set values(values: readonly number[]) {
    this.rangeValues = values;
  }
  get minMs(): number | null {
    return this.low;
  }
  set minMs(value: number | null) {
    this.low = value;
  }
  get maxMs(): number | null {
    return this.high;
  }
  set maxMs(value: number | null) {
    this.high = value;
  }
}

if (!customElements.get("duration-range")) {
  customElements.define("duration-range", DurationRange);
}
