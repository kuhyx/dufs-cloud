import { createHashPath, readHash } from "./hash-path.ts";

const fireHashChange = (): void => {
  window.dispatchEvent(new HashChangeEvent("hashchange"));
};

describe("hash path", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("reads an empty hash as the root and normalizes others", () => {
    expect(readHash()).toBe("/");
    window.location.hash = "#/x/y/";
    expect(readHash()).toBe("/x/y");
  });

  it("reflects and updates the hash", () => {
    const hashPath = createHashPath();
    const listener = vi.fn();
    hashPath.subscribe(listener);
    expect(hashPath.getState()).toBe("/");
    hashPath.navigate("/x/y");
    fireHashChange();
    expect(hashPath.getState()).toBe("/x/y");
    expect(listener).toHaveBeenCalledOnce();
    hashPath.dispose();
  });

  it("ignores hash changes after dispose", () => {
    const hashPath = createHashPath();
    hashPath.dispose();
    hashPath.navigate("/later");
    fireHashChange();
    expect(hashPath.getState()).toBe("/");
  });
});
