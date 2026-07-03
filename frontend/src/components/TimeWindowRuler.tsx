import { useEffect, useMemo, useRef, useState } from "react";

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
// While dragging, getting within this many px of either edge of the visible
// ruler starts auto-scrolling it (faster the closer to the edge), so the
// user can pan to reveal older/newer catches without releasing and re-grabbing.
const EDGE_ZONE_PX = 42;
const MAX_AUTO_SCROLL_PX_PER_FRAME = 14;

// Vertical layout of the ruler, top to bottom — kept as named constants so
// the tick labels (top) and bookmark date labels (bottom) never fight for
// the same band, which is what made the previous version look like a mess
// of overlapping text.
const TRACK_Y = 30;
const BOOKMARK_LABEL_Y = 44;

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

function clamp01(v: number) {
  return Math.min(Math.max(v, 0), 1);
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
  const lastClientXRef = useRef(0);
  const autoScrollFrameRef = useRef<number | null>(null);
  const [draggingEdge, setDraggingEdge] = useState<DragEdge | null>(null);

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

  // Stop any in-flight auto-scroll loop if the ruler unmounts mid-drag.
  useEffect(() => {
    return () => {
      if (autoScrollFrameRef.current != null) cancelAnimationFrame(autoScrollFrameRef.current);
    };
  }, []);

  // Content-space x (independent of scroll position) so the drag math stays
  // correct even while the container is auto-scrolling underneath the finger.
  function toContentX(clientX: number) {
    return clientX + (scrollRef.current?.scrollLeft ?? 0);
  }

  function applyDrag(clientX: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaDays = (toContentX(clientX) - drag.startX) / PPD;
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

  function startAutoScrollLoop() {
    if (autoScrollFrameRef.current != null) return;
    const tick = () => {
      if (!dragRef.current) {
        autoScrollFrameRef.current = null;
        return;
      }
      const el = scrollRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const clientX = lastClientXRef.current;
        let speed = 0;
        if (clientX < rect.left + EDGE_ZONE_PX) {
          speed = -MAX_AUTO_SCROLL_PX_PER_FRAME * clamp01((rect.left + EDGE_ZONE_PX - clientX) / EDGE_ZONE_PX);
        } else if (clientX > rect.right - EDGE_ZONE_PX) {
          speed = MAX_AUTO_SCROLL_PX_PER_FRAME * clamp01((clientX - (rect.right - EDGE_ZONE_PX)) / EDGE_ZONE_PX);
        }
        if (speed !== 0) {
          const maxScroll = el.scrollWidth - el.clientWidth;
          el.scrollLeft = clamp(el.scrollLeft + speed, 0, maxScroll);
          applyDrag(clientX);
        }
      }
      autoScrollFrameRef.current = requestAnimationFrame(tick);
    };
    autoScrollFrameRef.current = requestAnimationFrame(tick);
  }

  function beginDrag(edge: DragEdge) {
    return (e: React.PointerEvent<HTMLElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      lastClientXRef.current = e.clientX;
      dragRef.current = { edge, startX: toContentX(e.clientX), startStart: startDaysAgo, startEnd: endDaysAgo };
      setDraggingEdge(edge);
      startAutoScrollLoop();
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    lastClientXRef.current = e.clientX;
    applyDrag(e.clientX);
  }

  function endDrag() {
    dragRef.current = null;
    if (autoScrollFrameRef.current != null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    setDraggingEdge(null);
  }

  const startX = daysAgoToX(startDaysAgo, maxDaysSpan);
  const endX = daysAgoToX(endDaysAgo, maxDaysSpan);
  const windowWidth = Math.max(2, endX - startX);

  return (
    <div className="time-ruler-scroll" ref={scrollRef}>
      <div
        className={`time-ruler-inner${draggingEdge ? " dragging" : ""}`}
        style={{ width: totalWidth }}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="time-ruler-track" style={{ top: TRACK_Y }} />
        {ticks.map((t, i) => (
          <div key={i} className="time-ruler-tick" style={{ left: t.x }}>
            <span className="time-ruler-tick-label">{t.label}</span>
          </div>
        ))}
        <div
          className={`time-ruler-window${draggingEdge === "both" ? " active" : ""}`}
          style={{ left: startX, width: windowWidth, top: TRACK_Y }}
          onPointerDown={beginDrag("both")}
        >
          {windowWidth > 36 && <span className="time-ruler-grip" />}
        </div>
        <button
          type="button"
          className={`time-ruler-bookmark${draggingEdge === "start" ? " active" : ""}`}
          style={{ left: startX, top: TRACK_Y }}
          onPointerDown={beginDrag("start")}
        >
          <span className="time-ruler-bookmark-dot" />
        </button>
        {windowWidth > 70 && (
          <span className="time-ruler-bookmark-label" style={{ left: startX, top: BOOKMARK_LABEL_Y }}>
            {fmtDate(startDaysAgo)}
          </span>
        )}
        <button
          type="button"
          className={`time-ruler-bookmark${draggingEdge === "end" ? " active" : ""}`}
          style={{ left: endX, top: TRACK_Y }}
          onPointerDown={beginDrag("end")}
        >
          <span className="time-ruler-bookmark-dot" />
        </button>
        {windowWidth > 70 && (
          <span className="time-ruler-bookmark-label" style={{ left: endX, top: BOOKMARK_LABEL_Y }}>
            {endDaysAgo < 0.5 ? "Today" : fmtDate(endDaysAgo)}
          </span>
        )}
      </div>
    </div>
  );
}
