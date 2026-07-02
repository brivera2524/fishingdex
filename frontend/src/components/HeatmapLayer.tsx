import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import simpleheat from "simpleheat";

interface HeatmapLayerProps {
  points: [number, number][];
}

const MILE_IN_METERS = 1609.34;
const HEAT_RADIUS_METERS = 0.1 * MILE_IN_METERS;
const CANVAS_LONG_SIDE = 1600;
const BOUNDS_PADDING_RATIO = 0.2;
const MIN_SPAN_DEG = 0.01; // ~1km, so a single catch (or several stacked at
// the same spot) still gets a sensible-sized canvas instead of a zero-area one.

// Baked once onto an offscreen canvas and placed as a plain image overlay
// anchored to fixed lat/lng bounds, instead of leaflet.heat's approach of
// redrawing a canvas continuously to track the map. An image overlay is
// positioned and scaled by Leaflet's normal (smooth, native) layer
// machinery — the same way a static photo pinned to the map would be — so
// panning/zooming just moves and scales the already-computed picture rather
// than recomputing anything, and the heat radius is baked in at a real-world
// 0.5 mile since the canvas's own aspect ratio matches the bounds' real
// aspect ratio. This only needs to redraw when the underlying catch points
// change, not on every pan/zoom tick.
export default function HeatmapLayer({ points }: HeatmapLayerProps) {
  const map = useMap();
  const overlayRef = useRef<L.ImageOverlay | null>(null);

  useEffect(() => {
    if (overlayRef.current) {
      map.removeLayer(overlayRef.current);
      overlayRef.current = null;
    }
    if (points.length === 0) return;

    let bounds = L.latLngBounds(points);
    if (bounds.getNorth() - bounds.getSouth() < MIN_SPAN_DEG || bounds.getEast() - bounds.getWest() < MIN_SPAN_DEG) {
      const center = bounds.getCenter();
      bounds = L.latLngBounds(
        [center.lat - MIN_SPAN_DEG / 2, center.lng - MIN_SPAN_DEG / 2],
        [center.lat + MIN_SPAN_DEG / 2, center.lng + MIN_SPAN_DEG / 2]
      );
    }
    bounds = bounds.pad(BOUNDS_PADDING_RATIO);

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const avgLat = (sw.lat + ne.lat) / 2;
    const latSpanMeters = (ne.lat - sw.lat) * 111320;
    const lngSpanMeters = (ne.lng - sw.lng) * 111320 * Math.cos((avgLat * Math.PI) / 180);

    const wider = lngSpanMeters >= latSpanMeters;
    const canvasWidth = wider ? CANVAS_LONG_SIDE : Math.round(CANVAS_LONG_SIDE * (lngSpanMeters / latSpanMeters));
    const canvasHeight = wider ? Math.round(CANVAS_LONG_SIDE * (latSpanMeters / lngSpanMeters)) : CANVAS_LONG_SIDE;

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Canvas aspect ratio matches the bounds' real-world meter aspect ratio
    // (via the cos(lat) adjustment above), so this scale is the same along
    // both axes — the blobs come out circular, not elliptical.
    const metersPerPixel = lngSpanMeters / canvasWidth;
    const radiusPx = HEAT_RADIUS_METERS / metersPerPixel;

    const heat = simpleheat(canvas);
    heat.radius(radiusPx, radiusPx * 0.6);
    heat.data(
      points.map(([lat, lng]) => {
        const x = ((lng - sw.lng) / (ne.lng - sw.lng)) * canvasWidth;
        // Canvas y grows downward; latitude grows northward — flip it.
        const y = ((ne.lat - lat) / (ne.lat - sw.lat)) * canvasHeight;
        // Each point contributes a fraction of the max (default 1) rather
        // than the full weight, so a single lone catch reads as a soft
        // blue/cyan glow instead of already being "hot" (red) on its own —
        // it takes roughly 5 overlapping catches to reach full intensity.
        return [x, y, 0.2] as [number, number, number];
      })
    );
    heat.draw(0.25);

    const overlay = L.imageOverlay(canvas.toDataURL(), bounds, { opacity: 0.85, interactive: false }).addTo(map);
    overlayRef.current = overlay;

    return () => {
      map.removeLayer(overlay);
      if (overlayRef.current === overlay) overlayRef.current = null;
    };
  }, [points, map]);

  return null;
}
