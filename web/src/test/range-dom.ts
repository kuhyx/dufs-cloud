import { vi } from "vitest";

export const MB = 1024 * 1024;
/** A uniform 0..100 MB distribution so quantile ~ linear (pointer x ~ MB). */
export const UNIFORM = Array.from({ length: 101 }, (_, i) => i * MB);

export function mount<T extends HTMLElement>(el: T): T {
  document.body.append(el);
  return el;
}

export function input(host: HTMLElement, label: string): HTMLInputElement {
  const found = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  if (found === null) throw new Error(`no input ${label}`);
  return found;
}

/** Give the slider track 0..100px geometry (pointer x == percent). */
export function primeSlider(host: HTMLElement): Element {
  const track = host.querySelector(".slider-track");
  if (track === null) throw new Error("no slider");
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
    left: 0,
    width: 100,
    top: 0,
    right: 100,
    bottom: 10,
    height: 10,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return track;
}

/** Collect the `change` CustomEvent details a host emits. */
export function details<T>(host: HTMLElement): T[] {
  const seen: T[] = [];
  host.addEventListener("change", (event) => {
    seen.push((event as CustomEvent<T>).detail);
  });
  return seen;
}
