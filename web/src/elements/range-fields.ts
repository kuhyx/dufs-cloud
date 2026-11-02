import "@kuhyx/web-ui/range-slider";
import type { RangeSliderElement } from "@kuhyx/web-ui/range-slider";
import { h } from "./dom.ts";

export function numberField(
  placeholder: string,
  label: string,
  onText: (text: string) => void,
): HTMLInputElement {
  const input = h("input", {
    class: "filter-size",
    type: "number",
    min: "0",
    placeholder,
    "aria-label": label,
  });
  input.addEventListener("input", () => {
    onText(input.value);
  });
  // A native `change` would bubble out looking like our CustomEvent('change').
  input.addEventListener("change", (event) => {
    event.stopPropagation();
  });
  return input;
}

export function setText(input: HTMLInputElement, text: string): void {
  if (input.value !== text) input.value = text;
}

/** The slider's own bubbling `change` is swallowed and re-reported via `onRange`. */
export function sliderField(
  onRange: (lo: number, hi: number) => void,
): RangeSliderElement {
  const slider = document.createElement("range-slider") as RangeSliderElement;
  slider.addEventListener("change", (event) => {
    event.stopPropagation();
    const { lo, hi } = (event as CustomEvent<{ lo: number; hi: number }>).detail;
    onRange(lo, hi);
  });
  return slider;
}

export function setSlider(
  slider: RangeSliderElement,
  values: readonly number[],
  lo: number,
  hi: number,
): void {
  if (slider.values !== values) slider.values = values;
  slider.setAttribute("lo", String(lo));
  slider.setAttribute("hi", String(hi));
}

/** Replace children only when they differ, so a focused input survives typing. */
export function syncChildren(parent: Element, nodes: readonly Node[]): void {
  const same =
    parent.childNodes.length === nodes.length &&
    nodes.every((node, i) => parent.childNodes[i] === node);
  if (!same) parent.replaceChildren(...nodes);
}

export function bounds(values: readonly number[]): {
  min: number;
  max: number;
  hasRange: boolean;
} {
  const min = values[0] ?? 0;
  const max = values.at(-1) ?? 0;
  return { min, max, hasRange: values.length > 1 && min < max };
}

export function emitChange(host: HTMLElement, detail: object): void {
  host.dispatchEvent(
    new CustomEvent("change", { bubbles: true, composed: true, detail }),
  );
}
