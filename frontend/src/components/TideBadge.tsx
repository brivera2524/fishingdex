import { useEffect, useState } from "react";

// NOAA CO-OPS station 9410170 — San Diego, CA. Public API, no key required,
// and it allows cross-origin requests, so this is called directly from the
// browser rather than proxied through our backend.
const STATION_ID = "9410170";
const NOAA_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

interface HiLoPrediction {
  t: string;
  v: string;
  type: "H" | "L";
}

interface PlainPrediction {
  t: string;
  v: string;
}

interface TideState {
  direction: "rising" | "falling";
  nextType: "H" | "L";
  nextTime: Date;
  currentHeightFt: number | null;
}

function parseNoaaTime(t: string): Date {
  // NOAA returns "YYYY-MM-DD HH:MM" in local station time (time_zone=lst_ldt).
  return new Date(t.replace(" ", "T"));
}

// NOAA's `range` parameter is hours from `begin_date` — without an explicit
// begin_date it defaults to the start of today, so `range=24` only reliably
// covers "today", not "the next 24 hours". Late in the day that window can
// end before the next actual high/low, so fetchNextHiLo found nothing and
// the badge silently never appeared. Passing an explicit begin_date anchored
// to right now fixes that regardless of what time it is.
function formatNoaaDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchNextHiLo(): Promise<{ type: "H" | "L"; time: Date } | null> {
  const beginDate = formatNoaaDateTime(new Date());
  const url = `${NOAA_BASE}?product=predictions&datum=MLLW&station=${STATION_ID}&time_zone=lst_ldt&units=english&format=json&interval=hilo&begin_date=${encodeURIComponent(beginDate)}&range=48`;
  const res = await fetch(url);
  const data: { predictions?: HiLoPrediction[] } = await res.json();
  const now = Date.now();
  const next = (data.predictions ?? [])
    .map((p) => ({ type: p.type, time: parseNoaaTime(p.t) }))
    .find((p) => p.time.getTime() > now);
  return next ?? null;
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

export default function TideBadge() {
  const [state, setState] = useState<TideState | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchNextHiLo(), fetchCurrentHeightFt()])
      .then(([next, currentHeightFt]) => {
        if (cancelled || !next) return;
        setState({
          // If the next event is a high, the tide is on its way up, and
          // vice versa.
          direction: next.type === "H" ? "rising" : "falling",
          nextType: next.type,
          nextTime: next.time,
          currentHeightFt,
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

  return (
    <div className="tide-badge">
      {arrow} Tide {state.direction}, {eventLabel} {timeLabel}
      {state.currentHeightFt != null && ` · ${state.currentHeightFt.toFixed(1)}ft`}
    </div>
  );
}
