import { clear } from "./dom.ts";

/** Replaces `host`'s children with `build()`'s nodes. A full rebuild would drop
 * keyboard focus, so the focused button's position among the host's buttons is
 * remembered and restored (React's reconciler used to keep it for free). */
export function rebuildKeepFocus(host: HTMLElement, build: () => Node[]): void {
  const buttons = (): HTMLButtonElement[] => [
    ...host.querySelectorAll<HTMLButtonElement>("button"),
  ];
  const focused = buttons().indexOf(document.activeElement as HTMLButtonElement);
  clear(host);
  host.append(...build());
  if (focused >= 0) buttons()[focused]?.focus();
}
