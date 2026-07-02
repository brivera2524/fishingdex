import { useEffect, useState } from "react";

// NOAA CO-OPS station 9410170 — San Diego, CA. Public API, no key required,
// and it allows cross-origin requests, so this is called directly from the
// browser rather than proxied through our backend.
const STATION_ID = "9410170";
const NOAA_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

const RING_RADIUS = 18;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface HiLoPrediction {
  t: string;
  v: string;
  type: "H" | "L";
}

interface PlainPrediction {
  t: string;
  v: string;
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
async function fetchHiLoWindow(): Promise<HiLoEvent[]> {
  const beginDate = formatNoaaDateTime(new Date(Date.now() - 12 * 60 * 60 * 1000));
  const url = `${NOAA_BASE}?product=predictions&datum=MLLW&station=${STATION_ID}&time_zone=lst_ldt&units=english&format=json&interval=hilo&begin_date=${encodeURIComponent(beginDate)}&range=24`;
  const res = await fetch(url);
  const data: { predictions?: HiLoPrediction[] } = await res.json();
  return (data.predictions ?? [])
    .map((p) => ({ time: parseNoaaTime(p.t), type: p.type, heightFt: Number.parseFloat(p.v) }))
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}

async function fetchCurrentHeightFt(): Promise<number | null> {
  const beginDate = formatNoaaDateTime(new Date(Date.now() - 60 * 60 * 1000));
  const url = `${NOAA_BASE}?product=predictions&datum=MLLW&station=${STATION_ID}&time_zone=lst_ldt&units=english&format=json&interval=6&begin_date=${encodeURIComponent(beginDate)}&range=2`;
  const res = await fetch(url);
  const data: { predictions?: PlainPrediction[] } = await res.json();
  const predictions = data.predictions ?? [];
  if (predictions.length === 0) return null;
  const now = Date.now();
  let closest = predictions[0];
  let closestDiff = Infinity;
  for (const p of predictions) {
    const diff = Math.abs(parseNoaaTime(p.t).getTime() - now);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = p;
    }
  }
  return Number.parseFloat(closest.v);
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export default function TideBadge() {
  const [state, setState] = useState<TideState | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchHiLoWindow(), fetchCurrentHeightFt()])
      .then(([events, currentHeightFt]) => {
        if (cancelled) return;
        const now = Date.now();
        const nextIndex = events.findIndex((e) => e.time.getTime() > now);
        // Need both a preceding and an upcoming event to know the range
        // we're moving across.
        if (nextIndex <= 0) return;
        const next = events[nextIndex];
        const prev = events[nextIndex - 1];

        const span = next.heightFt - prev.heightFt;
        // Falls back to interpolating by elapsed time between the two
        // events if the fine-grained height reading came back empty.
        const timeFraction = (now - prev.time.getTime()) / (next.time.getTime() - prev.time.getTime());
        const heightFt = currentHeightFt ?? prev.heightFt + span * timeFraction;

        setState({
          // If the next event is a high, the tide is on its way up, and
          // vice versa.
          direction: next.type === "H" ? "rising" : "falling",
          nextType: next.type,
          nextTime: next.time,
          heightFt,
          percent: span === 0 ? 0.5 : clamp01((heightFt - prev.heightFt) / span),
        });
      })
      .catch(() => {
        /* NOAA unreachable or unexpected response — just skip the badge. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  const timeLabel = state.nextTime
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(" ", "")
    .toLowerCase();
  const eventLabel = state.nextType === "H" ? "peak" : "min";
  const arrow = state.direction === "rising" ? "↑" : "↓";
  const dashOffset = RING_CIRCUMFERENCE * (1 - state.percent);

  return (
    <div className="tide-badge">
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
        <span className="tide-badge-height">{state.heightFt.toFixed(1)}ft</span>
        <span className="tide-badge-next">
          {eventLabel} {timeLabel}
        </span>
      </div>
    </div>
  );
}
