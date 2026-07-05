import { useEffect, useState } from "react";
import { getAdminSettings, updateAdminSettings } from "../api/endpoints";

const MODEL_LABELS: Record<string, string> = {
  "gemini-3.1-flash-lite": "Gemini 3 Flash Lite",
  "gemini-3-flash-preview": "Gemini 3 Flash",
};

export default function AdminModelToggle() {
  const [model, setModel] = useState<string | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAdminSettings()
      .then((s) => {
        setModel(s.model);
        setAvailable(s.available_models);
      })
      .catch(() => {});
  }, []);

  async function handleChange(next: string) {
    setModel(next);
    setSaving(true);
    try {
      const updated = await updateAdminSettings(next);
      setModel(updated.model);
    } catch {
      // Admin-only convenience widget — a failed save just means the model
      // stays whatever it was on the server; not worth extra error UI here.
    } finally {
      setSaving(false);
    }
  }

  if (model == null) return null;

  return (
    <select
      className="admin-model-select"
      value={model}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value)}
      aria-label="Identify model"
      title="Gemini model used for fish identification"
    >
      {available.map((m) => (
        <option key={m} value={m}>
          {MODEL_LABELS[m] ?? m}
        </option>
      ))}
    </select>
  );
}
