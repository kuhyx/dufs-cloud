import type { DufsClient } from "../api/dufs-client.ts";
import { makeClient } from "./client-fixtures.ts";
import { flush } from "./store-helpers.ts";
import "../elements/gallery.ts";

export type Kid = HTMLElement & Record<string, unknown>;

export interface Mounted {
  readonly el: HTMLElement & { client: DufsClient | null };
  readonly client: DufsClient;
  readonly main: HTMLElement;
  kid: (tag: string) => Kid | null;
}

export async function mountGallery(overrides: Partial<DufsClient> = {}, settle = true): Promise<Mounted> {
  window.location.hash = "";
  const client = makeClient(overrides);
  const el = document.createElement("cloud-gallery") as Mounted["el"];
  el.client = client;
  document.body.replaceChildren(el);
  if (settle) await flush();
  return {
    el,
    client,
    main: el.querySelector("main") ?? document.createElement("main"),
    kid: (tag) => el.querySelector<Kid>(tag),
  };
}

export function fire(target: Element, type: string, detail?: unknown): void {
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
}
