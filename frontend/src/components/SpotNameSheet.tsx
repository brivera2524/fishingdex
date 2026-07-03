import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";

interface SpotNameSheetProps {
  open: boolean;
  saving: boolean;
  /** Pre-fills the field — used for renaming an existing spot. Defaults to
   * blank for naming a newly-drawn one. */
  initialValue?: string;
  title?: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}

export default function SpotNameSheet({
  open,
  saving,
  initialValue = "",
  title = "Name this spot",
  onCancel,
  onSave,
}: SpotNameSheetProps) {
  const [name, setName] = useState(initialValue);

  // Resyncs to whatever the sheet should start with each time it opens —
  // a plain useState initializer would only pick up the first render's
  // initialValue, not a different one the next time the sheet reopens for
  // a different spot.
  useEffect(() => {
    if (open) setName(initialValue);
  }, [open, initialValue]);

  function handleClose() {
    onCancel();
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <BottomSheet open={open} onClose={handleClose}>
      <div className="form">
        <h1>{title}</h1>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Harbor Island"
          autoFocus
          style={{ marginTop: 14, marginBottom: 16 }}
        />
        <div className="catch-actions">
          <button type="button" className="secondary-button" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || name.trim().length === 0}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
