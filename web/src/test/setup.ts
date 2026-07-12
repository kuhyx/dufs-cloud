import "@testing-library/jest-dom";
import { vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
});

// jsdom lacks object-URL support; several flows touch it.
URL.createObjectURL = vi.fn(() => "blob:mock");
URL.revokeObjectURL = vi.fn();

// jsdom does not implement pointer capture; the size slider uses it.
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
