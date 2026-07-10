import { useEffect, useState } from "react";
import { getMoonPhase, type MoonPhase } from "../lib/moonPhase";

// The phase only meaningfully changes over hours, not seconds — an hourly
// recompute keeps this correct across a midnight rollover without any real
// cost (no fetch, just re-running the same pure calculation).
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export default function MoonPhaseBadge() {
  const [phase, setPhase] = useState<MoonPhase>(() => getMoonPhase(new Date()));

  useEffect(() => {
    const interval = setInterval(() => setPhase(getMoonPhase(new Date())), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="moon-badge">
      <span className="moon-badge-emoji">{phase.emoji}</span>
      <div className="moon-badge-text">
        <span className="moon-badge-label">Moon</span>
        <span className="moon-badge-phase">{phase.name}</span>
      </div>
    </div>
  );
}
