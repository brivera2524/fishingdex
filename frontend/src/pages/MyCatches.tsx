import { useEffect, useState } from "react";
import { deleteCatch, getUserCatches, listMyCatches } from "../api/endpoints";
import { API_BASE, ApiError } from "../api/client";
import type { Catch } from "../api/types";
import BottomSheet from "../components/BottomSheet";
import CatchPhotoGallery from "../components/CatchPhotoGallery";
import CommentThread from "../components/CommentThread";
import ViewOnMapButton from "../components/ViewOnMapButton";
import { getMoonPhase } from "../lib/moonPhase";

interface MyCatchesProps {
  embedded?: boolean;
  userId?: number;
  readOnly?: boolean;
  onEdit?: (catchId: number) => void;
  /** Opens this catch's detail sheet as soon as the list loads — used right
   * after logging a catch, so the user lands straight on it to confirm it
   * saved correctly and can immediately fix/delete it if something's off. */
  autoSelectCatchId?: number;
}

export default function MyCatches({
  embedded = false,
  userId,
  readOnly = false,
  onEdit,
  autoSelectCatchId,
}: MyCatchesProps) {
  const [catches, setCatches] = useState<Catch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState<Catch | null>(null);
  const canEdit = !readOnly && userId == null;

  useEffect(() => {
    setLoading(true);
    (userId != null ? getUserCatches(userId) : listMyCatches())
      .then(setCatches)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load catches"))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (autoSelectCatchId == null) return;
    const match = catches.find((c) => c.id === autoSelectCatchId);
    if (match) setSelected(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catches, autoSelectCatchId]);

  function closeSheet() {
    setSelected(null);
    setConfirming(false);
  }

  async function handleDelete(catchId: number) {
    setDeletingId(catchId);
    try {
      await deleteCatch(catchId);
      setCatches((prev) => prev.filter((c) => c.id !== catchId));
      closeSheet();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete catch");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={embedded ? undefined : "page"}>
      {!embedded && (
        <div className="page-header">
          <h1>My catches</h1>
        </div>
      )}
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && catches.length === 0 && <p>No catches yet. Go log one!</p>}
      <ul className="catch-list">
        {catches.map((c) => (
          <li
            key={c.id}
            className="card card-tappable"
            onClick={() => {
              setSelected(c);
              setConfirming(false);
            }}
          >
            {c.photo_url && (
              <img className="catch-photo" src={`${API_BASE}${c.photo_url}`} alt={c.species.common_name} />
            )}
            <span className="card-title">{c.species.common_name}</span>
            <span className="card-meta">
              {getMoonPhase(c.caught_at).emoji} {new Date(c.caught_at).toLocaleString()}
            </span>
            <div className="card-stats">
              {c.weight != null && <span className="card-stat">{c.weight} lb</span>}
              {c.length != null && <span className="card-stat">{c.length} in</span>}
            </div>
          </li>
        ))}
      </ul>

      <BottomSheet open={selected != null} onClose={closeSheet}>
        {selected && (
          <div>
            <CatchPhotoGallery photos={selected.photos} alt={selected.species.common_name} />
            <h1>{selected.species.common_name}</h1>
            <p className="card-meta">{new Date(selected.caught_at).toLocaleString()}</p>
            <div className="card-stats" style={{ margin: "10px 0" }}>
              {selected.weight != null && <span className="card-stat">{selected.weight} lb</span>}
              {selected.length != null && <span className="card-stat">{selected.length} in</span>}
              {selected.tide_height_ft != null && (
                <span className="card-stat">
                  {selected.tide_direction === "rising" ? "↑" : "↓"} {selected.tide_height_ft}ft tide
                </span>
              )}
              <span className="card-stat">
                {getMoonPhase(selected.caught_at).emoji} {getMoonPhase(selected.caught_at).name}
              </span>
            </div>
            {selected.notes && <p style={{ marginBottom: 14 }}>{selected.notes}</p>}

            {canEdit &&
              (confirming ? (
                <div className="catch-actions">
                  <span className="confirm-label">Delete this catch?</span>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => handleDelete(selected.id)}
                    disabled={deletingId === selected.id}
                  >
                    {deletingId === selected.id ? "Deleting..." : "Yes, delete"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setConfirming(false)}
                    disabled={deletingId === selected.id}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="catch-actions">
                  <ViewOnMapButton catchId={selected.id} latitude={selected.latitude} longitude={selected.longitude} />
                  <button
                    type="button"
                    onClick={() => {
                      const catchId = selected.id;
                      closeSheet();
                      onEdit?.(catchId);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="danger-button" onClick={() => setConfirming(true)}>
                    Delete
                  </button>
                </div>
              ))}

            {!canEdit && selected.latitude != null && (
              <div className="catch-actions">
                <ViewOnMapButton catchId={selected.id} latitude={selected.latitude} longitude={selected.longitude} />
              </div>
            )}

            <CommentThread catchId={selected.id} />
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
