import { useEffect, useState } from "react";
import { getRecentCatches } from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { RecentCatch } from "../api/types";
import BottomSheet from "../components/BottomSheet";
import CommentThread from "../components/CommentThread";
import AnglerDetail from "../components/AnglerDetail";
import PullToRefresh from "../components/PullToRefresh";
import ViewOnMapButton from "../components/ViewOnMapButton";

interface SelectedAngler {
  id: number;
  displayName: string;
}

export default function RecentCatches() {
  const [recent, setRecent] = useState<RecentCatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCatch, setSelectedCatch] = useState<RecentCatch | null>(null);
  const [selectedAngler, setSelectedAngler] = useState<SelectedAngler | null>(null);

  function loadRecent() {
    return getRecentCatches()
      .then(setRecent)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load recent catches"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <PullToRefresh onRefresh={loadRecent}>
        <h1>Recent Catches</h1>

        {loading && <p>Loading...</p>}
        {error && <p className="error">{error}</p>}

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
          {!loading && recent.length === 0 && <p>No catches logged yet.</p>}
        </ul>
      </PullToRefresh>

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
                onClick={() => {
                  const angler = { id: selectedCatch.user_id, displayName: selectedCatch.display_name };
                  setSelectedCatch(null);
                  setSelectedAngler(angler);
                }}
              >
                {selectedCatch.display_name}
              </button>
            </p>
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
