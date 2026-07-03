import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";
import { cachedFetch } from "../lib/ttlCache";

const STATION_ID = "9410170";
const NOAA_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

// The curve/events barely shift minute to minute, so a longer TTL here is
// fine — this data is only fetched at all when the sheet is opened, unlike
// TideBadge's fetches which run continuously in the background.
const DETAIL_TTL_MS = 15 * 60 * 1000;

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

interface CurvePoint {
  time: Date;
  heightFt: number;
}

function parseNoaaTime(t: string): Date {
  return new Date(t.replace(" ", "T"));
}

function formatNoaaDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Hourly points over a ~2 day window centered a bit before now — enough to
// draw a smooth curve and show "now" comfortably inside it rather than
// right at the edge.
function fetchCurve(): Promise<CurvePoint[]> {
  return cachedFetch("tide:detail-curve", DETAIL_TTL_MS, async () => {
    const beginDate = formatNoaaDateTime(new Date(Date.now() - 6 * 60 * 60 * 1000));
    const url = `${NOAA_BASE}?product=predictions&datum=MLLW&station=${STATION_ID}&time_zone=lst_ldt&units=english&format=json&interval=h&begin_date=${encodeURIComponent(beginDate)}&range=42`;
    const res = await fetch(url);
    const data: { predictions?: PlainPrediction[] } = await res.json();
    return (data.predictions ?? []).map((p) => ({ time: parseNoaaTime(p.t), heightFt: Number.parseFloat(p.v) }));
  });
}

function fetchEvents(): Promise<HiLoEvent[]> {
  return cachedFetch("tide:detail-events", DETAIL_TTL_MS, async () => {
    const beginDate = formatNoaaDateTime(new Date(Date.now() - 6 * 60 * 60 * 1000));
    const url = `${NOAA_BASE}?product=predictions&datum=MLLW&station=${STATION_ID}&time_zone=lst_ldt&units=english&format=json&interval=hilo&begin_date=${encodeURIComponent(beginDate)}&range=42`;
    const res = await fetch(url);
    const data: { predictions?: HiLoPrediction[] } = await res.json();
    return (data.predictions ?? [])
      .map((p) => ({ time: parseNoaaTime(p.t), type: p.type, heightFt: Number.parseFloat(p.v) }))
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  });
}

function dayLabel(d: Date): string {
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short" });
}

