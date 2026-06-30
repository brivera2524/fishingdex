import { useEffect, useState } from "react";
import { listSpecies } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { Species } from "../api/types";
import BottomSheet from "../components/BottomSheet";

export default function SpeciesList() {
  const [species, setSpecies] = useState<Species[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Species | null>(null);

  useEffect(() => {
    listSpecies()
      .then(setSpecies)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load species"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1>Species</h1>
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      <ul className="species-list">
        {species.map((s) => (
          <li key={s.id} className="card card-tappable" onClick={() => setSelected(s)}>
            <span className="card-title">{s.common_name}</span>
            {s.scientific_name && (
              <span className="card-meta" style={{ fontStyle: "italic" }}>
                {s.scientific_name}
              </span>
            )}
            {s.typical_size_range && <span className="card-stat" style={{ alignSelf: "flex-start" }}>{s.typical_size_range}</span>}
          </li>
        ))}
      </ul>

      <BottomSheet open={selected != null} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <h1>{selected.common_name}</h1>
            {selected.scientific_name && (
              <p className="card-meta" style={{ fontStyle: "italic", marginBottom: 12 }}>
                {selected.scientific_name}
              </p>
            )}
            <div className="card-stats" style={{ marginBottom: 14 }}>
              {selected.typical_size_range && <span className="card-stat">{selected.typical_size_range}</span>}
              {selected.season_notes && <span className="card-stat">{selected.season_notes}</span>}
            </div>
            {selected.habitat_description && <p>{selected.habitat_description}</p>}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
