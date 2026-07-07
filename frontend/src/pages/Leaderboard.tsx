import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getChallenges,
  getSpeciesCatchLeaderboard,
  getSpeciesLeaderboard,
  listUsers,
} from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { Challenge, LeaderboardCatch, SpeciesRecord, UserStat } from "../api/types";
import BottomSheet from "../components/BottomSheet";
import CatchPhotoGallery from "../components/CatchPhotoGallery";
import CommentThread from "../components/CommentThread";
import AnglerDetail from "../components/AnglerDetail";
import PullToRefresh from "../components/PullToRefresh";
import ViewOnMapButton from "../components/ViewOnMapButton";

type Tab = "fish" | "species" | "challenge";
const TAB_VALUES: Tab[] = ["fish", "species", "challenge"];

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

interface SelectedAngler {
  id: number;
  displayName: string;
}

export default function Leaderboard() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState<UserStat[]>([]);
  const [records, setRecords] = useState<SpeciesRecord[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [detail, setDetail] = useState<LeaderboardCatch[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedCatch, setSelectedCatch] = useState<LeaderboardCatch | null>(null);
  const [selectedAngler, setSelectedAngler] = useState<SelectedAngler | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Draws the eye to the Challenge tab whenever there's one worth checking —
  // upcoming or actively running — and hides the tab entirely otherwise. A
  // stale ?tab=challenge (e.g. the challenge ended since the link was saved)
  // falls back to the default tab instead of leaving no tab visibly active.
  const hasLiveChallenge = challenges.some((c) => c.status !== "ended");
  const tabParam = searchParams.get("tab");
  const tab: Tab =
    TAB_VALUES.includes(tabParam as Tab) && (tabParam !== "challenge" || hasLiveChallenge)
      ? (tabParam as Tab)
      : "fish";

  function setTab(next: Tab) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("tab", next);
        return params;
      },
      { replace: true }
    );
  }

  // Keeps the challenge countdown from going stale if the tab is left open —
  // a minute of drift is plenty fine for a month-long challenge.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  function fetchDetail(speciesId: number) {
    setDetailLoading(true);
    setDetail(null);
    return getSpeciesCatchLeaderboard(speciesId)
      .then(setDetail)
      .catch(() => setDetail([]))
      .finally(() => setDetailLoading(false));
  }

  function loadData() {
    return Promise.all([listUsers(), getSpeciesLeaderboard(), getChallenges()])
      .then(([userStats, speciesRecords, challengeList]) => {
        setUsers(userStats);
        // Most-caught species first, so both the carousel and the "jump to
        // species" picker surface populated leaderboards before empty ones.
        const sorted = [...speciesRecords].sort((a, b) => {
          if (b.catch_count !== a.catch_count) return b.catch_count - a.catch_count;
          return a.species.common_name.localeCompare(b.species.common_name);
        });
        setRecords(sorted);
        setChallenges(challengeList);
        setIndex(0);
        // Refresh whatever species detail is on screen too, not just the
        // list backing it — a pull-to-refresh should update what's visible.
        if (sorted.length > 0) fetchDetail(sorted[0].species.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load leaderboard"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = records[index] ?? null;

  useEffect(() => {
    if (!current) return;
    fetchDetail(current.species.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.species.id]);

  function step(delta: number) {
    if (records.length === 0) return;
    setIndex((i) => (i + delta + records.length) % records.length);
  }

  return (
    <div className="page">
      <PullToRefresh onRefresh={loadData}>
        <h1>Leaderboard</h1>
        <div className="mode-pill-toggle">
          <button type="button" className={tab === "fish" ? "active" : ""} onClick={() => setTab("fish")}>
            Fish Caught
          </button>
          <button type="button" className={tab === "species" ? "active" : ""} onClick={() => setTab("species")}>
            Max Weight
          </button>
          {hasLiveChallenge && (
            <button
              type="button"
              className={tab === "challenge" ? "active" : ""}
              onClick={() => setTab("challenge")}
            >
              Challenge
              <span className="tab-badge-dot" aria-hidden="true" />
            </button>
          )}
        </div>

        {loading && <p>Loading...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && tab === "fish" && (
          <ul className="catch-list">
            {users.map((u) => (
              <li
                key={u.id}
                className="card card-tappable"
                onClick={() => setSelectedAngler({ id: u.id, displayName: u.display_name })}
              >
                <div className="page-header">
                  <span className="card-title">{u.display_name}</span>
                  <span className="card-stat">{u.catch_count} catches</span>
                </div>
                <span className="card-meta">{u.species_count} species discovered</span>
              </li>
            ))}
            {users.length === 0 && <p>No catches logged yet.</p>}
          </ul>
        )}

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
              <button type="button" className="species-switcher-label" onClick={() => setPickerOpen(true)}>
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
      </PullToRefresh>

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
            <CatchPhotoGallery photos={selectedCatch.photos} alt={selectedCatch.display_name} />
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

      <BottomSheet open={selectedAngler != null} onClose={() => setSelectedAngler(null)} fixedHeight>
        {selectedAngler && <AnglerDetail userId={selectedAngler.id} displayName={selectedAngler.displayName} />}
      </BottomSheet>
    </div>
  );
}