function timeLabel(d: Date): string {
  return d
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(" ", "")
    .toLowerCase();
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 140;
const CHART_SIDE_PADDING = 16;
const CHART_TOP_PADDING = 16;
// Extra room below the curve reserved for the time axis (tick marks + labels),
// separate from the padding around the curve itself.
const CHART_AXIS_HEIGHT = 34;
const CHART_BOTTOM = CHART_HEIGHT - CHART_AXIS_HEIGHT;
const HOUR_MS = 60 * 60 * 1000;
const AXIS_TICK_INTERVAL_HOURS = 6;

function hourTickLabel(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric" }).replace(" ", "").toLowerCase();
}

function dateTickLabel(d: Date): string {
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface TideDetailSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function TideDetailSheet({ open, onClose }: TideDetailSheetProps) {
  const [curve, setCurve] = useState<CurvePoint[] | null>(null);
  const [events, setEvents] = useState<HiLoEvent[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCurve(null);
    setEvents(null);
    setError(false);
    Promise.all([fetchCurve(), fetchEvents()])
      .then(([curvePoints, hiLoEvents]) => {
        if (cancelled) return;
        setCurve(curvePoints);
        setEvents(hiLoEvents);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const upcomingEvents = (events ?? []).filter((e) => e.time.getTime() > Date.now() - 60 * 60 * 1000).slice(0, 6);

  let chartPath = "";
  let nowX: number | null = null;
  let eventDots: { x: number; y: number; event: HiLoEvent }[] = [];
  let axisTicks: { x: number; label: string; isDayBoundary: boolean }[] = [];

  if (curve && curve.length > 1) {
    const heights = curve.map((p) => p.heightFt);
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    const range = maxH - minH || 1;
    const paddedMin = minH - range * 0.15;
    const paddedMax = maxH + range * 0.15;
    const minT = curve[0].time.getTime();
    const maxT = curve[curve.length - 1].time.getTime();
    const spanT = maxT - minT || 1;

    const toX = (time: number) => CHART_SIDE_PADDING + ((time - minT) / spanT) * (CHART_WIDTH - CHART_SIDE_PADDING * 2);
    const toXY = (time: number, heightFt: number) => {
      const x = toX(time);
      const y =
        CHART_BOTTOM - ((heightFt - paddedMin) / (paddedMax - paddedMin)) * (CHART_BOTTOM - CHART_TOP_PADDING);
      return { x, y };
    };

    chartPath = curve
      .map((p, i) => {
        const { x, y } = toXY(p.time.getTime(), p.heightFt);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    const now = Date.now();
    if (now >= minT && now <= maxT) {
      nowX = toX(now);
    }

    eventDots = (events ?? [])
      .filter((e) => e.time.getTime() >= minT && e.time.getTime() <= maxT)
      .map((e) => ({ ...toXY(e.time.getTime(), e.heightFt), event: e }));

    // Tick every few hours so the curve reads against actual times of day,
    // with day boundaries (midnight) called out by a date instead of a time.
    const firstTick = new Date(minT);
    firstTick.setMinutes(0, 0, 0);
    const hoursPastBoundary = firstTick.getHours() % AXIS_TICK_INTERVAL_HOURS;
    if (hoursPastBoundary !== 0) firstTick.setHours(firstTick.getHours() + (AXIS_TICK_INTERVAL_HOURS - hoursPastBoundary));
    for (let t = firstTick.getTime(); t <= maxT; t += AXIS_TICK_INTERVAL_HOURS * HOUR_MS) {
      const d = new Date(t);
      const isDayBoundary = d.getHours() === 0;
      axisTicks.push({ x: toX(t), label: isDayBoundary ? dateTickLabel(d) : hourTickLabel(d), isDayBoundary });
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div>
        <h1>Tide</h1>
        <p className="card-meta" style={{ marginBottom: 14 }}>
          San Diego, CA · NOAA station {STATION_ID}
        </p>

        {error && <p className="error">Couldn't load tide data.</p>}
        {!error && !curve && <p>Loading...</p>}

        {chartPath && (
          <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="tide-chart">
            <line
              x1={0}
              x2={CHART_WIDTH}
              y1={CHART_BOTTOM}
              y2={CHART_BOTTOM}
              className="tide-chart-axis-line"
            />
            {axisTicks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={tick.x}
                  x2={tick.x}
                  y1={CHART_TOP_PADDING}
                  y2={CHART_BOTTOM}
                  className={tick.isDayBoundary ? "tide-chart-tick tide-chart-tick-day" : "tide-chart-tick"}
                />
                <text
                  x={tick.x}
                  y={CHART_HEIGHT - 6}
                  className={tick.isDayBoundary ? "tide-chart-tick-label tide-chart-tick-label-day" : "tide-chart-tick-label"}
                  textAnchor="middle"
                >
                  {tick.label}
                </text>
              </g>
            ))}
            <path d={chartPath} className="tide-chart-line" />
            {nowX != null && (
              <g>
                <line x1={nowX} x2={nowX} y1={CHART_TOP_PADDING} y2={CHART_BOTTOM} className="tide-chart-now" />
                <text x={nowX} y={CHART_TOP_PADDING - 4} className="tide-chart-now-label" textAnchor="middle">
                  Now
                </text>
              </g>
            )}
            {eventDots.map(({ x, y, event }) => (
              <g key={event.time.toISOString()}>
                <circle cx={x} cy={y} r={3} className="tide-chart-dot" />
                <text x={x} y={event.type === "H" ? y - 8 : y + 16} className="tide-chart-dot-label" textAnchor="middle">
                  {event.heightFt.toFixed(1)}
                </text>
              </g>
            ))}
          </svg>
        )}

        {upcomingEvents.length > 0 && (
          <ul className="catch-list">
            {upcomingEvents.map((e) => (
              <li key={e.time.toISOString()} className="card">
                <div className="page-header">
                  <span className="card-title">{e.type === "H" ? "High" : "Low"}</span>
                  <span className="card-stat">{e.heightFt.toFixed(1)}ft</span>
                </div>
                <span className="card-meta">
                  {dayLabel(e.time)} {timeLabel(e.time)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
