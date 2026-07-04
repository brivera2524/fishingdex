import { useEffect, useState } from "react";
import {
  getAnglerLeaderboard,
  getChallenges,
  getSpeciesCatchLeaderboard,
  getSpeciesLeaderboard,
} from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { AnglerStat, Challenge, LeaderboardCatch, SpeciesRecord } from "../api/types";
import BottomSheet from "../components/BottomSheet";
import CommentThread from "../components/CommentThread";
import ViewOnMapButton from "../components/ViewOnMapButton";

type Tab = "species" | "anglers" | "challenge";

const CHALLENGE_STATUS_LABEL: Record<Challenge["status"], string> = {
  upcoming: "Starts soon",
  active: "In progress",
  ended: "Ended",
};

function formatDateRange(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(startsAt)} – ${fmt(endsAt)}`;
}

function formatCountdown(ch: Challenge, nowMs: number): string {
  const startMs = new Date(ch.starts_at).getTime();
  const endMs = new Date(ch.ends_at).getTime();
  const diffMs = ch.status === "upcoming" ? startMs - nowMs : ch.status === "active" ? endMs - nowMs : nowMs - endMs;

  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  const duration = days >= 1 ? `${days}d ${hours}h` : hours >= 1 ? `${hours}h ${minutes}m` : `${Math.max(minutes, 1)}m`;

  if (ch.status === "upcoming") return `Starts in ${duration}`;
  if (ch.status === "active") return `${duration} left`;
  return `Ended ${duration} ago`;
}

interface LeaderboardProps {
  embedded?: boolean;
}

export default function Leaderboard({ embedded = false }: LeaderboardProps) {
  const [tab, setTab] = useState<Tab>("species");
  const [records, setRecords] = useState<SpeciesRecord[]>([]);
  const [anglers, setAnglers] = useState<AnglerStat[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [detail, setDetail] = useState<LeaderboardCatch[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedCatch, setSelectedCatch] = useState<LeaderboardCatch | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Keeps the challenge countdown from going stale if the tab is left open —
  // a minute of drift is plenty fine for a month-long challenge.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Promise.all([getSpeciesLeaderboard(), getAnglerLeaderboard(), getChallenges()])
      .then(([speciesRecords, anglerStats, challengeList]) => {
        // Most-caught species first, so both the carousel and the "jump to
        // species" picker surface populated leaderboards before empty ones.
        const sorted = [...speciesRecords].sort((a, b) => {
          if (b.catch_count !== a.catch_count) return b.catch_count - a.catch_count;
          return a.species.common_name.localeCompare(b.species.common_name);
        });
        setRecords(sorted);
        setAnglers(anglerStats);
        setChallenges(challengeList);
        setIndex(0);
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
      <div className="leaderboard-mode-row">
        <span className="leaderboard-mode-label">Leaderboard</span>
        <div className="mode-pill-toggle">
          <button
            type="button"
            className={tab === "species" ? "active" : ""}
            onClick={() => setTab("species")}
          >
            Biggest Fish
          </button>
          <button
            type="button"
            className={tab === "anglers" ? "active" : ""}
            onClick={() => setTab("anglers")}
          >
            Most Catches
          </button>
          <button
            type="button"
            className={tab === "challenge" ? "active" : ""}
            onClick={() => setTab("challenge")}
          >
            Challenge
          </button>
        </div>
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

      {!loading && tab === "challenge" && (
        <>
          {challenges.length === 0 && <p>No challenges right now.</p>}
          {challenges.map((ch) => (
            <div key={ch.id} style={{ marginBottom: 20 }}>
              <div className="challenge-header">
                <div className="page-header">
                  <span className="challenge-title">{ch.name}</span>
                  <span className="challenge-status-pill">{CHALLENGE_STATUS_LABEL[ch.status]}</span>
                </div>
                <span className="card-meta">{formatDateRange(ch.starts_at, ch.ends_at)}</span>
                <span className="challenge-countdown">{formatCountdown(ch, now)}</span>
              </div>
              {ch.standings.length === 0 && (
                <p style={{ marginTop: 14 }}>
                  {ch.status === "upcoming" ? "Nobody's logged a qualifying catch yet." : "No qualifying catches."}
                </p>
              )}
              {ch.standings.length > 0 && (
                <>
                  <p className="section-label" style={{ marginTop: 16, marginBottom: 8 }}>
                    Standings
                  </p>
                  <ul className="catch-list">
                  {ch.standings.map((c, i) => {
                    const isLast = i === ch.standings.length - 1 && ch.standings.length > 1;
                    return (
                      <li key={c.id} className="card card-tappable" onClick={() => setSelectedCatch(c)}>
                        {c.photo_url && (
                          <img className="catch-photo" src={`${API_BASE}${c.photo_url}`} alt={c.display_name} />
                        )}
                        <div className="page-header">
                          <span className="card-title">
                            {i === 0 ? "🏆 " : isLast ? "🐟 " : `#${i + 1} `}
                            {c.display_name}
                          </span>
                          <span className="card-stat">{c.weight} lb</span>
                        </div>
                        <span className="card-meta">
                          {i === 0 && ch.status === "ended" && "Winner — "}
                          {isLast && ch.status === "ended" && "Loser — "}
                          {new Date(c.caught_at).toLocaleDateString()}
                        </span>
                      </li>
                    );
                  })}
                  </ul>
                </>
              )}
            </div>
          ))}
        </>
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
              {selectedCatch.tide_height_ft != null && (
                <span className="card-stat">
                  {selectedCatch.tide_direction === "rising" ? "↑" : "↓"} {selectedCatch.tide_height_ft}ft tide
                </span>
              )}
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
