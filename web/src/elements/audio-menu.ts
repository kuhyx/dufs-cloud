// <audio-menu> props: tracks, active. Events: select (detail: stream id).
import type { DashStream } from "../lib/dash-manifest.ts";
import { languageName } from "../lib/subtitles.ts";
import { h } from "./dom.ts";
import { emit } from "./emit.ts";
import { rebuildKeepFocus } from "./rebuild-keep-focus.ts";

export function audioLabel(stream: DashStream, index: number): string {
  const named = languageName(stream.language);
  return named === "" ? `Track ${String(index + 1)}` : named;
}

export class AudioMenu extends HTMLElement {
  #tracks: readonly DashStream[] = [];
  #active: string | null = null;
  #open = false;

  get tracks(): readonly DashStream[] {
    return this.#tracks;
  }

  set tracks(value: readonly DashStream[]) {
    this.#tracks = value;
    this.#render();
  }

  get active(): string | null {
    return this.#active;
  }

  set active(value: string | null) {
    this.#active = value;
    this.#render();
  }

  connectedCallback(): void {
    this.style.display = "contents";
    this.#render();
  }

  #render(): void {
    rebuildKeepFocus(this, () => {
      if (this.#tracks.length < 2) return [];
      const current = this.#tracks.findIndex((t) => t.id === this.#active);
      const playing = this.#tracks[current];
      const label =
        playing === undefined ? "Audio" : audioLabel(playing, current);
      const toggle = h(
        "button",
        {
          type: "button",
          class: "audio-toggle",
          "aria-expanded": String(this.#open),
          "aria-label": "Audio track",
        },
        label,
      );
      toggle.addEventListener("click", () => {
        this.#open = !this.#open;
        this.#render();
      });
      const root = h("div", { class: "audio-menu" }, toggle);
      // The viewer closes on background clicks; this panel is not background.
      root.addEventListener("click", (e) => {
        e.stopPropagation();
      });
      if (this.#open) root.append(this.#panel());
      return [root];
    });
  }

  #panel(): HTMLElement {
    const items = this.#tracks.map((track, i) => {
      const item = h(
        "button",
        {
          type: "button",
          role: "menuitemradio",
          "aria-checked": String(track.id === this.#active),
          class: track.id === this.#active ? "is-active" : "",
        },
        audioLabel(track, i),
      );
      item.addEventListener("click", () => {
        emit(this, "select", track.id);
        this.#open = false;
        this.#render();
      });
      return item;
    });
    return h("div", { class: "audio-panel", role: "menu" }, ...items);
  }
}

if (!customElements.get("audio-menu")) {
  customElements.define("audio-menu", AudioMenu);
}
