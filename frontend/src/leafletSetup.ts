/// <reference types="leaflet.markercluster" />
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { WindMarker } from "./components/WindBadge";

// Vite bundles Leaflet's default marker image paths incorrectly out of the
// box. Importing this module (for its side effect) fixes it once for any
// page that renders a Leaflet map. Kept as a fallback for any marker that
// doesn't get catchMarkerIcon below, so it never falls back to a broken image.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export const SAN_DIEGO: [number, number] = [32.7157, -117.1611];

// Shared across every Leaflet map in the app (main map, location picker,
// species detail mini-map) so they all render the same dark style instead
// of some being left on whatever provider/style predates a future change.
export const STADIA_API_KEY = import.meta.env.VITE_STADIA_API_KEY ?? "";
export const STADIA_TILE_URL = `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${STADIA_API_KEY}`;

// A plain solid dot in the app's accent color, used for every catch marker
// instead of Leaflet's default blue teardrop pin — so a single catch and a
// cluster of catches (see createClusterIcon) read as the same visual family
// instead of two unrelated marker styles.
export const catchMarkerIcon = L.divIcon({
  className: "catch-marker-icon",
  html: '<span class="catch-marker-dot"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -9],
});

// A small pulsing dot for "you are here" — deliberately a different color
// from catchMarkerIcon's accent teal so it never reads as an actual catch.
export const currentLocationIcon = L.divIcon({
  className: "current-location-icon",
  html: '<span class="current-location-pulse"></span><span class="current-location-dot"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export function createClusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 32 : count < 100 ? 38 : 44;
  return L.divIcon({
    className: "catch-cluster-icon",
    html: `<span>${count}</span>`,
    iconSize: L.point(size, size, true),
  });
}

// A distinct color from createClusterIcon (catch pins) so a cluster of wind
// badges doesn't read as "more catches" when both layers are visible at once.
//
// Rather than collapsing to a bare count, this averages the clustered spots'
// wind readings so zooming out still gives a rough, mostly-accurate sense of
// conditions instead of nothing at all. Direction can't just be averaged as
// plain degrees (350° and 10° should average to 0°, not 180°) — each reading
// is treated as a vector and the vectors are summed, weighted by speed so a
// stronger reading has more say in the resulting direction than a light one.
export function createWindClusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 38 : count < 100 ? 44 : 50;

  let sumX = 0;
  let sumY = 0;
  let sumSpeed = 0;
  let readings = 0;
  for (const child of cluster.getAllChildMarkers()) {
    const wind = (child as WindMarker).windData;
    if (!wind) continue;
    const rad = (wind.directionDeg * Math.PI) / 180;
    sumX += wind.speedMph * Math.sin(rad);
    sumY += wind.speedMph * Math.cos(rad);
    sumSpeed += wind.speedMph;
    readings++;
  }

  let inner: string;
  if (readings === 0) {
    // Children haven't loaded their wind data yet — fall back to a plain count.
    inner = `<span class="wind-cluster-fallback">💨 ${count}</span>`;
  } else {
    const avgSpeed = sumSpeed / readings;
    const avgDirectionDeg = ((Math.atan2(sumX, sumY) * 180) / Math.PI + 360) % 360;
    const rotation = (avgDirectionDeg + 180) % 360;
    inner = `
      <svg viewBox="0 0 32 32" class="wind-cluster-arrow" style="transform: rotate(${rotation}deg)">
        <path d="M16 4 L22 20 L16 16 L10 20 Z" />
      </svg>
      <span class="wind-cluster-speed">${Math.round(avgSpeed)}<span class="wind-cluster-unit">mph</span></span>
      <span class="wind-cluster-count">${count}</span>
    `;
  }

  return L.divIcon({
    className: "wind-cluster-icon",
    html: `<div class="wind-cluster-dot">${inner}</div>`,
    iconSize: L.point(size, size, true),
  });
}
