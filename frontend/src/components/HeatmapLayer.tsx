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
    const heat = L.heatLayer(weighted, { radius: 22, blur: 18, maxZoom: 16 }).addTo(map);
    return () => {
      map.removeLayer(heat);
    };
  }, [points, map]);
  return null;
}
