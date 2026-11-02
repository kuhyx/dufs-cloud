import { createToggleSet } from "./toggle-set.ts";

describe("createToggleSet", () => {
  it("adds an absent key, removes a present one and disposes as a no-op", () => {
    const set = createToggleSet();
    const listener = vi.fn();
    set.subscribe(listener);
    set.toggle("a");
    expect([...set.getState()]).toEqual(["a"]);
    set.toggle("b");
    set.toggle("a");
    expect([...set.getState()]).toEqual(["b"]);
    expect(listener).toHaveBeenCalledTimes(3);
    set.dispose();
  });
});
