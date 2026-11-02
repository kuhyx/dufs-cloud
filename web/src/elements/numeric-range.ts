import type { RangeSliderElement } from "@kuhyx/web-ui/range-slider";
import { h } from "./dom.ts";
import {
  bounds,
  emitChange,
  numberField,
  setSlider,
  setText,
  sliderField,
  syncChildren,
} from "./range-fields.ts";

export interface NumericRangeSpec {
  readonly className: string;
  readonly placeholders: readonly [string, string];
  readonly labels: readonly [string, string];
  readonly keys: readonly [string, string];
  readonly toText: (value: number | null) => string;
  readonly fromText: (text: string) => number | null;
  /** The note under the controls, or null for none. */
  readonly note: (
    values: readonly number[],
    shown: { readonly lo: number; readonly hi: number },
    hasRange: boolean,
  ) => string | null;
}

interface Parts {
  readonly minInput: HTMLInputElement;
  readonly maxInput: HTMLInputElement;
  readonly slider: RangeSliderElement;
  readonly note: HTMLSpanElement;
}

/**
 * Base of the size and duration filters: min/max inputs, a quantile slider once
 * `values` has a real range, and a note. Emits `change` with `{ [keys[0]], [keys[1]] }`.
 */
export abstract class NumericRange extends HTMLElement {
  protected abstract readonly spec: NumericRangeSpec;
  #values: readonly number[] = [];
  #lo: number | null = null;
  #hi: number | null = null;
  #parts: Parts | undefined;

  protected get rangeValues(): readonly number[] {
    return this.#values;
  }
  protected set rangeValues(values: readonly number[]) {
    this.#values = values;
    this.#render();
  }
  protected get low(): number | null {
    return this.#lo;
  }
  protected set low(value: number | null) {
    this.#lo = value;
    this.#render();
  }
  protected get high(): number | null {
    return this.#hi;
  }
  protected set high(value: number | null) {
    this.#hi = value;
    this.#render();
  }

  connectedCallback(): void {
    this.#render();
  }

  #emit(lo: number | null, hi: number | null): void {
    const [loKey, hiKey] = this.spec.keys;
    emitChange(this, { [loKey]: lo, [hiKey]: hi });
  }

  #build(): Parts {
    const { placeholders, labels, fromText } = this.spec;
    const parts: Parts = {
      minInput: numberField(placeholders[0], labels[0], (text) => {
        this.#emit(fromText(text), this.#hi);
      }),
      maxInput: numberField(placeholders[1], labels[1], (text) => {
        this.#emit(this.#lo, fromText(text));
      }),
      slider: sliderField((lo, hi) => {
        const { min, max } = bounds(this.#values);
        this.#emit(lo <= min ? null : lo, hi >= max ? null : hi);
      }),
      note: h("span", { class: "muted slider-note" }),
    };
    this.className = this.spec.className;
    return parts;
  }

  #render(): void {
    this.#parts ??= this.#build();
    const { minInput, maxInput, slider, note } = this.#parts;
    const { min, max, hasRange } = bounds(this.#values);
    const lo = this.#lo ?? min;
    const hi = this.#hi ?? max;
    setText(minInput, this.spec.toText(this.#lo));
    setText(maxInput, this.spec.toText(this.#hi));
    if (hasRange) setSlider(slider, this.#values, lo, hi);
    const text = this.spec.note(this.#values, { lo, hi }, hasRange);
    note.textContent = text;
    syncChildren(this, [
      minInput,
      ...(hasRange ? [slider] : []),
      maxInput,
      ...(text === null ? [] : [note]),
    ]);
  }
}
