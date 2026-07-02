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
    const weighted: L.HeatLatLngTuple[] = points.map(([lat, lng]) => [lat, lng, 1]);
    // leaflet.heat ramps point intensity up to full strength at `maxZoom`
    // and fades it out below that — that's what made the heatmap look like
    // it was changing size/strength as you zoomed. Pinning maxZoom to a low
    // value the map is basically always at or past means it's already at
    // full intensity across the whole realistic zoom range, so it reads as
    // one consistent overlay instead of visibly growing as you zoom in.
    const heat = L.heatLayer(weighted, { radius: 22, blur: 18, maxZoom: 8 }).addTo(map);
    return () => {
      map.removeLayer(heat);
    };
  }, [points, map]);
  return null;
}
