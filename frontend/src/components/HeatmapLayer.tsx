/// <reference types="leaflet.heat" />
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

interface HeatmapLayerProps {
  points: [number, number][];
}

const MILE_IN_METERS = 1609.34;
const HEAT_RADIUS_METERS = 0.5 * MILE_IN_METERS;

// leaflet.heat's radius/blur are in screen pixels, which stay a fixed size
// on screen but represent a shrinking real-world area as you zoom in — a
// "hot" zone from several nearby catches would visually collapse down to
// nothing once you zoomed in enough to tell which catches made it up.
// Converting a fixed real-world radius (0.5 mile) to pixels at the current
// zoom/latitude keeps the zone representing the same ground distance no
// matter how far in or out you are.
function metersPerPixel(latitudeDeg: number, zoom: number) {
  return (156543.03392 * Math.cos((latitudeDeg * Math.PI) / 180)) / 2 ** zoom;
}

function radiusPxFor(map: L.Map) {
  const { lat } = map.getCenter();
  return HEAT_RADIUS_METERS / metersPerPixel(lat, map.getZoom());
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
    const initialRadius = radiusPxFor(map);
    // leaflet.heat also ramps point intensity up to full strength at
    // `maxZoom` and fades it below that. Pinning it low means the map is
    // basically always at or past it, so intensity is already at full
    // strength across the whole realistic zoom range instead of visibly
    // ramping as you zoom in.
    const heat = L.heatLayer(weighted, {
      radius: initialRadius,
      blur: initialRadius * 0.6,
      maxZoom: 8,
      minOpacity: 0.25,
    }).addTo(map);

    function updateRadius() {
      const r = radiusPxFor(map);
      heat.setOptions({ radius: r, blur: r * 0.6 });
    }
    // The plugin only recomputes/redraws its canvas on `moveend` by
    // default, not continuously during a drag, so without this it visually
    // freezes in place until you lift your finger and then snaps to the
    // right spot. Redrawing on every `move`/`zoom` tick keeps both the
    // position and the real-world-sized radius tracking live.
    function handleMove() {
      updateRadius();
      heat.redraw();
    }
    map.on("move zoom", handleMove);
    return () => {
      map.off("move zoom", handleMove);
      map.removeLayer(heat);
    };
  }, [points, map]);
  return null;
}
