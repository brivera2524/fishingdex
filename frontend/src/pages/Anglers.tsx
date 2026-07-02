import { useEffect, useState } from "react";
import { listUsers } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { UserStat } from "../api/types";
import BottomSheet from "../components/BottomSheet";
import AnglerDetail from "../components/AnglerDetail";
import PullToRefresh from "../components/PullToRefresh";
import Leaderboard from "./Leaderboard";

type Tab = "anglers" | "leaderboard";

interface SelectedAngler {
  id: number;
  displayName: string;
}

export default function Anglers() {
  const [tab, setTab] = useState<Tab>("anglers");
  const [users, setUsers] = useState<UserStat[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAngler, setSelectedAngler] = useState<SelectedAngler | null>(null);
  // Bumped on pull-to-refresh: the anglers list refetches directly (below),
  // and the embedded Leaderboard (which fetches its own data on mount)
  // remounts via key.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setUsersLoading(true);
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load anglers"))
      .finally(() => setUsersLoading(false));
  }, [refreshKey]);

  async function handlePullRefresh() {
    setRefreshKey((k) => k + 1);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return (
    <div className="page">
      <PullToRefresh onRefresh={handlePullRefresh}>
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
            className={tab === "leaderboard" ? "" : "secondary-button"}
            onClick={() => setTab("leaderboard")}
          >
            Leaderboard
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {tab === "anglers" && (
          <>
            {usersLoading && <p>Loading...</p>}
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
              {!usersLoading && users.length === 0 && <p>No anglers yet.</p>}
            </ul>
          </>
        )}

        {tab === "leaderboard" && <Leaderboard key={refreshKey} embedded />}
      </PullToRefresh>

      <BottomSheet open={selectedAngler != null} onClose={() => setSelectedAngler(null)} fixedHeight>
        {selectedAngler && <AnglerDetail userId={selectedAngler.id} displayName={selectedAngler.displayName} />}
      </BottomSheet>
    </div>
  );
}
