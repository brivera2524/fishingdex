import { useState } from "react";
import BottomSheet from "./BottomSheet";

interface SpotNameSheetProps {
  open: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: (name: string) => void;
}

export default function SpotNameSheet({ open, saving, onCancel, onSave }: SpotNameSheetProps) {
  const [name, setName] = useState("");

  function handleClose() {
    setName("");
    onCancel();
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName("");
  }

  return (
    <BottomSheet open={open} onClose={handleClose}>
      <div className="form">
        <h1>Name this spot</h1>
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
            {saving ? "Saving..." : "Save spot"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
