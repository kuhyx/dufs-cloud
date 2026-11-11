// <resolution-range> props: minPixels, maxPixels (pixels|null). Event: change {minPixels, maxPixels}.
import { emitChange, numberField, setText } from "./range-fields.ts";

const PIXELS_PER_MP = 1_000_000;

const toText = (pixels: number | null): string =>
  pixels === null ? "" : String(Math.round((pixels / PIXELS_PER_MP) * 10) / 10);
const fromText = (text: string): number | null =>
  text === "" ? null : Number(text) * PIXELS_PER_MP;

export class ResolutionRange extends HTMLElement {
  #min: number | null = null;
  #max: number | null = null;
  readonly #minInput = numberField(
    "≥ MP",
    "Minimum resolution in megapixels",
    (text) => {
      emitChange(this, { minPixels: fromText(text), maxPixels: this.#max });
    },
  );
  readonly #maxInput = numberField(
    "≤ MP",
    "Maximum resolution in megapixels",
    (text) => {
      emitChange(this, { minPixels: this.#min, maxPixels: fromText(text) });
    },
  );

  get minPixels(): number | null {
    return this.#min;
  }
  set minPixels(value: number | null) {
    this.#min = value;
    this.#render();
  }
  get maxPixels(): number | null {
    return this.#max;
  }
  set maxPixels(value: number | null) {
    this.#max = value;
    this.#render();
  }

  connectedCallback(): void {
    this.className = "resrange";
    this.#render();
  }

  #render(): void {
    setText(this.#minInput, toText(this.#min));
    setText(this.#maxInput, toText(this.#max));
    if (this.#minInput.parentNode !== this) {
      this.replaceChildren(this.#minInput, this.#maxInput);
    }
  }
}

if (!customElements.get("resolution-range")) {
  customElements.define("resolution-range", ResolutionRange);
}
