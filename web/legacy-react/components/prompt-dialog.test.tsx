import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromptDialog } from "./prompt-dialog.tsx";

function renderPrompt() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <PromptDialog
      title="New folder name"
      placeholder="Folder name"
      confirmLabel="Create"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe("PromptDialog", () => {
  it("keeps confirm disabled until a non-blank value is entered", async () => {
    const { onConfirm } = renderPrompt();
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    // Whitespace alone stays disabled (trimmed).
    await userEvent.type(screen.getByLabelText("New folder name"), "   ");
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByLabelText("New folder name"), "Photos");
    await userEvent.click(create);
    expect(onConfirm).toHaveBeenCalledWith("Photos");
  });

  it("confirms with the trimmed value on Enter", async () => {
    const { onConfirm } = renderPrompt();
    const input = screen.getByLabelText("New folder name");
    await userEvent.type(input, "  Trip  {Enter}");
    expect(onConfirm).toHaveBeenCalledWith("Trip");
  });

  it("does nothing on Enter while blank", async () => {
    const { onConfirm } = renderPrompt();
    await userEvent.type(screen.getByLabelText("New folder name"), "{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cancels via the button and the backdrop", async () => {
    const { onCancel } = renderPrompt();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Clicking the dialog body does not cancel (stopPropagation).
    await userEvent.click(screen.getByText("New folder name"));
    // Backdrop click cancels.
    await userEvent.click(screen.getByRole("dialog"));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
