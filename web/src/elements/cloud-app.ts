// <cloud-app> props: none. The page root: builds the dufs client and mounts <cloud-gallery>.
import "./all.ts";
import { createDufsClient } from "../api/dufs-client.ts";
import { define } from "./element-kit.ts";
import type { CloudGallery } from "./gallery.ts";

export class CloudApp extends HTMLElement {
  connectedCallback(): void {
    if (this.firstElementChild !== null) return;
    const gallery = document.createElement("cloud-gallery") as CloudGallery;
    gallery.client = createDufsClient();
    this.append(gallery);
  }
}

define("cloud-app", CloudApp);
