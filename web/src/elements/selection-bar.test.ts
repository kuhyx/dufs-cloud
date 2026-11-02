import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { SelectionBar } from "./selection-bar.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("selection-bar", () => {
  it("shows the count and fires one event per button", async () => {
    const bar = new SelectionBar();
    bar.count = 3;
    document.body.append(bar);
    expect(customElements.get("selection-bar")).toBe(SelectionBar);
    expect(screen.getByText("3 selected")).toHaveClass("sel-count");
    expect(bar.querySelector(".selbar")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("danger");
    const seen = vi.fn();
    for (const type of ["move", "download", "delete", "clear"]) {
      document.body.addEventListener(type, () => {
        seen(type);
      });
    }
    for (const name of ["Move", "Download", "Delete", "Clear"]) {
      await userEvent.click(screen.getByRole("button", { name }));
    }
    expect(seen.mock.calls).toEqual([["move"], ["download"], ["delete"], ["clear"]]);
    bar.count = 5;
    expect(bar.count).toBe(5);
    expect(screen.getByText("5 selected")).toBeInTheDocument();
  });

  it("renders once across reconnects", () => {
    const bar = new SelectionBar();
    document.body.append(bar);
    document.body.append(bar);
    expect(bar.querySelectorAll(".selbar")).toHaveLength(1);
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });
});
