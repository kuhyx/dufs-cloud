import { describe, it, expect } from "vitest";
import {
  isAbort,
  transferDetail,
  transferFraction,
  transferTitle,
  type TransferProgress,
} from "./transfer.ts";

const upload: TransferProgress = {
  kind: "upload",
  index: 3,
  total: 7,
  name: "photo.jpg",
  done: 12 * 1024 * 1024,
  size: 29 * 1024 * 1024,
};

describe("transfer", () => {
  it("titles name the direction, position and file", () => {
    expect(transferTitle(upload)).toBe("Uploading 3/7 · photo.jpg");
    expect(transferTitle({ ...upload, kind: "download" })).toBe(
      "Downloading 3/7 · photo.jpg",
    );
  });

  it("details show percent and bytes, clamped to 100 %", () => {
    expect(transferDetail(upload)).toBe("41 % · 12 MB / 29 MB");
    expect(transferFraction(upload)).toBeCloseTo(12 / 29);
    const over = { ...upload, done: 40 * 1024 * 1024 };
    expect(transferFraction(over)).toBe(1);
    expect(transferDetail(over)).toBe("100 % · 40 MB / 29 MB");
  });

  it("an unknown size is indeterminate and shows only the byte count", () => {
    const empty = { ...upload, done: 512, size: 0 };
    expect(transferFraction(empty)).toBeNull();
    expect(transferDetail(empty)).toBe("512 B");
  });

  it("isAbort recognises only the AbortError DOMException", () => {
    expect(isAbort(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbort(new DOMException("x", "NotFoundError"))).toBe(false);
    expect(isAbort(new Error("AbortError"))).toBe(false);
    expect(isAbort("AbortError")).toBe(false);
  });
});
