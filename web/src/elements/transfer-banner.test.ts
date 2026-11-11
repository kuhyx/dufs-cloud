import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { TransferBanner } from "./transfer-banner.ts";

afterEach(() => {
  document.body.replaceChildren();
});

function mount(): TransferBanner {
  const banner = new TransferBanner();
  banner.progress = { kind: "upload", index: 2, total: 5, name: "clip.mp4", done: 50, size: 200 };
  document.body.append(banner);
  return banner;
}

describe("transfer-banner", () => {
  it("renders both lines, a determinate bar, and fires Cancel", async () => {
    const banner = mount();
    expect(screen.getByRole("status")).toHaveClass("transfer");
    expect(screen.getByLabelText("Uploading 2/5 · clip.mp4")).toHaveTextContent("⭱ 2/5 · clip.mp4");
    expect(screen.getByText("25 % · 50 B / 200 B")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0.25");
    const onCancel = vi.fn();
    banner.addEventListener("cancel", onCancel);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("switches to an indeterminate bar when the size is unknown", () => {
    const banner = mount();
    const next = { kind: "download", index: 1, total: 1, name: "x", done: 7, size: 0 } as const;
    banner.progress = next;
    expect(banner.progress).toBe(next);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
    expect(screen.getByText("7 B")).toBeInTheDocument();
    expect(screen.getByLabelText("Downloading 1/1 · x")).toHaveTextContent("⭳ 1/1 · x");
  });

  it("keeps the last render when progress clears, and renders once", () => {
    const banner = mount();
    banner.progress = null;
    document.body.append(banner);
    expect(banner.progress).toBeNull();
    expect(banner.querySelectorAll(".transfer")).toHaveLength(1);
    expect(screen.getByLabelText("Uploading 2/5 · clip.mp4")).toBeInTheDocument();
  });
});
