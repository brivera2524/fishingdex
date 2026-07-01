import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Vite bundles Leaflet's default marker image paths incorrectly out of the
// box. Importing this module (for its side effect) fixes it once for any
// page that renders a Leaflet map.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export const SAN_DIEGO: [number, number] = [32.7157, -117.1611];
