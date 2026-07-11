import { useEffect, useState } from "react";
import MoonDetailSheet from "./MoonDetailSheet";
import { getMoonPhase, type MoonPhase } from "../lib/moonPhase";

// The phase only meaningfully changes over hours, not seconds — an hourly
// recompute keeps this correct across a midnight rollover without any real
// cost (no fetch, just re-running the same pure calculation).
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export default function MoonPhaseBadge() {
  const [phase, setPhase] = useState<MoonPhase>(() => getMoonPhase(new Date()));
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setPhase(getMoonPhase(new Date())), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <button type="button" className="moon-badge" aria-label={phase.name} onClick={() => setDetailOpen(true)}>
        <span className="moon-badge-emoji">{phase.emoji}</span>
      </button>
      <MoonDetailSheet open={detailOpen} onClose={() => setDetailOpen(false)} />
    </>
  );
}
