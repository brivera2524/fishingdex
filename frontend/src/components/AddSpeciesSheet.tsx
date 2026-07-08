import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";

interface AddSpeciesSheetProps {
  open: boolean;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (commonName: string, scientificName: string) => void;
}

export default function AddSpeciesSheet({ open, saving, error, onCancel, onSave }: AddSpeciesSheetProps) {
  const [commonName, setCommonName] = useState("");
  const [scientificName, setScientificName] = useState("");

  useEffect(() => {
    if (open) {
      setCommonName("");
      setScientificName("");
    }
  }, [open]);

  function handleSave() {
    const trimmed = commonName.trim();
    if (!trimmed) return;
    onSave(trimmed, scientificName.trim());
  }

  return (
    <BottomSheet open={open} onClose={onCancel}>
      <div className="form">
        <h1>Add a species</h1>
        <p className="card-meta">
          Can't find it in the list? Add it here — an admin can fill in the details later.
        </p>
        <input
          type="text"
          value={commonName}
          onChange={(e) => setCommonName(e.target.value)}
          placeholder="Common name, e.g. Ocean Whitefish"
          autoFocus
          style={{ marginTop: 14 }}
        />
        <input
          type="text"
          value={scientificName}
          onChange={(e) => setScientificName(e.target.value)}
          placeholder="Scientific name (optional)"
          style={{ marginTop: 10, marginBottom: 16 }}
        />
        {error && <p className="error">{error}</p>}
        <div className="catch-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || commonName.trim().length === 0}>
            {saving ? "Adding..." : "Add species"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
