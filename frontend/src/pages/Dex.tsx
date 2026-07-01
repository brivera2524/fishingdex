import { useMemo, useState, useEffect } from "react";
import { getSpeciesCatchLeaderboard, listMyCatches, listSpecies } from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { Catch, LeaderboardCatch, Species } from "../api/types";
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
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardCatch[] | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

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

  function openEntry(entry: DexEntry) {
    setSelected(entry);
    setShowLeaderboard(false);
    setLeaderboard(null);
  }

  function toggleLeaderboard() {
    if (!selected) return;
    if (showLeaderboard) {
      setShowLeaderboard(false);
      return;
    }
    setShowLeaderboard(true);
    if (leaderboard == null) {
      setLeaderboardLoading(true);
      getSpeciesCatchLeaderboard(selected.species.id)
        .then(setLeaderboard)
        .catch(() => setLeaderboard([]))
        .finally(() => setLeaderboardLoading(false));
    }
  }

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
            onClick={() => openEntry(entry)}
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

      <BottomSheet
        open={selected != null}
        onClose={() => {
          setSelected(null);
          setShowLeaderboard(false);
        }}
      >
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
            {selected.species.habitat_description && (
              <p style={{ marginBottom: 14 }}>{selected.species.habitat_description}</p>
            )}

            <button type="button" className="secondary-button" onClick={toggleLeaderboard}>
              {showLeaderboard ? "Hide leaderboard" : "🏆 View leaderboard"}
            </button>

            {showLeaderboard && (
              <div style={{ marginTop: 14 }}>
                {leaderboardLoading && <p>Loading...</p>}
                {!leaderboardLoading && leaderboard && leaderboard.length === 0 && (
                  <p>No one has caught this yet.</p>
                )}
                {!leaderboardLoading && leaderboard && leaderboard.length > 0 && (
                  <ul className="catch-list">
                    {leaderboard.map((c, i) => (
                      <li key={c.id} className="card">
                        <div className="page-header">
                          <span className="card-title">
                            #{i + 1} {c.display_name}
                          </span>
                          <span className="card-stat">{c.weight} lb</span>
                        </div>
                        <span className="card-meta">{new Date(c.caught_at).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
