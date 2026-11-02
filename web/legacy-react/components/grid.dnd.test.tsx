import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderGrid } from "../test/grid-fixtures.tsx";

/** The subset of DataTransfer the drag handlers touch. */
interface FakeTransfer {
  types: string[];
  files: FileList;
  dropEffect: string;
  effectAllowed: string;
  setData: (type: string, value: string) => void;
  getData: (type: string) => string;
}

describe("Grid", () => {
  describe("drag and drop", () => {
    // jsdom has no DataTransfer, so stand in with the slice the handlers use.
    function transfer(over: Partial<FakeTransfer> = {}): FakeTransfer {
      const store = new Map<string, string>();
      return {
        types: [],
        files: [] as unknown as FileList,
        dropEffect: "",
        effectAllowed: "",
        setData: (type: string, value: string) => store.set(type, value),
        getData: (type: string) => store.get(type) ?? "",
        ...over,
      };
    }

    function tileFor(name: string): HTMLElement {
      const tile = screen.getByText(name).closest("li");
      if (tile === null) throw new Error(`no tile for ${name}`);
      return tile;
    }

    it("is off entirely when no drop handlers are supplied", () => {
      renderGrid();
      expect(tileFor("Media").draggable).toBe(false);
    });

    it("drags just the entry when it is not part of the selection", () => {
      renderGrid({ onMoveInto: vi.fn(), selected: new Set(["/notes.txt"]) });
      const dt = transfer();
      fireEvent.dragStart(tileFor("pic.jpg"), { dataTransfer: dt });
      expect(dt.getData("application/x-dufs-paths")).toBe('["/pic.jpg"]');
    });

    it("drags the whole selection when the dragged entry is selected", () => {
      renderGrid({
        onMoveInto: vi.fn(),
        selected: new Set(["/pic.jpg", "/notes.txt"]),
      });
      const dt = transfer();
      fireEvent.dragStart(tileFor("pic.jpg"), { dataTransfer: dt });
      expect(
        JSON.parse(dt.getData("application/x-dufs-paths")) as string[],
      ).toEqual(["/pic.jpg", "/notes.txt"]);
    });

    it("highlights only a folder tile under the drag, and clears on leave", () => {
      renderGrid({ onMoveInto: vi.fn() });
      const folder = tileFor("Media");
      fireEvent.dragOver(folder, { dataTransfer: transfer() });
      expect(folder).toHaveClass("tile-drop");
      fireEvent.dragLeave(folder);
      expect(folder).not.toHaveClass("tile-drop");
      // A file tile is not a drop target at all.
      const file = tileFor("pic.jpg");
      fireEvent.dragOver(file, { dataTransfer: transfer() });
      expect(file).not.toHaveClass("tile-drop");
    });

    it("shows a copy cursor for OS files and a move cursor for our own drag", () => {
      renderGrid({ onMoveInto: vi.fn() });
      const osDrag = transfer({ types: ["Files"] });
      fireEvent.dragOver(tileFor("Media"), { dataTransfer: osDrag });
      expect(osDrag.dropEffect).toBe("copy");
      const ourDrag = transfer();
      fireEvent.dragOver(tileFor("Media"), { dataTransfer: ourDrag });
      expect(ourDrag.dropEffect).toBe("move");
    });

    it("drops dragged entries onto a folder as a move", () => {
      const onMoveInto = vi.fn();
      renderGrid({ onMoveInto });
      const dt = transfer();
      dt.setData("application/x-dufs-paths", '["/pic.jpg","/notes.txt"]');
      fireEvent.drop(tileFor("Media"), { dataTransfer: dt });
      expect(onMoveInto).toHaveBeenCalledWith("/Media", [
        "/pic.jpg",
        "/notes.txt",
      ]);
    });

    it("drops OS files onto a folder as an upload into it", () => {
      const onUploadInto = vi.fn();
      const onMoveInto = vi.fn();
      const files = [new File(["x"], "a.txt")] as unknown as FileList;
      renderGrid({ onUploadInto, onMoveInto });
      fireEvent.drop(tileFor("Media"), {
        dataTransfer: transfer({ files, types: ["Files"] }),
      });
      expect(onUploadInto).toHaveBeenCalledWith("/Media", files);
      expect(onMoveInto).not.toHaveBeenCalled();
    });

    it("ignores a drop carrying nothing we understand", () => {
      const onMoveInto = vi.fn();
      renderGrid({ onMoveInto });
      // Empty payload, and a payload that is neither JSON nor an array.
      fireEvent.drop(tileFor("Media"), { dataTransfer: transfer() });
      const bad = transfer();
      bad.setData("application/x-dufs-paths", "not json");
      fireEvent.drop(tileFor("Media"), { dataTransfer: bad });
      const notArray = transfer();
      notArray.setData("application/x-dufs-paths", '{"nope":1}');
      fireEvent.drop(tileFor("Media"), { dataTransfer: notArray });
      // Non-string members are filtered out rather than passed through.
      const mixed = transfer();
      mixed.setData("application/x-dufs-paths", '["/pic.jpg",7]');
      fireEvent.drop(tileFor("Media"), { dataTransfer: mixed });
      expect(onMoveInto).toHaveBeenCalledTimes(1);
      expect(onMoveInto).toHaveBeenCalledWith("/Media", ["/pic.jpg"]);
    });

    it("clears the highlight once the drop lands", () => {
      renderGrid({ onMoveInto: vi.fn() });
      const folder = tileFor("Media");
      fireEvent.dragOver(folder, { dataTransfer: transfer() });
      expect(folder).toHaveClass("tile-drop");
      fireEvent.drop(folder, { dataTransfer: transfer() });
      expect(folder).not.toHaveClass("tile-drop");
    });
  });
});
