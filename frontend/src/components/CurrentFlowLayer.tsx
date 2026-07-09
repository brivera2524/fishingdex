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
import type { fetchBayCurrentField, fetchCurrentField } from "../lib/currentField";

// Ported from a nullschool-style reference chart built for this data (see
// SD-current-sim's build_chartplotter_data.py / current_chartplotter.html).
// Two things that reference got right that the original 5-stop linear ramp
// here didn't:
//
// 1. A perceptual sqrt scale, not linear. Real speeds here are mostly
//    0.02-0.6 m/s — on a linear ramp, anything under ~0.15 m/s reads as
//    uniformly "dead" when it's actually just slow, gentle marina/back-
//    channel flow that still matters for fishing. sqrt spreads the low end
//    out so it stays visually distinguishable, while the main-channel jets
//    still saturate to red.
// 2. Deep-indigo-to-red (8 stops), not a 2-tone blue/red — reads more like
//    a real current chart, less like a generic heatmap.
//
// leaflet-velocity's colorScale is a flat array indexed *linearly* by speed
// (see its indexFor: `round((speed/maxVelocity) * (array.length-1))`), so
// the sqrt curve has to be baked into which color sits at each linear
// index, by evaluating speedRGB() at the actual speed each index
// represents rather than sampling the ramp evenly.
const RAMP: Array<[number, number, number]> = [
  [13, 31, 94],
  [22, 74, 158],
  [21, 150, 201],
  [22, 184, 154],
  [127, 214, 70],
  [244, 209, 58],
  [255, 122, 51],
  [255, 59, 59],
];
// Speed at which the ramp saturates to its hottest color — matches the
// reference's own cap, tuned for this bay/nearshore data (not open-ocean).
const SPEED_CAP_MPS = 0.5;
const MAX_VELOCITY = 1.0; // leaflet-velocity's own clip ceiling; colorScale spans this full range

function speedRGB(metersPerSecond: number): [number, number, number] {
  const t = Math.min(1, Math.sqrt(Math.max(0, metersPerSecond) / SPEED_CAP_MPS)) * (RAMP.length - 1);
  const i0 = Math.floor(t);
  const i1 = Math.min(RAMP.length - 1, i0 + 1);
  const f = t - i0;
  const c0 = RAMP[i0];
  const c1 = RAMP[i1];
  return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
}

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

const COLOR_SCALE = Array.from({ length: 64 }, (_, i) => rgb(speedRGB((i / 63) * MAX_VELOCITY)));

interface CurrentFlowLayerProps {
  // Two sources share this renderer: real HFRadar data for open coastal
  // water, and a tide-model simulation for San Diego Bay's interior, where
  // HFRadar has no usable coverage (see lib/currentField.ts).
  fetcher: typeof fetchCurrentField | typeof fetchBayCurrentField;
}

// Renders nothing itself — it's an imperative Leaflet layer (particles drawn
// to a canvas leaflet-velocity manages internally), added/removed from the
// map directly rather than through react-leaflet's declarative layer model,
// since there's no React wrapper for this plugin.
export default function CurrentFlowLayer({ fetcher }: CurrentFlowLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.VelocityLayer | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Used to tear down and recreate the whole L.velocityLayer (new canvas
    // DOM element, brand new internal Windy state) on every "moveend",
    // because leaflet-velocity's own internal redraw-on-move left stale
    // visual artifacts if trusted to redraw itself in place. That was a
    // real problem at the time, but it's a much bigger hammer than the
    // artifact needed, and it has a much larger cost than it looks like:
    // destroying and rebuilding the entire layer on every pan release also
    // destroys the currently-playing particle animation and its canvas,
    // unconditionally, before anything new exists to replace it -- no
    // internal fix to leaflet-velocity's own restart logic could ever
    // matter while this was happening, since the whole layer (and that
    // logic along with it) got thrown away first.
    //
    // vendor/leaflet-velocity.patched.js now fixes the underlying problems
    // directly instead: the canvas repositions correctly on "moveend"
    // (_onLayerDidMove), a plain pan no longer hard-clears before
    // rebuilding (only a zoom does, since only a zoom actually invalidates
    // the pixel<->geo scale), and critically, the currently-playing
    // animation is no longer stopped before its replacement is ready --
    // the rebuild happens in the background and only cuts over once
    // finished. With all of that in place, creating the layer once and
    // letting leaflet-velocity handle its own view-change restarts is both
    // simpler and strictly better than tearing it down every time.
    fetcher().then((result) => {
      if (cancelled || !result) return;
      const layer = L.velocityLayer({
        displayValues: false,
        data: result,
        minVelocity: 0,
        maxVelocity: MAX_VELOCITY,
        // Real speeds here (0.02-0.6 m/s) are physically too slow to read as
        // motion at a literal scale — the reference chart needed a similarly
        // large artistic boost (260 "cells/sec" of drift per 1 m/s of real
        // speed) to make slow tidal flow look alive at all. 0.03 (this
        // layer's old value) is only ~6x leaflet-velocity's own wind-tuned
        // default (0.005), which is still built around wind speeds 10-50x
        // faster than ours. Still a best-effort tuning, not visually
        // verified live — retune if it reads as too fast/frenetic or still
        // too static once seen in motion.
        velocityScale: 0.09,
        colorScale: COLOR_SCALE,
        opacity: 0.96,
        // Longer-lived, denser particles for the silkier, more continuous
        // streaklines the reference chart has, vs. leaflet-velocity's
        // sparser wind-tuned defaults (particleAge 90, particleMultiplier
        // 1/300).
        particleAge: 140,
        particleMultiplier: 1 / 140,
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
