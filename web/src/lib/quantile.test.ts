import { describe, it, expect } from "vitest";
import { clamp01, nth, quantileValue, valueQuantile } from "./quantile.ts";

describe("nth", () => {
  it("returns the element at an in-bounds index", () => {
    expect(nth([10, 20, 30], 1)).toBe(20);
  });
  it("throws for an out-of-bounds index", () => {
    expect(() => nth([], 0)).toThrow(RangeError);
  });
});

describe("clamp01", () => {
  it("clamps to the unit interval", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.25)).toBe(0.25);
  });
});

describe("quantileValue", () => {
  it("returns 0 for an empty distribution", () => {
    expect(quantileValue([], 0.5)).toBe(0);
  });
  it("returns the only value for a single-element distribution", () => {
    expect(quantileValue([7], 0.9)).toBe(7);
  });
  it("interpolates between straddling samples", () => {
    // pos = 0.5 * 3 = 1.5 → halfway between 10 and 20.
    expect(quantileValue([0, 10, 20, 30], 0.5)).toBe(15);
  });
  it("clamps the fraction to the ends", () => {
    expect(quantileValue([0, 10, 20, 30], 2)).toBe(30);
    expect(quantileValue([0, 10, 20, 30], -1)).toBe(0);
  });
  it("is distribution-aware: the median of a lopsided set sits mid-track", () => {
    // 99 short clips and one very long one: mid-track ≈ the median (short),
    // not the arithmetic midpoint of [1, 1000].
    const skewed = [...Array<number>(99).fill(2), 1000].sort((a, b) => a - b);
    expect(quantileValue(skewed, 0.5)).toBeLessThan(5);
  });
});

describe("valueQuantile", () => {
  it("returns 0 for a degenerate (≤1 element) distribution", () => {
    expect(valueQuantile([5], 5)).toBe(0);
  });
  it("maps the ends to 0 and 1", () => {
    expect(valueQuantile([0, 10, 20], -5)).toBe(0);
    expect(valueQuantile([0, 10, 20], 50)).toBe(1);
  });
  it("inverts quantileValue for an interior value", () => {
    expect(valueQuantile([0, 10, 20], 10)).toBe(0.5);
  });
});
