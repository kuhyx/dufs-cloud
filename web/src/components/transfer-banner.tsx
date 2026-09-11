import {
  transferDetail,
  transferFraction,
  transferTitle,
  type TransferProgress,
} from "../lib/transfer.ts";

/**
 * A strip under the header while files move: a determinate bar for the
 * current file, the `n/total · name` and `% · bytes` lines, and a Cancel
 * button that aborts the current file and everything queued after it.
 */
export function TransferBanner({
  progress,
  onCancel,
}: {
  readonly progress: TransferProgress;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const fraction = transferFraction(progress);
  return (
    <div className="transfer" role="status">
      <div className="transfer-text">
        <div className="transfer-title">{transferTitle(progress)}</div>
        <div className="transfer-detail">{transferDetail(progress)}</div>
        {/* An indeterminate <progress> has no value attribute at all. */}
        {fraction === null ? (
          <progress className="transfer-bar" />
        ) : (
          <progress className="transfer-bar" value={fraction} max={1} />
        )}
      </div>
      <button type="button" className="ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
