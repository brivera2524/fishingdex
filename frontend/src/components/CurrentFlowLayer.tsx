import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { CurrentGridRecord } from "../api/types";
import type { fetchBayCurrentField, fetchCurrentField } from "../lib/currentField";

// A small custom canvas particle renderer (this app's second attempt — see
// git history for the first: it stored a trail by compositing translucent
// strokes into the canvas bitmap across frames via destination-out fading.
// That looked fine sitting still, but broke badly while dragging: gray
// residue built up everywhere particles had passed (8-bit alpha rounding
// means a "remove N% of remaining alpha" erase can't fully clear a very
// faint pixel — it asymptotes to a stuck, never-quite-zero haze), and
// during a drag the composited old pixels represented a stale pan state
// while newly drawn strokes reflected the live one, so a fast drag read as
// streaks smeared across the whole gesture, land included.
//
// This version never composites anything across frames: every frame does
// a hard clearRect, then redraws each particle's entire recent trail from
// scratch by reprojecting its stored (lat, lng) history through the map's
// *current* transform. There is nothing left over from a previous frame to
// go stale, so there's nothing for a drag to desynchronize — the canvas is
// a pure function of (current particle data, current map transform) every
// single frame, including mid-gesture, since Leaflet updates its pane
// position live as the drag happens (map.latLngToContainerPoint reads that
// live position, not a value cached at dragend).
//
// Storing position in lat/lng rather than screen pixels (leaflet-velocity's
// approach) is what makes a pan/zoom a non-event in the first place: the
// particle's real-world position hasn't changed, only where it currently
// projects to on screen, so nothing needs to pause, clear, or reseed when
// the view moves.
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
const SPEED_CAP_MPS = 0.5; // speed at which the ramp saturates to its hottest color

function speedRGB(metersPerSecond: number): [number, number, number] {
  const t = Math.min(1, Math.sqrt(Math.max(0, metersPerSecond) / SPEED_CAP_MPS)) * (RAMP.length - 1);
  const i0 = Math.floor(t);
  const i1 = Math.min(RAMP.length - 1, i0 + 1);
  const f = t - i0;
  const c0 = RAMP[i0];
  const c1 = RAMP[i1];
  return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
}

const N_PARTICLES = 900;
const PARTICLE_LIFE_MIN = 60; // frames
const PARTICLE_LIFE_MAX = 140;
// Real speeds are too slow to see move at a literal 1:1 scale — this maps
// m/s to on-screen pixels/sec of drift. Tuned so the typical bay speed
// (~0.09 m/s) reads as a comfortable ~20 px/sec creep, and the rare fast
// entrance-jet cells (~0.6+ m/s) read as noticeably faster without being
// frantic.
const ARTISTIC_PX_PER_SEC_PER_MPS = 220;
// How much wall-clock time of recent positions each particle's trail spans
// — *not* a frame count, so trail length on screen (at a given speed) is
// the same regardless of the device's actual frame rate. Long enough that
// typical-speed cells read as a flowing streak rather than a fading dot.
const TRAIL_DURATION_MS = 900;
const TRAIL_MAX_POINTS = 24; // safety cap on array/path size at very high frame rates

interface HistoryPoint {
  lat: number;
  lng: number;
  t: number;
}

interface Particle {
  lat: number;
  lng: number;
  age: number;
  life: number;
  history: HistoryPoint[];
}

class CurrentGrid {
  private readonly header: CurrentGridRecord["header"];
  private readonly u: Array<number | null>;
  private readonly v: Array<number | null>;

  constructor(records: CurrentGridRecord[]) {
    const uRecord = records.find((r) => r.header.parameterNumber === 2);
    const vRecord = records.find((r) => r.header.parameterNumber === 3);
    if (!uRecord || !vRecord) throw new Error("Current grid is missing a u or v record");
    this.header = uRecord.header;
    this.u = uRecord.data;
    this.v = vRecord.data;
  }

  get bounds() {
    const h = this.header;
    return { lo1: h.lo1, la1: h.la1, lo2: h.lo2, la2: h.la2 };
  }

  /** Bilinear-sampled (u, v) in m/s at a lat/lng, or null over land/no-data/out-of-bounds. */
  sample(lat: number, lng: number): [number, number] | null {
    const h = this.header;
    const col = (lng - h.lo1) / h.dx;
    const row = (h.la1 - lat) / h.dy;
    if (col < 0 || row < 0 || col > h.nx - 1 || row > h.ny - 1) return null;

    const c0 = Math.floor(col);
    const r0 = Math.floor(row);
    const c1 = Math.min(c0 + 1, h.nx - 1);
    const r1 = Math.min(r0 + 1, h.ny - 1);
    const fc = col - c0;
    const fr = row - r0;

    const i00 = r0 * h.nx + c0;
    const i10 = r0 * h.nx + c1;
    const i01 = r1 * h.nx + c0;
    const i11 = r1 * h.nx + c1;

    const u00 = this.u[i00];
    const u10 = this.u[i10];
    const u01 = this.u[i01];
    const u11 = this.u[i11];
    const v00 = this.v[i00];
    const v10 = this.v[i10];
    const v01 = this.v[i01];
    const v11 = this.v[i11];

    const w00 = u00 != null ? 1 : 0;
    const w10 = u10 != null ? 1 : 0;
    const w01 = u01 != null ? 1 : 0;
    const w11 = u11 != null ? 1 : 0;
    const weightSum =
      w00 * (1 - fr) * (1 - fc) + w10 * (1 - fr) * fc + w01 * fr * (1 - fc) + w11 * fr * fc;
    if (weightSum === 0) return null;

    const u =
      ((u00 ?? 0) * w00 * (1 - fr) * (1 - fc) +
        (u10 ?? 0) * w10 * (1 - fr) * fc +
        (u01 ?? 0) * w01 * fr * (1 - fc) +
        (u11 ?? 0) * w11 * fr * fc) /
      weightSum;
    const v =
      ((v00 ?? 0) * w00 * (1 - fr) * (1 - fc) +
        (v10 ?? 0) * w10 * (1 - fr) * fc +
        (v01 ?? 0) * w01 * fr * (1 - fc) +
        (v11 ?? 0) * w11 * fr * fc) /
      weightSum;
    return [u, v];
  }
}

