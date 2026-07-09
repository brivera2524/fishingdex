import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { CurrentGridRecord } from "../api/types";
import type { fetchBayCurrentField, fetchCurrentField } from "../lib/currentField";

// A small custom canvas particle renderer, replacing an earlier attempt
// built on leaflet-velocity. That library stores each particle's position
// in *screen pixels*, so every pan invalidates all of them — the field-to-
// screen mapping changed, so it has no choice but to throw every particle
// away and re-seed at fresh random positions, which reads as a jarring
// full-canvas reshuffle. Storing particles in lat/lng instead means a pan
// never invalidates anything: their real-world position hasn't changed,
// only where that position currently projects to on screen, so this can
// keep animating continuously through a drag with zero discontinuity —
// nothing to pause, clear, or restart.
//
// Ported from a nullschool-style reference chart built for this data (see
// SD-current-sim's build_chartplotter_data.py / current_chartplotter.html):
// perceptual sqrt color scale, destination-out trail fading, and an
// artistic drift-speed boost (real speeds here are physically too slow —
// 0.02-0.6 m/s — to read as motion at a literal pixel scale).
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
// m/s to on-screen pixels/sec of drift. Best-effort tuning, not visually
// verified against every zoom level; retune if it reads as too fast/slow.
const ARTISTIC_PX_PER_SEC_PER_MPS = 55;
const FADE_ALPHA_PER_SEC = 2.6; // higher = shorter trails

interface Particle {
  lat: number;
  lng: number;
  prevLat: number;
  prevLng: number;
  age: number;
  life: number;
  speed: number;
  hasTrail: boolean;
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
      p.hasTrail = false;
      return;
    }
  }
  // No wet cell found after several tries (e.g. mostly-land viewport) —
  // park it off-grid; it'll retry next time it comes up for respawn.
  p.age = p.life;
  p.hasTrail = false;
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
      prevLat: 0,
      prevLng: 0,
      age: 0,
      life: 1,
      speed: 0,
      hasTrail: false,
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
      const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
      lastT = now;
      if (!grid) return;

      const size = map.getSize();

      // Trail fade: erase this layer's own alpha toward transparent rather
      // than painting a translucent rect toward opaque — the latter
      // compounds every frame and eventually paints solid color over
      // everything, silently hiding the map underneath (a real bug from
      // the reference implementation this was ported from).
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, FADE_ALPHA_PER_SEC * dt)})`;
      ctx.fillRect(0, 0, size.x, size.y);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round";
      ctx.lineWidth = 1.4;

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
        p.speed = speed;

        // Draw the trail segment from where this particle was last frame
        // to its current position — both re-projected live from lat/lng,
        // so this is always correct regardless of pan/zoom that happened
        // since the last frame (nothing to reconcile after a drag).
        if (p.hasTrail) {
          const from = map.latLngToContainerPoint([p.prevLat, p.prevLng]);
          const to = map.latLngToContainerPoint([p.lat, p.lng]);
          const [r, g, b] = speedRGB(speed);
          ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},0.9)`;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        }

        // Advance the particle by projecting to screen space, offsetting
        // by the artistic drift distance, then unprojecting back to
        // lat/lng — this way the drift is a consistent, zoom-independent
        // number of pixels/sec rather than needing manual meters-per-
        // pixel math at the current zoom level.
        const pxPerSec = Math.max(speed * ARTISTIC_PX_PER_SEC_PER_MPS, 0);
        const dragPx = pxPerSec * dt;
        const dirX = u / speed;
        const dirY = -v / speed; // screen y grows downward; v (north) doesn't
        const screenPt = map.latLngToContainerPoint([p.lat, p.lng]);
        const nextPt = L.point(screenPt.x + dirX * dragPx, screenPt.y + dirY * dragPx);
        const nextLatLng = map.containerPointToLatLng(nextPt);

        p.prevLat = p.lat;
        p.prevLng = p.lng;
        p.lat = nextLatLng.lat;
        p.lng = nextLatLng.lng;
        p.hasTrail = true;
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
