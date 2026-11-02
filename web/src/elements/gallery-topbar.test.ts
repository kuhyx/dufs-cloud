import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/dom";
import { GalleryTopbar } from "./gallery-topbar.ts";

function mount(props: Partial<Record<string, unknown>> = {}): {
  bar: GalleryTopbar;
  events: { type: string; detail: unknown }[];
} {
  const bar = document.createElement("gallery-topbar") as GalleryTopbar;
  Object.assign(bar, props);
  const events: { type: string; detail: unknown }[] = [];
  for (const type of ["go", "new-folder", "upload-picked"]) {
    bar.addEventListener(type, (e) => {
      events.push({ type, detail: (e as CustomEvent).detail });
    });
  }
  document.body.append(bar);
  return { bar, events };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("gallery-topbar", () => {
  it("renders breadcrumbs and emits go", () => {
    expect(customElements.get("gallery-topbar")).toBe(GalleryTopbar);
    const { bar, events } = mount({ path: "/Media/2026" });
    expect(bar.path).toBe("/Media/2026");
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect([...nav.querySelectorAll(".crumb")].map((c) => c.textContent)).toEqual([
      "cloud",
      "Media",
      "2026",
    ]);
    expect(nav.querySelectorAll(".crumb-sep")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Media" }));
    expect(events).toEqual([{ type: "go", detail: "/Media" }]);
  });

  it("shows the busy note only while busy", () => {
    const { bar } = mount();
    expect(bar.busy).toBeNull();
    expect(document.querySelector(".busy")).toBeNull();
    bar.busy = "Moving 2 item(s)…";
    expect(document.querySelector(".tools > .busy")).toHaveTextContent("Moving 2 item(s)…");
    bar.busy = null;
    expect(document.querySelector(".busy")).toBeNull();
  });

  it("emits new-folder", () => {
    const { events } = mount();
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    expect(events).toEqual([{ type: "new-folder", detail: null }]);
  });

  it("Upload opens the hidden picker and reports the picked files", () => {
    const { events } = mount();
    const input = screen.getByRole("button", { name: "Upload" }).nextElementSibling as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input).toHaveAttribute("hidden");
    expect(input).toHaveAttribute("multiple");
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(click).toHaveBeenCalled();
    const file = new File(["x"], "a.txt");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
    expect(events).toEqual([{ type: "upload-picked", detail: [file] }]);
    expect(input.value).toBe("");
  });

  it("the completion sound is on by default and persists the opt-out", () => {
    mount();
    const box = screen.getByLabelText<HTMLInputElement>("Completion sound");
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(localStorage.getItem("completion-sound")).toBe("false");
    fireEvent.click(box);
    expect(localStorage.getItem("completion-sound")).toBe("true");
  });

  it("reads a stored opt-out", () => {
    localStorage.setItem("completion-sound", "false");
    mount();
    expect(screen.getByLabelText<HTMLInputElement>("Completion sound").checked).toBe(false);
  });

  it("does not duplicate the header on reconnect", () => {
    const { bar } = mount();
    bar.remove();
    document.body.append(bar);
    expect(bar.querySelectorAll("header.topbar")).toHaveLength(1);
  });
});
