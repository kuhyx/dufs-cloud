import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gallery } from "./gallery.tsx";
import { meta as makeMeta } from "../test/meta.ts";
import { makeClient } from "../test/gallery-fixtures.ts";

beforeEach(() => {
  window.location.hash = "";
});

describe("Gallery browse", () => {
  it("renders a directory listing", async () => {
    render(<Gallery client={makeClient()} />);
    expect(await screen.findByText("Media")).toBeInTheDocument();
    expect(screen.getByText("pic.jpg")).toBeInTheDocument();
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
  });

  it("opens an image in the viewer and closes it", async () => {
    render(<Gallery client={makeClient()} />);
    await userEvent.click(await screen.findByText("pic.jpg"));
    await waitFor(() => {
      expect(document.querySelector(".viewer-img")).not.toBeNull();
    });
    await userEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => {
      expect(document.querySelector(".viewer-img")).toBeNull();
    });
  });

  it("plays a video in the viewer", async () => {
    render(<Gallery client={makeClient()} />);
    await userEvent.click(await screen.findByText("clip.mp4"));
    await waitFor(() => {
      expect(document.querySelector("video")).not.toBeNull();
    });
  });

  it("plays a video's proxy in preference to the original when indexed", async () => {
    const client = makeClient({
      fetchMeta: vi.fn(() =>
        Promise.resolve({
          "/clip.mp4": makeMeta({ proxyPath: "/.proxies/clip.mp4.mp4" }),
        }),
      ),
    });
    render(<Gallery client={client} />);
    await userEvent.click(await screen.findByText("clip.mp4"));
    await waitFor(() => {
      const video = document.querySelector("video");
      expect(video).not.toBeNull();
      expect(video?.getAttribute("src")).toBe("/.proxies/clip.mp4.mp4");
    });
  });

  it("navigates between media in the viewer", async () => {
    render(<Gallery client={makeClient()} />);
    await userEvent.click(await screen.findByText("pic.jpg"));
    await waitFor(() => {
      expect(document.querySelector(".viewer-img")).not.toBeNull();
    });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => {
      expect(document.querySelector("video")).not.toBeNull();
    });
  });

  it("shows an error when listing fails", async () => {
    const client = makeClient({
      list: vi.fn(() => Promise.reject(new Error("boom"))),
    });
    render(<Gallery client={client} />);
    expect(await screen.findByText(/boom/)).toBeInTheDocument();
  });

  it("navigates via a breadcrumb", async () => {
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    await userEvent.click(screen.getByRole("button", { name: "cloud" }));
    expect(window.location.hash).toBe("#/");
  });

  it("steps to the previous media with ArrowLeft (wrapping)", async () => {
    render(<Gallery client={makeClient()} />);
    await userEvent.click(await screen.findByText("pic.jpg"));
    await waitFor(() => {
      expect(document.querySelector(".viewer-img")).not.toBeNull();
    });
    // media = [pic.jpg, clip.mp4]; from index 0, prev wraps to the video.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => {
      expect(document.querySelector("video")).not.toBeNull();
    });
  });

  it("shows an empty-folder message", async () => {
    const client = makeClient({ list: vi.fn(() => Promise.resolve([])) });
    render(<Gallery client={client} />);
    expect(await screen.findByText("This folder is empty.")).toBeInTheDocument();
  });

  it("renders breadcrumb separators for nested paths", async () => {
    window.location.hash = "#/Media/2026";
    render(<Gallery client={makeClient()} />);
    await screen.findByText("pic.jpg");
    expect(screen.getByRole("button", { name: "Media" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2026" })).toBeInTheDocument();
    expect(document.querySelectorAll(".crumb-sep").length).toBeGreaterThan(0);
  });
});
