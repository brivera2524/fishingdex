interface TimeRangeSliderProps {
  min: number;
  max: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
}

const MIN_GAP = 1;

// Generic dual-thumb range slider over a numeric domain — the caller decides
// what the numbers mean (here, Map.tsx maps them to "days ago" so the left
// thumb reads as the older/start bound and the right thumb as the
// newer/end bound, matching how a timeline reads left-to-right).
export default function TimeRangeSlider({ min, max, low, high, onChange }: TimeRangeSliderProps) {
  function handleLow(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(Math.min(Number(e.target.value), high - MIN_GAP), high);
  }

  function handleHigh(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(low, Math.max(Number(e.target.value), low + MIN_GAP));
  }

  const span = max - min || 1;
  const lowPct = ((low - min) / span) * 100;
  const highPct = ((high - min) / span) * 100;

  return (
    <div className="time-slider">
      <div className="time-slider-track" />
      <div className="time-slider-track-fill" style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }} />
      <input type="range" min={min} max={max} value={low} onChange={handleLow} />
      <input type="range" min={min} max={max} value={high} onChange={handleHigh} />
    </div>
  );
}
