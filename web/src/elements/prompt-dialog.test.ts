import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { stubDialog } from "../test/dialog-stub.ts";
import { must } from "../test/viewer-fixtures.ts";
import { PromptDialog } from "./prompt-dialog.ts";

beforeAll(stubDialog);
afterEach(() => {
  document.body.replaceChildren();
});

function renderPrompt(initialValue?: string) {
  const el = new PromptDialog();
  el.title = "New folder name";
  el.glyph = "📁＋";
  el.subject = "Media";
  el.placeholder = "🔍";
  el.confirmLabel = "Create";
  if (initialValue !== undefined) el.initialValue = initialValue;
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  el.addEventListener("confirm", (e) => {
    onConfirm((e as CustomEvent<string>).detail);
  });
  el.addEventListener("cancel", onCancel);
  document.body.append(el);
  return { el, onConfirm, onCancel };
}

describe("prompt-dialog", () => {
  it("keeps confirm disabled until a non-blank value is entered", async () => {
    const { el, onConfirm } = renderPrompt();
    expect(el.title).toBe("New folder name");
    expect(el.glyph).toBe("📁＋");
    expect(el.subject).toBe("Media");
    expect(el.placeholder).toBe("🔍");
    expect(el.confirmLabel).toBe("Create");
    expect(el.initialValue).toBe("");
    expect(el).not.toHaveAttribute("title");
    expect(screen.getByRole("dialog")).toHaveTextContent("📁＋Media✕✓");
    const input = screen.getByLabelText("New folder name");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("placeholder", "🔍");
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toHaveTextContent("✓");
    expect(create).toBeDisabled();
    await userEvent.type(input, "   ");
    expect(create).toBeDisabled();
    await userEvent.type(input, "Photos");
    await userEvent.click(create);
    expect(onConfirm).toHaveBeenCalledWith("Photos");
  });

  it("confirms with the trimmed value on Enter", async () => {
    const { onConfirm } = renderPrompt();
    await userEvent.type(screen.getByLabelText("New folder name"), "  Trip  {Enter}");
    expect(onConfirm).toHaveBeenCalledWith("Trip");
  });

  it("does nothing on Enter while blank", async () => {
    const { onConfirm } = renderPrompt();
    await userEvent.type(screen.getByLabelText("New folder name"), "{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("pre-fills and pre-selects the initial value only once", async () => {
    const { el, onConfirm } = renderPrompt("old.txt");
    const input = screen.getByLabelText<HTMLInputElement>("New folder name");
    expect(input.value).toBe("old.txt");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(7);
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
    el.initialValue = "other";
    expect(el.initialValue).toBe("other");
    expect(input.value).toBe("old.txt");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onConfirm).toHaveBeenCalledWith("old.txt");
  });

  it("cancels via the button, the backdrop and Escape, not the body", async () => {
    const { el, onCancel } = renderPrompt();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(must(".prompt-heading"));
    await userEvent.click(screen.getByRole("dialog"));
    screen.getByRole("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(3);
    el.remove();
    document.body.append(el);
    expect(el.querySelectorAll("dialog")).toHaveLength(1);
  });
});
