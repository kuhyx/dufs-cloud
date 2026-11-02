import { createStore, type Readable } from "./store.ts";

export interface OsDropState {
  /** True while OS files hover the grid, so the content area shows a drop zone. */
  readonly osDragOver: boolean;
}

export interface OsDrop extends Readable<OsDropState> {
  readonly handlers: {
    readonly onDragOver: (e: DragEvent) => void;
    readonly onDragLeave: (e: DragEvent) => void;
    readonly onDrop: (e: DragEvent) => void;
  };
  dispose: () => void;
}

const hasFiles = (e: DragEvent): e is DragEvent & { dataTransfer: DataTransfer } =>
  e.dataTransfer?.types.includes("Files") === true;

/** OS files dropped on empty space; folder tiles stop their own drops first. */
export function createOsDrop(onFiles: (files: FileList) => void): OsDrop {
  const store = createStore<OsDropState>({ osDragOver: false });
  const setOver = (osDragOver: boolean): void => {
    store.setState({ osDragOver });
  };
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    handlers: {
      onDragOver: (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      },
      onDragLeave: (e) => {
        // Ignore the leave events fired while crossing child tiles.
        const host = e.currentTarget as Node | null;
        if (host?.contains(e.relatedTarget as Node | null) === true) return;
        setOver(false);
      },
      onDrop: (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(false);
        onFiles(e.dataTransfer.files);
      },
    },
    dispose: () => undefined,
  };
}
