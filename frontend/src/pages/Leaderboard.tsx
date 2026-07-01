import { useEffect, useState } from "react";
import {
  getAnglerLeaderboard,
  getSpeciesCatchLeaderboard,
  getSpeciesLeaderboard,
} from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { AnglerStat, LeaderboardCatch, SpeciesRecord } from "../api/types";
import BottomSheet from "../components/BottomSheet";
import CommentThread from "../components/CommentThread";
import ViewOnMapButton from "../components/ViewOnMapButton";

type Tab = "species" | "anglers";

interface LeaderboardProps {
  embedded?: boolean;
}

export default function Leaderboard({ embedded = false }: LeaderboardProps) {
  const [tab, setTab] = useState<Tab>("species");
  const [records, setRecords] = useState<SpeciesRecord[]>([]);
  const [anglers, setAnglers] = useState<AnglerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [detail, setDetail] = useState<LeaderboardCatch[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedCatch, setSelectedCatch] = useState<LeaderboardCatch | null>(null);

  useEffect(() => {
    Promise.all([getSpeciesLeaderboard(), getAnglerLeaderboard()])
      .then(([speciesRecords, anglerStats]) => {
        const sorted = [...speciesRecords].sort((a, b) =>
          a.species.common_name.localeCompare(b.species.common_name)
        );
        setRecords(sorted);
        setAnglers(anglerStats);

        const mostCaughtIndex = sorted.reduce(
          (bestIdx, r, i) => (r.catch_count > sorted[bestIdx].catch_count ? i : bestIdx),
          0
        );
        setIndex(mostCaughtIndex);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load leaderboard"))
      .finally(() => setLoading(false));
  }, []);

  const current = records[index] ?? null;

  useEffect(() => {
    if (!current) return;
    setDetailLoading(true);
    setDetail(null);
    getSpeciesCatchLeaderboard(current.species.id)
      .then(setDetail)
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.species.id]);

  function step(delta: number) {
    if (records.length === 0) return;
    setIndex((i) => (i + delta + records.length) % records.length);
  }

  return (
    <div className={embedded ? undefined : "page"}>
      {!embedded && <h1>Leaderboard</h1>}
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

      {!loading && tab === "species" && current && (
        <>
          <div className="species-switcher">
            <button
              type="button"
              className="secondary-button species-switcher-arrow"
              onClick={() => step(-1)}
              aria-label="Previous species"
            >
              ‹
            </button>
            <button
              type="button"
              className="species-switcher-label"
              onClick={() => setPickerOpen(true)}
            >
              <span className="card-title">{current.species.common_name} ▾</span>
              <span className="card-meta">
                {index + 1} / {records.length}
              </span>
            </button>
            <button
              type="button"
              className="secondary-button species-switcher-arrow"
              onClick={() => step(1)}
              aria-label="Next species"
            >
              ›
            </button>
          </div>

          {detailLoading && <p>Loading...</p>}
          {!detailLoading && detail && detail.length === 0 && <p>No one has caught this yet.</p>}
          {!detailLoading && detail && detail.length > 0 && (
            <ul className="catch-list">
              {detail.map((c, i) => (
                <li key={c.id} className="card card-tappable" onClick={() => setSelectedCatch(c)}>
                  {c.photo_url && (
                    <img className="catch-photo" src={`${API_BASE}${c.photo_url}`} alt={c.display_name} />
                  )}
                  <div className="page-header">
                    <span className="card-title">
                      {i === 0 ? "🏆 " : `#${i + 1} `}
                      {c.display_name}
                    </span>
                    <span className="card-stat">{c.weight} lb</span>
                  </div>
                  <span className="card-meta">{new Date(c.caught_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </>
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

      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)}>
        <h1>Jump to species</h1>
        <ul className="catch-list">
          {records.map((r, i) => (
            <li
              key={r.species.id}
              className="card card-tappable"
              onClick={() => {
                setIndex(i);
                setPickerOpen(false);
              }}
            >
              <div className="page-header">
                <span className="card-title">{r.species.common_name}</span>
                <span className="card-stat">{r.catch_count} caught</span>
              </div>
            </li>
          ))}
        </ul>
      </BottomSheet>

      <BottomSheet open={selectedCatch != null} onClose={() => setSelectedCatch(null)}>
        {selectedCatch && (
          <div>
            {selectedCatch.photo_url && (
              <img
                className="catch-photo"
                src={`${API_BASE}${selectedCatch.photo_url}`}
                alt={selectedCatch.display_name}
              />
            )}
            <h1>{selectedCatch.display_name}</h1>
            <div className="card-stats" style={{ margin: "10px 0" }}>
              {selectedCatch.weight != null && <span className="card-stat">{selectedCatch.weight} lb</span>}
              {selectedCatch.length != null && <span className="card-stat">{selectedCatch.length} in</span>}
            </div>
            <p className="card-meta">{new Date(selectedCatch.caught_at).toLocaleString()}</p>
            {selectedCatch.latitude != null && (
              <div className="catch-actions">
                <ViewOnMapButton
                  catchId={selectedCatch.id}
                  latitude={selectedCatch.latitude}
                  longitude={selectedCatch.longitude}
                />
              </div>
            )}
            <CommentThread catchId={selectedCatch.id} />
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
