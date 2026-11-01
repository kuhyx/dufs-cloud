import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  createEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gallery } from "./gallery.tsx";
import { makeClient } from "../test/gallery-fixtures.ts";

beforeEach(() => {
  window.location.hash = "";
});

describe("Gallery dnd", () => {
  describe("drag and drop", () => {
    function transfer(over = {}) {
      const store = new Map<string, string>();
      return {
        types: [] as string[],
        files: [] as unknown as FileList,
        dropEffect: "",
        effectAllowed: "",
        setData: (t: string, v: string) => store.set(t, v),
        getData: (t: string) => store.get(t) ?? "",
        ...over,
      };
    }

    function tileFor(name: string): HTMLElement {
      const tile = screen.getByText(name).closest("li");
      if (tile === null) throw new Error(`no tile for ${name}`);
      return tile;
    }

    it("moves dropped entries into the folder tile they landed on", async () => {
      const client = makeClient();
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      const dt = transfer();
      fireEvent.dragStart(tileFor("pic.jpg"), { dataTransfer: dt });
      fireEvent.drop(tileFor("Media"), { dataTransfer: dt });
      await waitFor(() => {
        expect(client.move).toHaveBeenCalledWith("/pic.jpg", "/Media");
      });
    });

    it("moves the whole selection and clears it afterwards", async () => {
      const client = makeClient();
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      await userEvent.click(screen.getByLabelText("Select pic.jpg"));
      await userEvent.click(screen.getByLabelText("Select notes.txt"));
      expect(screen.getByText("2 selected")).toBeInTheDocument();
      const dt = transfer();
      fireEvent.dragStart(tileFor("pic.jpg"), { dataTransfer: dt });
      fireEvent.drop(tileFor("Media"), { dataTransfer: dt });
      await waitFor(() => {
        expect(client.move).toHaveBeenCalledWith("/pic.jpg", "/Media");
      });
      expect(client.move).toHaveBeenCalledWith("/notes.txt", "/Media");
      await waitFor(() => {
        expect(screen.queryByText("2 selected")).toBeNull();
      });
    });

    it("refuses to drop a folder into itself", async () => {
      const client = makeClient();
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      const dt = transfer();
      fireEvent.dragStart(tileFor("Media"), { dataTransfer: dt });
      fireEvent.drop(tileFor("Media"), { dataTransfer: dt });
      await waitFor(() => {
        expect(screen.getByText("pic.jpg")).toBeInTheDocument();
      });
      expect(client.move).not.toHaveBeenCalled();
    });

    it("reports a failed move in the busy banner", async () => {
      const client = makeClient({
        move: vi.fn(() => Promise.reject(new Error("nope"))),
      });
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      const dt = transfer();
      fireEvent.dragStart(tileFor("pic.jpg"), { dataTransfer: dt });
      fireEvent.drop(tileFor("Media"), { dataTransfer: dt });
      expect(await screen.findByText("nope")).toBeInTheDocument();
    });

    it("stringifies a non-Error move rejection", async () => {
      const client = makeClient({
        // Some rejections are not Errors (e.g. a bare string from a
        // third-party layer); the banner must still say something useful.
        move: vi.fn(
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the point of the test is a non-Error rejection
          () => Promise.reject("plain string"),
        ),
      });
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      const dt = transfer();
      fireEvent.dragStart(tileFor("pic.jpg"), { dataTransfer: dt });
      fireEvent.drop(tileFor("Media"), { dataTransfer: dt });
      expect(await screen.findByText("plain string")).toBeInTheDocument();
    });

    it("uploads OS files dropped on empty grid space into the current folder", async () => {
      const client = makeClient();
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      const main = document.querySelector("main.content");
      if (main === null) throw new Error("no main");
      const file = new File(["x"], "a.txt");
      const files = [file] as unknown as FileList;
      fireEvent.dragOver(main, { dataTransfer: transfer({ types: ["Files"] }) });
      expect(main).toHaveClass("content-drop");
      fireEvent.drop(main, {
        dataTransfer: transfer({ types: ["Files"], files }),
      });
      await waitFor(() => {
        expect(client.upload).toHaveBeenCalledWith("/", file, expect.anything());
      });
    });

    it("ignores our own drag over the grid background", async () => {
      render(<Gallery client={makeClient()} />);
      await screen.findByText("pic.jpg");
      const main = document.querySelector("main.content");
      if (main === null) throw new Error("no main");
      fireEvent.dragOver(main, { dataTransfer: transfer() });
      expect(main).not.toHaveClass("content-drop");
      // A drop with no files must not start an upload either.
      fireEvent.drop(main, { dataTransfer: transfer() });
      expect(main).not.toHaveClass("content-drop");
    });

    it("keeps the highlight while crossing child tiles, clearing on real exit", async () => {
      render(<Gallery client={makeClient()} />);
      await screen.findByText("pic.jpg");
      const main = document.querySelector("main.content");
      if (main === null) throw new Error("no main");
      fireEvent.dragOver(main, { dataTransfer: transfer({ types: ["Files"] }) });
      // relatedTarget is read-only on the event prototype, so fireEvent's
      // property bag cannot set it -- define it on the event directly.
      const leaveTowards = (target: Node): void => {
        const ev = createEvent.dragLeave(main);
        Object.defineProperty(ev, "relatedTarget", { value: target });
        fireEvent(main, ev);
      };
      // Leaving towards a child tile is not a real exit.
      leaveTowards(tileFor("pic.jpg"));
      expect(main).toHaveClass("content-drop");
      // Leaving the content area entirely clears it.
      leaveTowards(document.body);
      expect(main).not.toHaveClass("content-drop");
    });

    it("uploads OS files dropped on a folder tile into that folder", async () => {
      const client = makeClient();
      render(<Gallery client={client} />);
      await screen.findByText("pic.jpg");
      const file = new File(["x"], "b.txt");
      const files = [file] as unknown as FileList;
      fireEvent.drop(tileFor("Media"), {
        dataTransfer: transfer({ types: ["Files"], files }),
      });
      await waitFor(() => {
        expect(client.upload).toHaveBeenCalledWith("/Media", file, expect.anything());
      });
    });
  });
});
