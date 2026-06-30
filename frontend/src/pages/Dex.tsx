import { useEffect, useMemo, useState } from "react";
import { listMyCatches, listSpecies } from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { Catch, Species } from "../api/types";
import BottomSheet from "../components/BottomSheet";

interface DexEntry {
  species: Species;
  caught: boolean;
  photoUrl: string | null;
  catchCount: number;
}

export default function Dex() {
  const [species, setSpecies] = useState<Species[]>([]);
  const [catches, setCatches] = useState<Catch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DexEntry | null>(null);

  useEffect(() => {
    Promise.all([listSpecies(), listMyCatches()])
      .then(([speciesList, catchList]) => {
        setSpecies(speciesList);
        setCatches(catchList);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dex"))
      .finally(() => setLoading(false));
  }, []);

  const entries = useMemo<DexEntry[]>(() => {
    const mapped = species.map((s) => {
      const myCatches = catches
        .filter((c) => c.species_id === s.id)
        .sort((a, b) => new Date(b.caught_at).getTime() - new Date(a.caught_at).getTime());
      const withPhoto = myCatches.find((c) => c.photo_url);
      return {
        species: s,
        caught: myCatches.length > 0,
        photoUrl: withPhoto?.photo_url ?? null,
        catchCount: myCatches.length,
      };
    });
    return mapped.sort((a, b) => {
      if (a.caught !== b.caught) return a.caught ? -1 : 1;
      return a.species.common_name.localeCompare(b.species.common_name);
    });
  }, [species, catches]);

  const caughtCount = entries.filter((e) => e.caught).length;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dex</h1>
        <span className="card-stat">
          {caughtCount}/{entries.length} caught
        </span>
      </div>
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      <ul className="dex-grid">
        {entries.map((entry) => (
          <li
            key={entry.species.id}
            className={`dex-card ${entry.caught ? "" : "locked"}`}
            onClick={() => setSelected(entry)}
          >
            <div className="dex-card-image-wrap">
              {entry.caught && entry.photoUrl ? (
                <img src={`${API_BASE}${entry.photoUrl}`} alt={entry.species.common_name} />
              ) : (
                <span className="dex-card-emoji">🐟</span>
              )}
            </div>
            <span className="dex-card-name">{entry.species.common_name}</span>
          </li>
        ))}
      </ul>

      <BottomSheet open={selected != null} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            {selected.caught && selected.photoUrl && (
              <img
                className="catch-photo"
                src={`${API_BASE}${selected.photoUrl}`}
                alt={selected.species.common_name}
              />
            )}
            <h1>{selected.species.common_name}</h1>
            {selected.species.scientific_name && (
              <p className="card-meta" style={{ fontStyle: "italic", marginBottom: 12 }}>
                {selected.species.scientific_name}
              </p>
            )}
            <div className="card-stats" style={{ marginBottom: 14, flexWrap: "wrap" }}>
              {selected.species.typical_size_range && (
                <span className="card-stat">{selected.species.typical_size_range}</span>
              )}
              {selected.species.season_notes && <span className="card-stat">{selected.species.season_notes}</span>}
              <span className="card-stat">
                {selected.caught ? `Caught ${selected.catchCount}x` : "Not yet caught"}
              </span>
            </div>
            {selected.species.habitat_description && <p>{selected.species.habitat_description}</p>}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
