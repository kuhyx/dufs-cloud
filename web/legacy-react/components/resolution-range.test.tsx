import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResolutionRange } from "./resolution-range.tsx";

describe("ResolutionRange", () => {
  it("shows megapixels and reports min/max edits and clears", () => {
    const onChange = vi.fn();
    render(
      <ResolutionRange
        minPixels={2_000_000}
        maxPixels={8_000_000}
        onChange={onChange}
      />,
    );
    const min = screen.getByLabelText("Minimum resolution in megapixels");
    const max = screen.getByLabelText("Maximum resolution in megapixels");
    expect(min).toHaveValue(2);
    expect(max).toHaveValue(8);

    fireEvent.change(min, { target: { value: "4" } });
    expect(onChange).toHaveBeenLastCalledWith(4_000_000, 8_000_000);

    fireEvent.change(max, { target: { value: "12" } });
    expect(onChange).toHaveBeenLastCalledWith(2_000_000, 12_000_000);

    fireEvent.change(min, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null, 8_000_000);
  });

  it("renders empty inputs when unset", () => {
    render(
      <ResolutionRange minPixels={null} maxPixels={null} onChange={vi.fn()} />,
    );
    expect(
      screen.getByLabelText("Minimum resolution in megapixels"),
    ).toHaveValue(null);
  });
});
