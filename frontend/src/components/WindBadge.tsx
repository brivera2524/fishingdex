import { useEffect, useState } from "react";
import { Marker } from "react-leaflet";
import L from "leaflet";
import type { Spot } from "../api/types";
import { cachedFetch } from "../lib/ttlCache";

export interface WindState {
  speedMph: number;
  gustMph: number | null;
  /** Meteorological convention — the direction the wind is blowing FROM. */
  directionDeg: number;
}

// Leaflet.markercluster's iconCreateFunction only gets the raw child Marker
// instances (via cluster.getAllChildMarkers()), not our React props/state —
// stashing each marker's latest wind reading directly on the instance is how
// createWindClusterIcon (leafletSetup.ts) can average them for the cluster
// bubble's icon.
export type WindMarker = L.Marker & { windData?: WindState | null };

// Wind moves faster than tide but Open-Meteo's underlying model doesn't
// update every second either — this keeps the badge and its detail sheet
// (and repeated re-renders/re-mounts in between) from all re-hitting the
// network for the same spot within the same 15-minute window.
const WIND_TTL_MS = 15 * 60 * 1000;
// How often a mounted badge re-checks for fresh data. Most of these calls
// resolve instantly from the TTL cache above without hitting the network at
// all — this just makes sure the *displayed* value doesn't stay frozen at
// whatever it was the moment the map was opened if the tab sits open a while.
const WIND_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
// Used instead of the normal cadence right after a failed/empty fetch (e.g.
// a transient Open-Meteo outage) — waiting the full 5 minutes to try again
// would make a brief blip look stuck far longer than it actually is.
const WIND_RETRY_INTERVAL_MS = 30 * 1000;

// Open-Meteo: free, no API key, permissive CORS — same direct-from-browser
// pattern already used for NOAA tide data in TideBadge/TideDetailSheet.
export function fetchWind(lat: number, lng: number): Promise<WindState | null> {
  const key = `wind:${lat.toFixed(4)},${lng.toFixed(4)}`;
  return cachedFetch(key, WIND_TTL_MS, async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=mph`;
    const res = await fetch(url);
    const data: {
      current?: { wind_speed_10m?: number; wind_direction_10m?: number; wind_gusts_10m?: number };
    } = await res.json();
    const current = data.current;
    if (!current || current.wind_speed_10m == null || current.wind_direction_10m == null) return null;
    return {
      speedMph: current.wind_speed_10m,
      gustMph: current.wind_gusts_10m ?? null,
      directionDeg: current.wind_direction_10m,
    };
  });
}

// Only the admin can set a spot's name (see require_admin in spots.py), so
// this isn't reachable by a random signed-up user — but escaping it before
// splicing into raw HTML is cheap insurance against a compromised admin
// account (or a future spot-naming feature opened up to more users) turning
// into a stored-XSS vector via this divIcon.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Rotating a divIcon's raw HTML by hand (like createClusterIcon in
// leafletSetup.ts rebuilds its label from live data) since Leaflet markers
// don't support arbitrary React children — the icon is just regenerated
// whenever `wind` (or the zoom-gated label) changes.
function buildWindIcon(wind: WindState | null, name: string, showLabel: boolean): L.DivIcon {
  // Arrow points where the wind is blowing TOWARD (more intuitive at a
  // glance than "from"), i.e. the meteorological direction + 180.
  const rotation = wind ? (wind.directionDeg + 180) % 360 : 0;
  const speedLabel = wind ? Math.round(wind.speedMph) : "–";
  const safeName = escapeHtml(name);
  return L.divIcon({
    className: "wind-badge-icon",
    html: `
      <div class="wind-badge-wrap">
        <div class="wind-badge-dot">
          <svg viewBox="0 0 32 32" class="wind-badge-arrow" style="transform: rotate(${rotation}deg)">
            <path d="M16 4 L22 20 L16 16 L10 20 Z" />
          </svg>
          <span class="wind-badge-speed">${speedLabel}<span class="wind-badge-unit">mph</span></span>
        </div>
        ${showLabel ? `<span class="wind-badge-name">${safeName}</span>` : ""}
      </div>
    `,
    iconSize: [40, showLabel ? 60 : 40],
    iconAnchor: [20, 20],
  });
}

interface WindBadgeProps {
  spot: Spot;
  showLabel: boolean;
  onSelect: (spot: Spot) => void;
  /** Called once this spot's wind data (re)loads, so the cluster group can
   * recompute its aggregate icon — Leaflet.markercluster doesn't do this on
   * its own just because a child marker's icon changed underneath it. */
  onWindLoaded?: () => void;
  /** Gives the parent page access to the underlying marker instance, so it
   * can ask the cluster group whether this spot is currently standalone
   * (via getVisibleParent) to decide whether to show its name label. */
  markerRef?: (instance: L.Marker | null) => void;
}

// Only the Marker itself lives inside MapContainer — its detail sheet is
// rendered by the parent page, outside the map. A BottomSheet nested inside
// MapContainer would sit inside .map-container's own stacking context (it's
// given z-index:0 specifically to contain Leaflet's internal panes, which
// otherwise render above page chrome), trapping the sheet behind the map
// instead of over it.
export default function WindBadge({ spot, showLabel, onSelect, onWindLoaded, markerRef }: WindBadgeProps) {
  const [wind, setWind] = useState<WindState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function scheduleNext(delayMs: number) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(refresh, delayMs);
    }

    // A self-rescheduling timeout (rather than a fixed setInterval) so a
    // failed/empty fetch can retry sooner than a healthy one — otherwise a
    // transient outage looks stuck for the full refresh interval even
    // though we're perfectly able to try again much sooner.
    function refresh() {
      fetchWind(spot.centroid_lat, spot.centroid_lng)
        .then((w) => {
          if (cancelled) return;
          setWind(w);
          onWindLoaded?.();
          scheduleNext(w == null ? WIND_RETRY_INTERVAL_MS : WIND_REFRESH_INTERVAL_MS);
        })
        .catch(() => {
          /* Open-Meteo unreachable — badge just shows a dash for speed. */
          if (!cancelled) scheduleNext(WIND_RETRY_INTERVAL_MS);
        });
    }
    refresh();
    // A plain interval alone can leave a long-backgrounded tab showing
    // whatever was current when it was last foregrounded, since throttled
    // background timers can fall well behind — refreshing the moment the
    // tab becomes visible again closes that gap immediately instead of
    // waiting for the next tick.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot.centroid_lat, spot.centroid_lng]);

  return (
    <Marker
      position={[spot.centroid_lat, spot.centroid_lng]}
      icon={buildWindIcon(wind, spot.name, showLabel)}
      eventHandlers={{ click: () => onSelect(spot) }}
      ref={(instance) => {
        if (instance) (instance as WindMarker).windData = wind;
        markerRef?.(instance);
      }}
    />
  );
}
