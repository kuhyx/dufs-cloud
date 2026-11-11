// <size-range> props: values (ascending bytes), minSize, maxSize (bytes|null). Event: change {minSize, maxSize}.
import { humanSize } from "../lib/paths.ts";
import { NumericRange, type NumericRangeSpec } from "./numeric-range.ts";

const BYTES_PER_MB = 1024 * 1024;

const SPEC: NumericRangeSpec = {
  className: "sizerange",
  // ≥ / ≤ plus the unit symbol; the spoken labels below keep the words.
  placeholders: ["≥ MB", "≤ MB"],
  labels: ["Minimum size in MB", "Maximum size in MB"],
  keys: ["minSize", "maxSize"],
  toText: (bytes) =>
    bytes === null ? "" : String(Math.round((bytes / BYTES_PER_MB) * 10) / 10),
  fromText: (text) => (text === "" ? null : Number(text) * BYTES_PER_MB),
  note: (values, { lo, hi }, hasRange) => {
    if (hasRange) return `${humanSize(lo)} – ${humanSize(hi)}`;
    return values.length > 0 ? `= ${humanSize(lo)}` : null;
  },
};

export class SizeRange extends NumericRange {
  protected readonly spec = SPEC;
  get values(): readonly number[] {
    return this.rangeValues;
  }
  set values(values: readonly number[]) {
    this.rangeValues = values;
  }
  get minSize(): number | null {
    return this.low;
  }
  set minSize(value: number | null) {
    this.low = value;
  }
  get maxSize(): number | null {
    return this.high;
  }
  set maxSize(value: number | null) {
    this.high = value;
  }
}

if (!customElements.get("size-range")) {
  customElements.define("size-range", SizeRange);
}