function seedParticle(p: Particle, grid: CurrentGrid) {
  const { lo1, la1, lo2, la2 } = grid.bounds;
  for (let tries = 0; tries < 30; tries++) {
    const lat = la2 + Math.random() * (la1 - la2);
    const lng = lo1 + Math.random() * (lo2 - lo1);
    if (grid.sample(lat, lng)) {
      p.lat = lat;
      p.lng = lng;
      p.age = 0;
      p.life = PARTICLE_LIFE_MIN + Math.random() * (PARTICLE_LIFE_MAX - PARTICLE_LIFE_MIN);
      p.history = [];
      return;
    }
  }
  // No wet cell found after several tries (e.g. mostly-land viewport) —
  // park it off-grid; it'll retry next time it comes up for respawn.
  p.age = p.life;
  p.history = [];
}

interface CurrentFlowLayerProps {
  // Two sources share this renderer: real HFRadar data for open coastal
  // water, and a tide-model simulation for San Diego Bay's interior, where
  // HFRadar has no usable coverage (see lib/currentField.ts).
  fetcher: typeof fetchCurrentField | typeof fetchBayCurrentField;
}

export default function CurrentFlowLayer({ fetcher }: CurrentFlowLayerProps) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    let lastT = performance.now();
    let grid: CurrentGrid | null = null;
    const particles: Particle[] = Array.from({ length: N_PARTICLES }, () => ({
      lat: 0,
      lng: 0,
      age: 0,
      life: 1,
      history: [],
    }));

    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "450"; // above tiles/vector overlays, below markers/controls
    map.getContainer().appendChild(canvas);
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d")!;

    function resize() {
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = size.x * dpr;
      canvas.height = size.y * dpr;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    map.on("resize", resize);

    function tick(now: number) {
      rafId = requestAnimationFrame(tick);
      // Clamped tight so a single stalled/dropped frame (e.g. from heavy
      // main-thread work during a drag gesture) can't produce one
      // disproportionately large jump for every particle at once.
      const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
      lastT = now;
      if (!grid) return;

      const size = map.getSize();
      // Hard clear, not a translucent fade — every frame is drawn entirely
      // from this frame's particle data and this frame's map transform,
      // so there is never stale composited content left over to go out of
      // sync with a pan/zoom that happened since the last frame.
      ctx.clearRect(0, 0, size.x, size.y);
      ctx.lineCap = "round";
      ctx.lineWidth = 1.6;

      for (const p of particles) {
        p.age += 1;
        if (p.age > p.life) {
          seedParticle(p, grid);
          continue;
        }

        const uv = grid.sample(p.lat, p.lng);
        if (!uv) {
          seedParticle(p, grid);
          continue;
        }
        const [u, v] = uv;
        const speed = Math.hypot(u, v);

        p.history.push({ lat: p.lat, lng: p.lng, t: now });
        while (p.history.length > 1 && now - p.history[0].t > TRAIL_DURATION_MS) p.history.shift();
        if (p.history.length > TRAIL_MAX_POINTS) p.history.splice(0, p.history.length - TRAIL_MAX_POINTS);

        if (p.history.length >= 2) {
          const points = p.history.map((h) => map.latLngToContainerPoint([h.lat, h.lng]));
          const first = points[0];
          const last = points[points.length - 1];
          const [r, g, b] = speedRGB(speed);
          const gradient = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
          gradient.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},0)`);
          gradient.addColorStop(1, `rgba(${r | 0},${g | 0},${b | 0},0.9)`);
          ctx.strokeStyle = gradient;
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
          ctx.stroke();
        }

        // A cell with a truly exact-zero vector (rare, but real at slack
        // tide) has no direction to move in — u/speed would be 0/0 = NaN,
        // silently corrupting this particle's position forever after
        // (NaN comparisons are always false, so it would never fail the
        // bounds/land check in sample() and never get caught for re-seed).
        // Leave it in place for this frame instead.
        if (speed > 0) {
          // Advance by projecting to screen space, offsetting by the
          // artistic drift distance, then unprojecting back to lat/lng —
          // this way the drift is a consistent, zoom-independent number of
          // pixels/sec rather than needing manual meters-per-pixel math at
          // the current zoom level.
          const dragPx = speed * ARTISTIC_PX_PER_SEC_PER_MPS * dt;
          const dirX = u / speed;
          const dirY = -v / speed; // screen y grows downward; v (north) doesn't
          const screenPt = map.latLngToContainerPoint([p.lat, p.lng]);
          const nextPt = L.point(screenPt.x + dirX * dragPx, screenPt.y + dirY * dragPx);
          const nextLatLng = map.containerPointToLatLng(nextPt);
          p.lat = nextLatLng.lat;
          p.lng = nextLatLng.lng;
        }
      }
    }

    fetcher().then((records) => {
      if (cancelled || !records) return;
      grid = new CurrentGrid(records);
      for (const p of particles) seedParticle(p, grid);
    });

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      map.off("resize", resize);
      canvas.remove();
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}
