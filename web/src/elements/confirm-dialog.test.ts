import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { stubDialog } from "../test/dialog-stub.ts";
import { must } from "../test/viewer-fixtures.ts";
import { ConfirmDialog } from "./confirm-dialog.ts";

beforeAll(stubDialog);
afterEach(() => {
  document.body.replaceChildren();
});

function mount(): { el: ConfirmDialog; onConfirm: () => void; onCancel: () => void } {
  const el = new ConfirmDialog();
  el.message = "Delete it?";
  el.glyph = "🗑";
  el.subject = "pic.jpg";
  el.confirmLabel = "Delete";
  el.confirmGlyph = "🗑";
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  el.addEventListener("confirm", onConfirm);
  el.addEventListener("cancel", onCancel);
  document.body.append(el);
  return { el, onConfirm, onCancel };
}

describe("confirm-dialog", () => {
  it("renders a modal with the message and a danger confirm", async () => {
    const { el, onConfirm } = mount();
    const dialog = screen.getByRole("dialog");
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveClass("overlay");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(screen.getByRole("dialog", { name: "Delete it?" })).toBe(dialog);
    expect(el.querySelector(".confirm-body")?.parentElement).toHaveClass("dialog");
    expect(el.message).toBe("Delete it?");
    expect(el.glyph).toBe("🗑");
    expect(el.subject).toBe("pic.jpg");
    expect(el.confirmLabel).toBe("Delete");
    expect(el.confirmGlyph).toBe("🗑");
    const confirm = screen.getByRole("button", { name: "Delete" });
    expect(confirm).toHaveClass("danger");
    expect(confirm).toHaveTextContent("🗑");
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancels via the button, the backdrop and Escape, not the body", async () => {
    const { onCancel } = mount();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(must(".confirm-body"));
    await userEvent.click(screen.getByRole("dialog"));
    const esc = new Event("cancel", { cancelable: true });
    screen.getByRole("dialog").dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it("has no spoken confirm label until one is set", () => {
    expect(new ConfirmDialog().confirmLabel).toBe("");
  });

  it("closes on removal and reopens once on reconnect", () => {
    const { el } = mount();
    const dialog = el.querySelector("dialog");
    el.remove();
    expect(dialog?.open).toBe(false);
    document.body.append(el);
    expect(dialog?.open).toBe(true);
    expect(el.querySelectorAll("dialog")).toHaveLength(1);
  });
});
