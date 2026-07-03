import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";
import { API_BASE } from "../api/client";
import type { MapCatch, Spot } from "../api/types";
import { fetchWind, type WindState } from "./WindBadge";

const COMPASS_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function compassLabel(deg: number): string {
  return COMPASS_DIRS[Math.round(deg / 45) % 8];
}

interface WindDetailSheetProps {
  spot: Spot | null;
  catches: MapCatch[];
  open: boolean;
  onClose: () => void;
}

export default function WindDetailSheet({ spot, catches, open, onClose }: WindDetailSheetProps) {
  const [wind, setWind] = useState<WindState | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !spot) return;
    let cancelled = false;
    setWind(null);
    setError(false);
    fetchWind(spot.centroid_lat, spot.centroid_lng)
      .then((w) => {
        if (!cancelled) setWind(w);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, spot]);

  const spotCatches = spot ? catches.filter((c) => c.spot?.id === spot.id).slice(0, 8) : [];
  // The arrow is drawn pointing "up" (north) at rest, so it rotates by the
  // direction the wind blows TOWARD — the reverse of the meteorological
  // "blowing from" convention Open-Meteo reports — to read intuitively.
  const arrowRotation = wind ? (wind.directionDeg + 180) % 360 : 0;

  return (
    <BottomSheet open={open} onClose={onClose}>
      {spot && (
        <div>
          <h1>{spot.name}</h1>
          <p className="card-meta" style={{ marginBottom: 14 }}>
            Wind conditions
          </p>

          {error && <p className="error">Couldn't load wind data.</p>}
          {!error && !wind && <p>Loading...</p>}

          {wind && (
            <div className="wind-detail-card">
              <svg viewBox="0 0 64 64" className="wind-detail-compass">
                <circle cx="32" cy="32" r="27" className="wind-detail-compass-ring" />
                <text x="32" y="10" className="wind-detail-compass-label" textAnchor="middle">
                  N
                </text>
                <text x="57" y="36" className="wind-detail-compass-label" textAnchor="middle">
                  E
                </text>
                <text x="32" y="60" className="wind-detail-compass-label" textAnchor="middle">
                  S
                </text>
                <text x="7" y="36" className="wind-detail-compass-label" textAnchor="middle">
                  W
                </text>
                <g style={{ transform: `rotate(${arrowRotation}deg)`, transformOrigin: "32px 32px" }}>
                  <path d="M32 14 L39 40 L32 34 L25 40 Z" className="wind-detail-compass-arrow" />
                </g>
              </svg>
              <div className="wind-detail-stats">
                <span className="wind-detail-speed">{Math.round(wind.speedMph)} mph</span>
                <span className="wind-detail-meta">
                  from {compassLabel(wind.directionDeg)}
                  {wind.gustMph != null && ` · gusts ${Math.round(wind.gustMph)} mph`}
                </span>
              </div>
            </div>
          )}

          <h2 style={{ marginTop: 20, marginBottom: 8 }}>Recent catches here</h2>
          {spotCatches.length === 0 && <p>No catches logged here yet.</p>}
          {spotCatches.length > 0 && (
            <ul className="catch-list">
              {spotCatches.map((c) => (
                <li key={c.id} className="card">
                  {c.photo_url && (
                    <img className="catch-photo" src={`${API_BASE}${c.photo_url}`} alt={c.species.common_name} />
                  )}
                  <div className="page-header">
                    <span className="card-title">{c.species.common_name}</span>
                    {c.weight != null && <span className="card-stat">{c.weight} lb</span>}
                  </div>
                  <span className="card-meta">
                    {c.display_name} · {new Date(c.caught_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
