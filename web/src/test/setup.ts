import * as matchers from "@testing-library/jest-dom/matchers";
import { vi, beforeEach, expect } from "vitest";

// Registered by hand instead of `import "@testing-library/jest-dom/vitest"`:
// jest-dom 7 still augments vitest's `Assertion<T>`, which vitest 5 renamed
// to `Assertion<R, T>`, so its bundled types no longer attach. The matching
// declaration lives in `jest-dom.d.ts` next to this file.
expect.extend(matchers);

beforeEach(() => {
  vi.clearAllMocks();
});

// jsdom lacks object-URL support; several flows touch it.
URL.createObjectURL = vi.fn(() => "blob:mock");
URL.revokeObjectURL = vi.fn();

// jsdom does not implement pointer capture; the size slider uses it.
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
