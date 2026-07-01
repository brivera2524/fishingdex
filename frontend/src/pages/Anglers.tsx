import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRecentCatches, listUsers } from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { RecentCatch, UserStat } from "../api/types";
import BottomSheet from "../components/BottomSheet";
import CommentThread from "../components/CommentThread";

type Tab = "anglers" | "recent";

export default function Anglers() {
  const [tab, setTab] = useState<Tab>("anglers");
  const [users, setUsers] = useState<UserStat[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [recent, setRecent] = useState<RecentCatch[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCatch, setSelectedCatch] = useState<RecentCatch | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load anglers"))
      .finally(() => setUsersLoading(false));
    getRecentCatches()
      .then(setRecent)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load recent catches"))
      .finally(() => setRecentLoading(false));
  }, []);

  return (
    <div className="page">
      <h1>Anglers</h1>
      <div className="tab-switch">
        <button
          type="button"
          className={tab === "anglers" ? "" : "secondary-button"}
          onClick={() => setTab("anglers")}
        >
          Anglers
        </button>
        <button
          type="button"
          className={tab === "recent" ? "" : "secondary-button"}
          onClick={() => setTab("recent")}
        >
          Recent Catches
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {tab === "anglers" && (
        <>
          {usersLoading && <p>Loading...</p>}
          <ul className="catch-list">
            {users.map((u) => (
              <li key={u.id} className="card card-tappable" onClick={() => navigate(`/anglers/${u.id}`)}>
                <div className="page-header">
                  <span className="card-title">{u.display_name}</span>
                  <span className="card-stat">{u.catch_count} catches</span>
                </div>
                <span className="card-meta">{u.species_count} species discovered</span>
              </li>
            ))}
            {!usersLoading && users.length === 0 && <p>No anglers yet.</p>}
          </ul>
        </>
      )}

      {tab === "recent" && (
        <>
          {recentLoading && <p>Loading...</p>}
          <ul className="catch-list">
            {recent.map((c) => (
              <li key={c.id} className="card card-tappable" onClick={() => setSelectedCatch(c)}>
                {c.photo_url && (
                  <img className="catch-photo" src={`${API_BASE}${c.photo_url}`} alt={c.species.common_name} />
                )}
                <div className="page-header">
                  <span className="card-title">{c.species.common_name}</span>
                  {c.weight != null && <span className="card-stat">{c.weight} lb</span>}
                </div>
                <span className="card-meta">
                  {c.display_name} · {new Date(c.caught_at).toLocaleString()}
                </span>
              </li>
            ))}
            {!recentLoading && recent.length === 0 && <p>No catches logged yet.</p>}
          </ul>
        </>
      )}

      <BottomSheet open={selectedCatch != null} onClose={() => setSelectedCatch(null)}>
        {selectedCatch && (
          <div>
            {selectedCatch.photo_url && (
              <img
                className="catch-photo"
                src={`${API_BASE}${selectedCatch.photo_url}`}
                alt={selectedCatch.species.common_name}
              />
            )}
            <h1>{selectedCatch.species.common_name}</h1>
            <p className="card-meta">
              Caught by{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => navigate(`/anglers/${selectedCatch.user_id}`)}
              >
                {selectedCatch.display_name}
              </button>
            </p>
            <div className="card-stats" style={{ margin: "10px 0" }}>
              {selectedCatch.weight != null && <span className="card-stat">{selectedCatch.weight} lb</span>}
              {selectedCatch.length != null && <span className="card-stat">{selectedCatch.length} in</span>}
            </div>
            <p className="card-meta">{new Date(selectedCatch.caught_at).toLocaleString()}</p>
            <CommentThread catchId={selectedCatch.id} />
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
