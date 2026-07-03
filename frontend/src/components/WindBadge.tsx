import { useEffect, useState } from "react";
import { Marker } from "react-leaflet";
import L from "leaflet";
import type { Spot } from "../api/types";

export interface WindState {
  speedMph: number;
  gustMph: number | null;
  /** Meteorological convention — the direction the wind is blowing FROM. */
  directionDeg: number;
}

// Open-Meteo: free, no API key, permissive CORS — same direct-from-browser
// pattern already used for NOAA tide data in TideBadge/TideDetailSheet.
export async function fetchWind(lat: number, lng: number): Promise<WindState | null> {
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
}

// Rotating a divIcon's raw HTML by hand (like createClusterIcon in
// leafletSetup.ts rebuilds its label from live data) since Leaflet markers
// don't support arbitrary React children — the icon is just regenerated
// whenever `wind` changes.
function buildWindIcon(wind: WindState | null): L.DivIcon {
  // Arrow points where the wind is blowing TOWARD (more intuitive at a
  // glance than "from"), i.e. the meteorological direction + 180.
  const rotation = wind ? (wind.directionDeg + 180) % 360 : 0;
  const speedLabel = wind ? Math.round(wind.speedMph) : "–";
  return L.divIcon({
    className: "wind-badge-icon",
    html: `
      <div class="wind-badge-dot">
        <svg viewBox="0 0 32 32" class="wind-badge-arrow" style="transform: rotate(${rotation}deg)">
          <path d="M16 4 L22 20 L16 16 L10 20 Z" />
        </svg>
        <span class="wind-badge-speed">${speedLabel}<span class="wind-badge-unit">mph</span></span>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

interface WindBadgeProps {
  spot: Spot;
  onSelect: (spot: Spot) => void;
}

// Only the Marker itself lives inside MapContainer — its detail sheet is
// rendered by the parent page, outside the map. A BottomSheet nested inside
// MapContainer would sit inside .map-container's own stacking context (it's
// given z-index:0 specifically to contain Leaflet's internal panes, which
// otherwise render above page chrome), trapping the sheet behind the map
// instead of over it.
export default function WindBadge({ spot, onSelect }: WindBadgeProps) {
  const [wind, setWind] = useState<WindState | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWind(spot.centroid_lat, spot.centroid_lng)
      .then((w) => {
        if (!cancelled) setWind(w);
      })
      .catch(() => {
        /* Open-Meteo unreachable — badge just shows a dash for speed. */
      });
    return () => {
      cancelled = true;
    };
  }, [spot.centroid_lat, spot.centroid_lng]);

  return (
    <Marker
      position={[spot.centroid_lat, spot.centroid_lng]}
      icon={buildWindIcon(wind)}
      eventHandlers={{ click: () => onSelect(spot) }}
    />
  );
}
