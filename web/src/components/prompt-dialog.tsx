import { useState } from "react";

interface PromptDialogProps {
  readonly title: string;
  readonly placeholder: string;
  readonly confirmLabel: string;
  readonly onConfirm: (value: string) => void;
  readonly onCancel: () => void;
}

/**
 * A modal that collects a single line of text (used for "New folder"). The
 * confirm button stays disabled until the trimmed input is non-empty, so the
 * caller never has to guard against blank names.
 */
export function PromptDialog({
  title,
  placeholder,
  confirmLabel,
  onConfirm,
  onCancel,
}: PromptDialogProps): React.JSX.Element {
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  function submit(): void {
    if (trimmed !== "") onConfirm(trimmed);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div
        className="dialog"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <p>{title}</p>
        <input
          className="prompt-input"
          type="text"
          autoFocus
          placeholder={placeholder}
          aria-label={title}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={trimmed === ""}
            onClick={submit}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
