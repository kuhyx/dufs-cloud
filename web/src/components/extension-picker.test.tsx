import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExtensionPicker } from "./extension-picker.tsx";

function renderPicker(opts: {
  available?: readonly string[];
  includes?: readonly string[];
  excludes?: readonly string[];
} = {}) {
  const onChange = vi.fn();
  render(
    <ExtensionPicker
      available={opts.available ?? ["jpg", "png", "webp"]}
      includes={opts.includes ?? []}
      excludes={opts.excludes ?? []}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe("ExtensionPicker", () => {
  it("summarises the selection and toggles the menu", async () => {
    renderPicker();
    const btn = screen.getByRole("button", { name: /Any ext/ });
    expect(screen.queryByLabelText("webp: off")).toBeNull();
    await userEvent.click(btn);
    expect(screen.getByLabelText("webp: off")).toBeInTheDocument();
  });

  it("cycles an extension off → include (first click)", async () => {
    const { onChange } = renderPicker();
    await userEvent.click(screen.getByRole("button", { name: /Any ext/ }));
    await userEvent.click(screen.getByLabelText("webp: off"));
    expect(onChange).toHaveBeenCalledWith(["webp"], []);
  });

  it("cycles include → exclude (second click)", async () => {
    const { onChange } = renderPicker({ includes: ["webp"] });
    // Summary shows the included extension.
    await userEvent.click(screen.getByRole("button", { name: "webp ▾" }));
    await userEvent.click(screen.getByLabelText("webp: include"));
    expect(onChange).toHaveBeenCalledWith([], ["webp"]);
  });

  it("cycles exclude → off (third click)", async () => {
    const { onChange } = renderPicker({ excludes: ["webp"] });
    await userEvent.click(screen.getByRole("button", { name: "not webp ▾" }));
    await userEvent.click(screen.getByLabelText("webp: exclude"));
    expect(onChange).toHaveBeenCalledWith([], []);
  });

  it("keeps includes and excludes side by side in the summary", () => {
    renderPicker({ includes: ["png"], excludes: ["webp"] });
    expect(
      screen.getByRole("button", { name: "png · not webp ▾" }),
    ).toBeInTheDocument();
  });

  it("closes via the backdrop", async () => {
    renderPicker();
    await userEvent.click(screen.getByRole("button", { name: /Any ext/ }));
    expect(screen.getByLabelText("webp: off")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Close extension menu" }),
    );
    expect(screen.queryByLabelText("webp: off")).toBeNull();
  });

  it("shows a hint when no extensions are in view", async () => {
    renderPicker({ available: [] });
    await userEvent.click(screen.getByRole("button", { name: /Any ext/ }));
    expect(screen.getByText("No extensions in view.")).toBeInTheDocument();
  });
});
