import { useEffect, useState } from "react";
import {
  getAnglerLeaderboard,
  getSpeciesCatchLeaderboard,
  getSpeciesLeaderboard,
} from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { AnglerStat, LeaderboardCatch, SpeciesRecord } from "../api/types";
import BottomSheet from "../components/BottomSheet";

type Tab = "species" | "anglers";

export default function Leaderboard() {
  const [tab, setTab] = useState<Tab>("species");
  const [records, setRecords] = useState<SpeciesRecord[]>([]);
  const [anglers, setAnglers] = useState<AnglerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpeciesRecord | null>(null);
  const [detail, setDetail] = useState<LeaderboardCatch[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    Promise.all([getSpeciesLeaderboard(), getAnglerLeaderboard()])
      .then(([speciesRecords, anglerStats]) => {
        setRecords(speciesRecords);
        setAnglers(anglerStats);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load leaderboard"))
      .finally(() => setLoading(false));
  }, []);

  function openSpecies(record: SpeciesRecord) {
    setSelected(record);
    setDetail(null);
    setDetailLoading(true);
    getSpeciesCatchLeaderboard(record.species.id)
      .then(setDetail)
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
  }

  return (
    <div className="page">
      <h1>Leaderboard</h1>
      <div className="tab-switch">
        <button
          type="button"
          className={tab === "species" ? "" : "secondary-button"}
          onClick={() => setTab("species")}
        >
          Biggest Fish
        </button>
        <button
          type="button"
          className={tab === "anglers" ? "" : "secondary-button"}
          onClick={() => setTab("anglers")}
        >
          Most Catches
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && tab === "species" && (
        <ul className="catch-list">
          {records.map((r) => (
            <li key={r.species.id} className="card card-tappable" onClick={() => openSpecies(r)}>
              <span className="card-title">{r.species.common_name}</span>
              {r.top_catch ? (
                <span className="card-meta">
                  🏆 {r.top_catch.display_name} — {r.top_catch.weight} lb
                </span>
              ) : (
                <span className="card-meta">No record yet</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!loading && tab === "anglers" && (
        <ul className="catch-list">
          {anglers.map((a, i) => (
            <li key={a.display_name} className="card">
              <div className="page-header">
                <span className="card-title">
                  #{i + 1} {a.display_name}
                </span>
                <span className="card-stat">{a.catch_count} catches</span>
              </div>
              <span className="card-meta">{a.species_count} species discovered</span>
            </li>
          ))}
          {anglers.length === 0 && <p>No catches logged yet.</p>}
        </ul>
      )}

      <BottomSheet open={selected != null} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <h1>{selected.species.common_name}</h1>
            {detailLoading && <p>Loading...</p>}
            {!detailLoading && detail && detail.length === 0 && <p>No one has caught this yet.</p>}
            {!detailLoading && detail && detail.length > 0 && (
              <ul className="catch-list">
                {detail.map((c, i) => (
                  <li key={c.id} className="card">
                    {c.photo_url && (
                      <img className="catch-photo" src={`${API_BASE}${c.photo_url}`} alt={c.display_name} />
                    )}
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
      </BottomSheet>
    </div>
  );
}
