import css from "./index.css?raw";
import { describe, it, expect } from "vitest";

describe("index.css motion", () => {
  it("has a prefers-reduced-motion block that suppresses transitions", () => {
    const start = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(start).toBeGreaterThanOrEqual(0);
    const block = css.slice(start);
    expect(block).toMatch(/transition:\s*none/);
    expect(block).toMatch(/animation:\s*none/);
  });

  it("takes every transition duration from the shared motion tokens", () => {
    const transitions = (css.match(/transition:[^;]*;/g) ?? []).filter(
      (t) => !t.includes("none"),
    );
    expect(transitions.length).toBeGreaterThan(0);
    for (const t of transitions) expect(t).toMatch(/var\(--duration-/);
  });
});
