/// <reference types="leaflet.heat" />
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

interface HeatmapLayerProps {
  points: [number, number][];
}

export default function HeatmapLayer({ points }: HeatmapLayerProps) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    // Each point contributes a fraction of the max intensity rather than
    // the full 1.0 — otherwise a single lone catch already renders at full
    // strength (red), so "hot" stopped meaning anything. At 0.2, it takes
    // about 5 catches overlapping within the blur radius to reach red;
    // a single catch shows as a soft blue/cyan glow instead.
    const weighted: L.HeatLatLngTuple[] = points.map(([lat, lng]) => [lat, lng, 0.2]);
    // leaflet.heat ramps point intensity up to full strength at `maxZoom`
    // and fades it out below that — that's what made the heatmap look like
    // it was changing size/strength as you zoomed. Pinning maxZoom to a low
    // value the map is basically always at or past means it's already at
    // full intensity across the whole realistic zoom range, so it reads as
    // one consistent overlay instead of visibly growing as you zoom in.
    const heat = L.heatLayer(weighted, { radius: 22, blur: 18, maxZoom: 8, minOpacity: 0.25 }).addTo(map);
    // The plugin only recomputes/redraws its canvas on `moveend`, not
    // continuously during a drag, so without this it visually freezes in
    // place until you lift your finger and then snaps to the right spot —
    // forcing a redraw on every `move` tick keeps it tracking the pan live,
    // same as everything else on the map.
    function handleMove() {
      heat.redraw();
    }
    map.on("move", handleMove);
    return () => {
      map.off("move", handleMove);
      map.removeLayer(heat);
    };
  }, [points, map]);
  return null;
}
