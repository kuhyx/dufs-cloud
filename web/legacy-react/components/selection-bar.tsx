interface SelectionBarProps {
  readonly count: number;
  readonly onMove: () => void;
  readonly onDownload: () => void;
  readonly onDelete: () => void;
  readonly onClear: () => void;
}

/** Bulk actions shown while at least one item is selected. */
export function SelectionBar({
  count,
  onMove,
  onDownload,
  onDelete,
  onClear,
}: SelectionBarProps): React.JSX.Element {
  return (
    <div className="selbar">
      <span className="sel-count">{count} selected</span>
      <button type="button" onClick={onMove}>
        Move
      </button>
      <button type="button" onClick={onDownload}>
        Download
      </button>
      <button type="button" className="danger" onClick={onDelete}>
        Delete
      </button>
      <button type="button" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
