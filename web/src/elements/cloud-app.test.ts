import { describe, it, expect, vi, afterEach } from "vitest";
import { CloudApp } from "./cloud-app.ts";
import type { CloudGallery } from "./gallery.ts";

describe("cloud-app", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers the root element", () => {
    expect(customElements.get("cloud-app")).toBe(CloudApp);
  });

  it("mounts one gallery with a dufs client", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const app = document.createElement("cloud-app");
    document.body.replaceChildren(app);
    const gallery = app.querySelector<CloudGallery>("cloud-gallery");
    expect(gallery?.client).not.toBeNull();
    app.remove();
    document.body.append(app);
    expect(app.querySelectorAll("cloud-gallery")).toHaveLength(1);
    app.remove();
  });
});
