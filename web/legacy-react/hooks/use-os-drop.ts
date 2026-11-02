import { useState } from "react";

export interface OsDrop {
  readonly osDragOver: boolean;
  readonly handlers: {
    readonly onDragOver: (e: React.DragEvent<HTMLElement>) => void;
    readonly onDragLeave: (e: React.DragEvent<HTMLElement>) => void;
    readonly onDrop: (e: React.DragEvent<HTMLElement>) => void;
  };
}

/** OS files dropped on empty space; folder tiles stop their own drops first. */
export function useOsDrop(onFiles: (files: FileList) => void): OsDrop {
  // True while OS files hover the grid, so the content area shows a drop zone.
  const [osDragOver, setOsDragOver] = useState(false);
  return {
    osDragOver,
    handlers: {
      onDragOver: (e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOsDragOver(true);
      },
      onDragLeave: (e) => {
        // Ignore the leave events fired while crossing child tiles.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOsDragOver(false);
      },
      onDrop: (e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOsDragOver(false);
        onFiles(e.dataTransfer.files);
      },
    },
  };
}
