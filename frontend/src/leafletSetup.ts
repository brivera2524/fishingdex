/// <reference types="leaflet.markercluster" />
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

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

export function createClusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 32 : count < 100 ? 38 : 44;
  return L.divIcon({
    className: "catch-cluster-icon",
    html: `<span>${count}</span>`,
    iconSize: L.point(size, size, true),
  });
}
