import { describe, it, expect } from "vitest";
import { CloudApp } from "./cloud-app.ts";

describe("cloud-app", () => {
  it("registers the root element", () => {
    expect(customElements.get("cloud-app")).toBe(CloudApp);
  });
});
