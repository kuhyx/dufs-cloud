import { describe, it, expect } from "vitest";
import {
  bufferedAhead,
  isBuffered,
  nextSegment,
} from "./dash-buffer.ts";
import {
  THREE,
  asSourceBuffer,
  buffer,
} from "../test/dash-buffer-fixtures.ts";

describe("buffered-range helpers", () => {
  it("reports whether a time is buffered", () => {
    const b = buffer();
    b.ranges = [{ start: 0, end: 10 }];
    expect(isBuffered(asSourceBuffer(b), 5)).toBe(true);
    expect(isBuffered(asSourceBuffer(b), 20)).toBe(false);
  });

  it("reports nothing buffered for an empty buffer", () => {
    expect(isBuffered(asSourceBuffer(buffer()), 0)).toBe(false);
  });

  it("measures how far ahead the buffer runs", () => {
    const b = buffer();
    b.ranges = [{ start: 0, end: 18 }];
    expect(bufferedAhead(asSourceBuffer(b), 6)).toBe(12);
  });

  it("measures zero ahead outside every range", () => {
    const b = buffer();
    b.ranges = [{ start: 0, end: 5 }];
    expect(bufferedAhead(asSourceBuffer(b), 30)).toBe(0);
  });

  it("skips ranges that do not contain the playhead", () => {
    const b = buffer();
    b.ranges = [
      { start: 0, end: 3 },
      { start: 10, end: 20 },
    ];
    expect(bufferedAhead(asSourceBuffer(b), 12)).toBe(8);
  });
});

describe("nextSegment", () => {
  it("asks for the segment after what is already buffered", () => {
    const b = buffer();
    b.ranges = [{ start: 0, end: 12 }];
    // Buffered to 12s from t=0, so segment index 2 (12–18s) comes next.
    expect(nextSegment(THREE, asSourceBuffer(b), 0)).toBe(3);
  });

  it("asks for the segment at the playhead when nothing is buffered", () => {
    expect(nextSegment(THREE, asSourceBuffer(buffer()), 7)).toBe(1);
  });
});
