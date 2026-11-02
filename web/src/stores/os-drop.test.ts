import { createOsDrop } from "./os-drop.ts";

function dragEvent(
  over: Partial<{
    types: string[] | null;
    files: FileList;
    currentTarget: unknown;
    relatedTarget: unknown;
  }>,
): DragEvent {
  const { types = ["Files"], files, currentTarget, relatedTarget } = over;
  return {
    dataTransfer:
      types === null ? null : { types, files, dropEffect: "none" },
    currentTarget,
    relatedTarget,
    preventDefault: vi.fn(),
  } as unknown as DragEvent;
}

describe("createOsDrop", () => {
  it("shows the drop zone and copies when files hover", () => {
    const drop = createOsDrop(vi.fn());
    const e = dragEvent({});
    drop.handlers.onDragOver(e);
    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(e.dataTransfer?.dropEffect).toBe("copy");
    expect(drop.getState().osDragOver).toBe(true);
  });

  it("ignores non-file drags and events without a dataTransfer", () => {
    const onFiles = vi.fn();
    const drop = createOsDrop(onFiles);
    for (const types of [["text/plain"], null]) {
      const e = dragEvent({ types });
      drop.handlers.onDragOver(e);
      drop.handlers.onDrop(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(drop.getState().osDragOver).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("stays open when the leave only crosses a child tile", () => {
    const drop = createOsDrop(vi.fn());
    drop.handlers.onDragOver(dragEvent({}));
    const child = document.createElement("div");
    const host = document.createElement("div");
    host.append(child);
    drop.handlers.onDragLeave(
      dragEvent({ currentTarget: host, relatedTarget: child }),
    );
    expect(drop.getState().osDragOver).toBe(true);
  });

  it("closes when the leave exits the host or has no host", () => {
    const drop = createOsDrop(vi.fn());
    const host = document.createElement("div");
    drop.handlers.onDragOver(dragEvent({}));
    drop.handlers.onDragLeave(
      dragEvent({ currentTarget: host, relatedTarget: null }),
    );
    expect(drop.getState().osDragOver).toBe(false);
    drop.handlers.onDragOver(dragEvent({}));
    drop.handlers.onDragLeave(dragEvent({ currentTarget: null }));
    expect(drop.getState().osDragOver).toBe(false);
  });

  it("hands dropped files to the callback and hides the zone", () => {
    const onFiles = vi.fn();
    const drop = createOsDrop(onFiles);
    const files = [] as unknown as FileList;
    drop.handlers.onDragOver(dragEvent({}));
    const e = dragEvent({ files });
    drop.handlers.onDrop(e);
    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(drop.getState().osDragOver).toBe(false);
    expect(onFiles).toHaveBeenCalledWith(files);
    drop.dispose();
  });
});
