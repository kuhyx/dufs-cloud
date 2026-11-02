// <subtitle-menu> props: tracks, active, offsetMs. Events: select (detail: track|null), offset-change (detail: ms).
import { subtitleLabel, type SubtitleTrack } from "../lib/subtitles.ts";
import { h } from "./dom.ts";
import { emit } from "./element-kit.ts";
import { rebuildKeepFocus } from "./rebuild-keep-focus.ts";

/** How far one nudge shifts subtitle timing, in milliseconds. */
export const OFFSET_STEP_MS = 100;

export class SubtitleMenu extends HTMLElement {
  #tracks: readonly SubtitleTrack[] = [];
  #active: SubtitleTrack | null = null;
  #offsetMs = 0;
  #open = false;

  get tracks(): readonly SubtitleTrack[] {
    return this.#tracks;
  }

  set tracks(value: readonly SubtitleTrack[]) {
    this.#tracks = value;
    this.#render();
  }

  get active(): SubtitleTrack | null {
    return this.#active;
  }

  set active(value: SubtitleTrack | null) {
    this.#active = value;
    this.#render();
  }

  get offsetMs(): number {
    return this.#offsetMs;
  }

  set offsetMs(value: number) {
    this.#offsetMs = value;
    this.#render();
  }

  connectedCallback(): void {
    this.style.display = "contents";
    this.#render();
  }

  #render(): void {
    rebuildKeepFocus(this, () => {
      if (this.#tracks.length === 0) return [];
      const active = this.#active;
      const toggle = h(
        "button",
        {
          type: "button",
          class: "subtitle-toggle",
          "aria-expanded": String(this.#open),
          "aria-label": "Subtitles",
        },
        active === null ? "Subtitles: Off" : subtitleLabel(active),
      );
      toggle.addEventListener("click", () => {
        this.#open = !this.#open;
        this.#render();
      });
      const root = h("div", { class: "subtitle-menu" }, toggle);
      // The viewer closes on background clicks; this panel is not background.
      root.addEventListener("click", (e) => {
        e.stopPropagation();
      });
      if (this.#open) root.append(this.#panel());
      return [root];
    });
  }

  #choice(label: string, track: SubtitleTrack | null): HTMLButtonElement {
    const checked = track?.id === this.#active?.id;
    const item = h(
      "button",
      {
        type: "button",
        role: "menuitemradio",
        "aria-checked": String(checked),
        class: checked ? "is-active" : "",
      },
      label,
    );
    item.addEventListener("click", () => {
      emit(this, "select", track);
      this.#open = false;
      this.#render();
    });
    return item;
  }

  #nudge(label: string, glyph: string, delta: number): HTMLButtonElement {
    const button = h("button", { type: "button", "aria-label": label }, glyph);
    button.addEventListener("click", () => {
      emit(this, "offset-change", this.#offsetMs + delta);
    });
    return button;
  }

  #panel(): HTMLElement {
    const offset = h(
      "div",
      { class: "subtitle-offset" },
      h("span", {}, "Delay"),
      this.#nudge("Subtitles earlier", "−", -OFFSET_STEP_MS),
      h(
        "span",
        { class: "subtitle-offset-value" },
        `${(this.#offsetMs / 1000).toFixed(1)}s`,
      ),
      this.#nudge("Subtitles later", "+", OFFSET_STEP_MS),
    );
    return h(
      "div",
      { class: "subtitle-panel", role: "menu" },
      this.#choice("Off", null),
      ...this.#tracks.map((track) => this.#choice(subtitleLabel(track), track)),
      offset,
    );
  }
}

if (!customElements.get("subtitle-menu")) {
  customElements.define("subtitle-menu", SubtitleMenu);
}
