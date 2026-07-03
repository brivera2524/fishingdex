interface TimeWindowSliderProps {
  /** Age in days of the oldest catch on record — the full extent of the track. */
  maxDaysSpan: number;
  /** Size of the visible window, in days. */
  windowDays: number;
  /** Age in days of the window's newer edge (0 = right now). */
  endDaysAgo: number;
  onChange: (endDaysAgo: number) => void;
}

// A single-thumb slider that repositions a fixed-size window across the full
// catch history, rather than two independent thumbs marking each edge. With
// months (or years) of history, a 30-day gap between two thumbs is too small
// a fraction of the track to grab reliably — one thumb dragging the whole
// window is both easier to hit and covers the full range in one gesture.
// Window size is instead chosen discretely via preset buttons in Map.tsx.
export default function TimeWindowSlider({ maxDaysSpan, windowDays, endDaysAgo, onChange }: TimeWindowSliderProps) {
  const maxPos = Math.max(0, maxDaysSpan - windowDays);
  // Inverted so the thumb reads left-to-right as old-to-new, matching a timeline.
  const sliderVal = maxPos - endDaysAgo;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(maxPos - Number(e.target.value));
  }

  const startDaysAgo = endDaysAgo + windowDays;
  const leftPct = maxDaysSpan > 0 ? Math.max(0, ((maxDaysSpan - startDaysAgo) / maxDaysSpan) * 100) : 0;
  const widthPct = maxDaysSpan > 0 ? Math.min(100, (windowDays / maxDaysSpan) * 100) : 100;

  return (
    <div className="time-slider">
      <div className="time-slider-track" />
      <div className="time-slider-window" style={{ left: `${leftPct}%`, width: `${widthPct}%` }} />
      <input type="range" min={0} max={maxPos} value={sliderVal} onChange={handleChange} disabled={maxPos === 0} />
    </div>
  );
}
