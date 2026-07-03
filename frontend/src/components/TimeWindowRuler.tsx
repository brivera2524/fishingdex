import { useEffect, useMemo, useRef } from "react";

interface TimeWindowRulerProps {
  /** Age in days of the oldest catch on record — the full extent of the ruler. */
  maxDaysSpan: number;
  /** Age in days of the window's older edge. */
  startDaysAgo: number;
  /** Age in days of the window's newer edge (0 = right now). */
  endDaysAgo: number;
  onChange: (startDaysAgo: number, endDaysAgo: number) => void;
  /** Bumped whenever something external (a preset) repositions the window, so the ruler re-centers on it. */
  scrollToken: number;
}

const PPD = 8; // pixels per day
const PADDING_DAYS = 5;
const MIN_GAP_DAYS = 1;
const DAY_MS = 86_400_000;

// The ruler is drawn at a fixed pixel-per-day scale rather than squeezing the
// whole catch history into one fixed-width track — with months (or years) of
// history that compression makes a 1-week and 1-month window look nearly
// identical. Instead the ruler can be wider than the viewport and the user
// scrolls it horizontally (native touch scroll) to reveal older catches,
// exactly like panning a map. Two bookmark handles mark the window's edges
// and can be dragged independently to resize it, or the highlighted band
// between them can be dragged to move the whole window at once.
function daysAgoToX(daysAgo: number, maxDaysSpan: number) {
  return (maxDaysSpan + PADDING_DAYS - daysAgo) * PPD;
}

function fmtDate(daysAgo: number) {
  return new Date(Date.now() - daysAgo * DAY_MS).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function clamp(v: number, min: number, max: number) {
  if (min > max) return min;
  return Math.min(Math.max(v, min), max);
}

type DragEdge = "start" | "end" | "both";

export default function TimeWindowRuler({
  maxDaysSpan,
  startDaysAgo,
  endDaysAgo,
  onChange,
  scrollToken,
}: TimeWindowRulerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ edge: DragEdge; startX: number; startStart: number; startEnd: number } | null>(null);

  const totalWidth = (maxDaysSpan + PADDING_DAYS * 2) * PPD;

  const ticks = useMemo(() => {
    const marks: { x: number; label: string }[] = [];
    const now = new Date();
    const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = 0; i < 60; i++) {
      const ageDays = (now.getTime() - cursor.getTime()) / DAY_MS;
      if (ageDays > maxDaysSpan + PADDING_DAYS) break;
      marks.push({
        x: daysAgoToX(ageDays, maxDaysSpan),
        label: cursor.toLocaleDateString(undefined, {
          month: "short",
          year: cursor.getFullYear() !== now.getFullYear() ? "2-digit" : undefined,
        }),
      });
      cursor.setMonth(cursor.getMonth() - 1);
    }
    return marks;
  }, [maxDaysSpan]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const endX = daysAgoToX(endDaysAgo, maxDaysSpan);
    el.scrollLeft = Math.max(0, endX - el.clientWidth + PADDING_DAYS * PPD);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToken, maxDaysSpan]);

  function beginDrag(edge: DragEdge) {
    return (e: React.PointerEvent<HTMLElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { edge, startX: e.clientX, startStart: startDaysAgo, startEnd: endDaysAgo };
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaDays = (e.clientX - drag.startX) / PPD;
    if (drag.edge === "both") {
      const span = drag.startStart - drag.startEnd;
      const newEnd = clamp(drag.startEnd - deltaDays, 0, maxDaysSpan - span);
      onChange(newEnd + span, newEnd);
    } else if (drag.edge === "start") {
      onChange(clamp(drag.startStart - deltaDays, endDaysAgo + MIN_GAP_DAYS, maxDaysSpan), endDaysAgo);
    } else {
      onChange(startDaysAgo, clamp(drag.startEnd - deltaDays, 0, startDaysAgo - MIN_GAP_DAYS));
    }
  }

  function endDrag() {
    dragRef.current = null;
  }

  const startX = daysAgoToX(startDaysAgo, maxDaysSpan);
  const endX = daysAgoToX(endDaysAgo, maxDaysSpan);

  return (
    <div className="time-ruler-scroll" ref={scrollRef}>
      <div
        className="time-ruler-inner"
        style={{ width: totalWidth }}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="time-ruler-track" />
        {ticks.map((t, i) => (
          <div key={i} className="time-ruler-tick" style={{ left: t.x }}>
            <span className="time-ruler-tick-label">{t.label}</span>
          </div>
        ))}
        <div
          className="time-ruler-window"
          style={{ left: startX, width: Math.max(2, endX - startX) }}
          onPointerDown={beginDrag("both")}
        />
        <button
          type="button"
          className="time-ruler-bookmark"
          style={{ left: startX }}
          onPointerDown={beginDrag("start")}
        >
          <span className="time-ruler-bookmark-label">{fmtDate(startDaysAgo)}</span>
        </button>
        <button type="button" className="time-ruler-bookmark" style={{ left: endX }} onPointerDown={beginDrag("end")}>
          <span className="time-ruler-bookmark-label">{endDaysAgo < 0.5 ? "Today" : fmtDate(endDaysAgo)}</span>
        </button>
      </div>
    </div>
  );
}
