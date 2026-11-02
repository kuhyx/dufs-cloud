import { describe, it, expect } from "vitest";
import { createListing } from "./listing.ts";
import { clientWith, deferred, entry, flush } from "../test/store-helpers.ts";
import type { DirEntry } from "../api/types.ts";

describe("createListing", () => {
  it("starts loading with no entries and fetches nothing yet", () => {
    const client = clientWith({ list: () => Promise.resolve([]) });
    const listing = createListing(client);
    expect(listing.getState()).toEqual({
      entries: [],
      loading: true,
      error: null,
    });
    expect(client.list).not.toHaveBeenCalled();
  });

  it("loads entries and hides app-owned files", async () => {
    const client = clientWith({
      list: () =>
        Promise.resolve([
          entry("/index.html"),
          entry("/.thumbs", "dir"),
          entry("/real.jpg"),
        ]),
    });
    const listing = createListing(client);
    listing.setPath("/");
    await flush();
    expect(listing.getState().loading).toBe(false);
    expect(listing.getState().entries.map((e) => e.name)).toEqual(["real.jpg"]);
    expect(listing.getState().error).toBeNull();
  });

  it("exposes an Error message", async () => {
    const listing = createListing(
      clientWith({ list: () => Promise.reject(new Error("boom")) }),
    );
    listing.setPath("/");
    await flush();
    expect(listing.getState()).toEqual({
      entries: [],
      loading: false,
      error: "boom",
    });
  });

  it("stringifies a non-Error rejection", async () => {
    const listing = createListing(
      clientWith({
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        list: () => Promise.reject("weird"),
      }),
    );
    listing.setPath("/");
    await flush();
    expect(listing.getState().error).toBe("weird");
  });

  it("setPath to the same path does not refetch", async () => {
    const client = clientWith({ list: () => Promise.resolve([]) });
    const listing = createListing(client);
    listing.setPath("/a");
    listing.setPath("/a");
    await flush();
    expect(client.list).toHaveBeenCalledTimes(1);
  });

  it("navigating clears the entries while the new path loads", async () => {
    const next = deferred<DirEntry[]>();
    const lists = [Promise.resolve([entry("/a.jpg")]), next.promise];
    const listing = createListing(
      clientWith({ list: () => lists.shift() ?? Promise.resolve([]) }),
    );
    listing.setPath("/");
    await flush();
    expect(listing.getState().entries).toHaveLength(1);
    listing.setPath("/b");
    expect(listing.getState()).toEqual({
      entries: [],
      loading: true,
      error: null,
    });
    next.resolve([entry("/b/c.jpg")]);
    await flush();
    expect(listing.getState().entries.map((e) => e.path)).toEqual(["/b/c.jpg"]);
  });

  it("reload is a no-op before any path is set", async () => {
    const client = clientWith({ list: () => Promise.resolve([]) });
    const listing = createListing(client);
    listing.reload();
    await flush();
    expect(client.list).not.toHaveBeenCalled();
  });

  it("reload re-fetches the current path, keeping entries meanwhile", async () => {
    const again = deferred<DirEntry[]>();
    const lists = [Promise.resolve([entry("/a.jpg")]), again.promise];
    const client = clientWith({
      list: () => lists.shift() ?? Promise.resolve([]),
    });
    const listing = createListing(client);
    listing.setPath("/");
    await flush();
    listing.reload();
    expect(listing.getState().entries).toHaveLength(1);
    again.resolve([entry("/a.jpg"), entry("/b.jpg")]);
    await flush();
    expect(client.list).toHaveBeenCalledTimes(2);
    expect(listing.getState().entries).toHaveLength(2);
  });

  it("drops a slow response for a path the user already left", async () => {
    const slow = deferred<DirEntry[]>();
    const lists = [slow.promise, Promise.resolve([entry("/b/new.jpg")])];
    const listing = createListing(
      clientWith({ list: () => lists.shift() ?? Promise.resolve([]) }),
    );
    listing.setPath("/a");
    listing.setPath("/b");
    await flush();
    slow.resolve([entry("/a/old.jpg")]);
    await flush();
    expect(listing.getState().entries.map((e) => e.path)).toEqual([
      "/b/new.jpg",
    ]);
  });

  it("drops a slow rejection for a path the user already left", async () => {
    const slow = deferred<DirEntry[]>();
    const lists = [slow.promise, Promise.resolve([entry("/b/new.jpg")])];
    const listing = createListing(
      clientWith({ list: () => lists.shift() ?? Promise.resolve([]) }),
    );
    listing.setPath("/a");
    listing.setPath("/b");
    await flush();
    slow.reject(new Error("late"));
    await flush();
    expect(listing.getState().error).toBeNull();
    expect(listing.getState().entries).toHaveLength(1);
  });

  it("ignores results arriving after dispose", async () => {
    const pending = deferred<DirEntry[]>();
    const listing = createListing(clientWith({ list: () => pending.promise }));
    listing.setPath("/");
    listing.dispose();
    pending.resolve([entry("/late.jpg")]);
    await flush();
    expect(listing.getState().loading).toBe(true);
  });

  it("ignores a rejection arriving after dispose", async () => {
    const pending = deferred<DirEntry[]>();
    const listing = createListing(clientWith({ list: () => pending.promise }));
    listing.setPath("/");
    listing.dispose();
    pending.reject(new Error("late"));
    await flush();
    expect(listing.getState().error).toBeNull();
  });
});
