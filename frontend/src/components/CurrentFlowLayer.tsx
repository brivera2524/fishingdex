import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

// leaflet-velocity predates UMD/ESM plugin conventions — it references a
// bare global `L` throughout instead of requiring/importing it, so it needs
// window.L set to our actual bundled Leaflet instance before its module
// body runs, or every `L.something` reference inside it throws instantly.
(window as unknown as { L: typeof L }).L = L;
// eslint-disable-next-line import/no-unassigned-import
import "leaflet-velocity";
import "leaflet-velocity/dist/leaflet-velocity.css";
import { fetchCurrentField } from "../lib/currentField";

// The same calm-to-strong gradient conceptually, expanded into a smooth
// array of samples — leaflet-velocity's colorScale wants a flat list of
// colors spread evenly across [0, MAX_VELOCITY], not named stops.
const COLOR_STOPS: Array<[number, [number, number, number]]> = [
  [0, [56, 189, 248]], // calm — light blue
  [0.5, [45, 212, 191]], // light — teal
  [1.2, [250, 204, 21]], // moderate — yellow
  [2.2, [251, 146, 60]], // strong — orange
  [3.5, [248, 113, 113]], // very strong — red
];
const MAX_VELOCITY = 3.5;

function colorAt(mph: number): string {
  const stops = COLOR_STOPS;
  if (mph <= stops[0][0]) return rgb(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    const [hi, hiRgb] = stops[i];
    if (mph <= hi) {
      const [lo, loRgb] = stops[i - 1];
      const t = (mph - lo) / (hi - lo);
      return rgb(loRgb.map((c, j) => Math.round(c + (hiRgb[j] - c) * t)) as [number, number, number]);
    }
  }
  return rgb(stops[stops.length - 1][1]);
}

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

const COLOR_SCALE = Array.from({ length: 32 }, (_, i) => colorAt((i / 31) * MAX_VELOCITY));

// Renders nothing itself — it's an imperative Leaflet layer (particles drawn
// to a canvas leaflet-velocity manages internally), added/removed from the
// map directly rather than through react-leaflet's declarative layer model,
// since there's no React wrapper for this plugin.
export default function CurrentFlowLayer() {
  const map = useMap();
  const layerRef = useRef<L.VelocityLayer | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCurrentField().then((data) => {
      if (cancelled || !data) return;
      const layer = L.velocityLayer({
        displayValues: false,
        data,
        minVelocity: 0,
        maxVelocity: MAX_VELOCITY,
        velocityScale: 0.01,
        colorScale: COLOR_SCALE,
        opacity: 0.95,
      });
      layer.addTo(map);
      layerRef.current = layer;
    });

    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}
