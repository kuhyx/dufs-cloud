import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransferBanner } from "./transfer-banner.tsx";

describe("TransferBanner", () => {
  it("renders both lines, a determinate bar, and fires Cancel", async () => {
    const onCancel = vi.fn();
    render(
      <TransferBanner
        progress={{
          kind: "upload",
          index: 2,
          total: 5,
          name: "clip.mp4",
          done: 50,
          size: 200,
        }}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("Uploading 2/5 · clip.mp4")).toBeInTheDocument();
    expect(screen.getByText("25 % · 50 B / 200 B")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0.25");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders an indeterminate bar when the size is unknown", () => {
    render(
      <TransferBanner
        progress={{
          kind: "download",
          index: 1,
          total: 1,
          name: "x",
          done: 7,
          size: 0,
        }}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
    expect(screen.getByText("7 B")).toBeInTheDocument();
  });
});
