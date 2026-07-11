import BottomSheet from "./BottomSheet";
import { getMoonPhase, getNextFullMoon, getNextNewMoon } from "../lib/moonPhase";

interface MoonDetailSheetProps {
  open: boolean;
  onClose: () => void;
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export default function MoonDetailSheet({ open, onClose }: MoonDetailSheetProps) {
  // Recomputed fresh each time the sheet opens rather than kept in state —
  // it's a cheap pure calculation, so there's no reason to cache it (and
  // this way it's never stale if the sheet's left mounted a while).
  const now = new Date();
  const phase = getMoonPhase(now);
  const nextNewMoon = getNextNewMoon(now);
  const nextFullMoon = getNextFullMoon(now);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div>
        <h1>Moon</h1>
        <p className="card-meta" style={{ marginBottom: 14 }}>
          {dateLabel(now)}
        </p>

        <div className="moon-detail-hero">
          <span className="moon-detail-emoji">{phase.emoji}</span>
          <div className="moon-detail-hero-text">
            <span className="moon-detail-phase">{phase.name}</span>
            <span className="card-meta">{Math.round(phase.illumination * 100)}% illuminated</span>
          </div>
        </div>

        <ul className="catch-list">
          <li className="card">
            <div className="page-header">
              <span className="card-title">Next New Moon</span>
              <span className="card-stat">🌑</span>
            </div>
            <span className="card-meta">{dateLabel(nextNewMoon)}</span>
          </li>
          <li className="card">
            <div className="page-header">
              <span className="card-title">Next Full Moon</span>
              <span className="card-stat">🌕</span>
            </div>
            <span className="card-meta">{dateLabel(nextFullMoon)}</span>
          </li>
        </ul>
      </div>
    </BottomSheet>
  );
}
