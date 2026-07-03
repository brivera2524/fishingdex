import { useEffect, useState } from "react";
import TideDetailSheet from "./TideDetailSheet";
import { cachedFetch } from "../lib/ttlCache";

// NOAA CO-OPS station 9410170 — San Diego, CA. Public API, no key required,
// and it allows cross-origin requests, so this is called directly from the
// browser rather than proxied through our backend.
const STATION_ID = "9410170";
const NOAA_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

const RING_RADIUS = 18;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// The hi/lo event window is the only thing actually fetched from NOAA, and
// barely changes minute to minute (the next event's time is static for
// hours) — it's refreshed on this cadence (or immediately if the tab was
// backgrounded past it), and most of those calls resolve instantly from the
// TTL cache below without a real network request at all.
const HILO_TTL_MS = 15 * 60 * 1000;
const HILO_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
// Separate from the above: how often the *displayed* height/percent is
// recomputed against the current time. This never touches the network — it
// just re-runs the interpolation below against whichever events are already
// cached, so the badge keeps advancing smoothly between the infrequent real
// NOAA refreshes.
const TICK_INTERVAL_MS = 30 * 1000;

interface HiLoPrediction {
  t: string;
  v: string;
  type: "H" | "L";
}

interface HiLoEvent {
  time: Date;
  type: "H" | "L";
  heightFt: number;
}

interface TideState {
  direction: "rising" | "falling";
  nextType: "H" | "L";
  nextTime: Date;
  heightFt: number;
  /** 0–1 progress from the previous high/low to the next one. */
  percent: number;
}

function parseNoaaTime(t: string): Date {
  // NOAA returns "YYYY-MM-DD HH:MM" in local station time (time_zone=lst_ldt).
  return new Date(t.replace(" ", "T"));
}

// NOAA's `range` parameter is hours from `begin_date` — without an explicit
// begin_date it defaults to the start of today, so a plain range could stop
// short of the next actual high/low depending on what time it is. Passing an
// explicit begin_date anchored to right now avoids that regardless of when
// the page loads.
function formatNoaaDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// A 24-hour window centered 12 hours back from now comfortably contains both
// the most recent high/low and the next one, since they're roughly 6-7 hours
// apart.
function fetchHiLoWindow(): Promise<HiLoEvent[]> {
  return cachedFetch("tide:hilo-window", HILO_TTL_MS, async () => {
    const beginDate = formatNoaaDateTime(new Date(Date.now() - 12 * 60 * 60 * 1000));
    const url = `${NOAA_BASE}?product=predictions&datum=MLLW&station=${STATION_ID}&time_zone=lst_ldt&units=english&format=json&interval=hilo&begin_date=${encodeURIComponent(beginDate)}&range=24`;
    const res = await fetch(url);
    const data: { predictions?: HiLoPrediction[] } = await res.json();
    return (data.predictions ?? [])
      .map((p) => ({ time: parseNoaaTime(p.t), type: p.type, heightFt: Number.parseFloat(p.v) }))
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  });
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

// Tide height between two consecutive extremes roughly follows a cosine
// curve, not a straight line — this approximates that shape (the same idea
// behind the "rule of twelfths" sailors use) closely enough for a glance-at
// badge, without needing a separate fine-grained NOAA reading just to avoid
// a visibly-wrong linear ramp.
function computeTideState(events: HiLoEvent[]): TideState | null {
  const now = Date.now();
  const nextIndex = events.findIndex((e) => e.time.getTime() > now);
  // Need both a preceding and an upcoming event to know the range we're
  // moving across.
  if (nextIndex <= 0) return null;
  const next = events[nextIndex];
  const prev = events[nextIndex - 1];

  const span = next.heightFt - prev.heightFt;
  const timeFraction = clamp01((now - prev.time.getTime()) / (next.time.getTime() - prev.time.getTime()));
  const heightFt = prev.heightFt + span * ((1 - Math.cos(Math.PI * timeFraction)) / 2);

  return {
    // If the next event is a high, the tide is on its way up, and vice versa.
    direction: next.type === "H" ? "rising" : "falling",
    nextType: next.type,
    nextTime: next.time,
    heightFt,
    percent: span === 0 ? 0.5 : clamp01((heightFt - prev.heightFt) / span),
  };
}

export default function TideBadge() {
  const [events, setEvents] = useState<HiLoEvent[] | null>(null);
  const [state, setState] = useState<TideState | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      fetchHiLoWindow()
        .then((evs) => {
          if (!cancelled) setEvents(evs);
        })
        .catch(() => {
          /* NOAA unreachable or unexpected response — keep showing whatever's cached. */
        });
    }
    refresh();
    const interval = setInterval(refresh, HILO_REFRESH_INTERVAL_MS);
    // A plain interval alone can leave a long-backgrounded tab showing
    // whatever was current when it was last foregrounded, since throttled
    // background timers can fall well behind — refreshing the moment the
    // tab becomes visible again closes that gap immediately.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!events) return;
    setState(computeTideState(events));
    const interval = setInterval(() => setState(computeTideState(events)), TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [events]);

  if (!state) return null;

  const timeLabel = state.nextTime
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(" ", "")
    .toLowerCase();
  const eventLabel = state.nextType === "H" ? "peak" : "min";
  const arrow = state.direction === "rising" ? "↑" : "↓";
  const dashOffset = RING_CIRCUMFERENCE * (1 - state.percent);

  return (
    <>
      <button type="button" className="tide-badge" onClick={() => setDetailOpen(true)}>
        <div className="tide-ring-wrap">
          <svg viewBox="0 0 44 44" className="tide-ring">
            <circle className="tide-ring-track" cx="22" cy="22" r={RING_RADIUS} />
            <circle
              className="tide-ring-progress"
              cx="22"
              cy="22"
              r={RING_RADIUS}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 22 22)"
            />
          </svg>
          <span className="tide-ring-arrow">{arrow}</span>
        </div>
        <div className="tide-badge-text">
          <span className="tide-badge-label">Tide</span>
          <span className="tide-badge-height">{state.heightFt.toFixed(1)}ft</span>
          <span className="tide-badge-next">
            {eventLabel} {timeLabel}
          </span>
        </div>
      </button>
      <TideDetailSheet open={detailOpen} onClose={() => setDetailOpen(false)} />
    </>
  );
}
