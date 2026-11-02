import { fileAt } from "../test/client-fixtures.ts";
import { createSelection, type Selection } from "./selection.ts";

const a = fileAt("/a");
const b = fileAt("/b");
const c = fileAt("/c");
const d = fileAt("/d");
const items = [a, b, c, d];

const chosen = (s: Selection): string[] => [...s.getState().selected].sort();

describe("createSelection", () => {
  it("toggles single entries and derives selectedEntries from displayed", () => {
    const sel = createSelection();
    sel.setDisplayed(items);
    sel.toggleSelect(b, false);
    expect(sel.getState().selectedEntries).toEqual([b]);
    sel.toggleSelect(b, false);
    expect(chosen(sel)).toEqual([]);
    sel.toggleSelect(c, false);
    sel.setDisplayed([a, b]);
    expect(chosen(sel)).toEqual(["/c"]);
    expect(sel.getState().selectedEntries).toEqual([]);
    sel.dispose();
  });

  it("selects an inclusive range from the anchor in either direction", () => {
    const sel = createSelection();
    sel.setDisplayed(items);
    sel.toggleSelect(b, false);
    sel.toggleSelect(d, true);
    expect(chosen(sel)).toEqual(["/b", "/c", "/d"]);
    sel.clearSelection();
    sel.toggleSelect(c, false);
    sel.toggleSelect(a, true);
    expect(chosen(sel)).toEqual(["/a", "/b", "/c"]);
  });

  it("toggles normally when shift has no anchor or an off-screen end", () => {
    const sel = createSelection();
    sel.setDisplayed(items);
    sel.toggleSelect(a, true);
    expect(chosen(sel)).toEqual(["/a"]);
    sel.setDisplayed([b, c]);
    sel.toggleSelect(d, true);
    expect(chosen(sel)).toEqual(["/a", "/d"]);
    sel.setDisplayed([a, b, d]);
    sel.toggleSelect(b, true);
    expect(chosen(sel)).toEqual(["/a", "/b", "/d"]);
  });

  it("clears the selection and the anchor", () => {
    const sel = createSelection();
    sel.setDisplayed(items);
    sel.toggleSelect(a, false);
    sel.clearSelection();
    expect(chosen(sel)).toEqual([]);
    sel.toggleSelect(c, true);
    expect(chosen(sel)).toEqual(["/c"]);
  });
});
