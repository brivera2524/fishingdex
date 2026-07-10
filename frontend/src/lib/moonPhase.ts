// Moon phase is a pure function of a date — no external API, no persistence
// needed. Unlike tide (a real physical measurement that has to be fetched),
// this can be computed identically for any timestamp, past or future, so
// every catch's caught_at already carries everything needed to backfill it.
const SYNODIC_MONTH_DAYS = 29.530588861;
// A known new moon (Jan 6, 2000, 18:14 UTC), used purely as a reference
// point — any accurate new moon works equally well since we only care about
// position within the ~29.53-day cycle, not this specific date.
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

export interface MoonPhase {
  name: string;
  emoji: string;
  /** 0 (new) – 1 (full) – back to 0 (new). */
  illumination: number;
}

// 8 equal buckets across the cycle, each ~3.69 days wide.
const PHASES: Array<{ name: string; emoji: string }> = [
  { name: "New Moon", emoji: "🌑" },
  { name: "Waxing Crescent", emoji: "🌒" },
  { name: "First Quarter", emoji: "🌓" },
  { name: "Waxing Gibbous", emoji: "🌔" },
  { name: "Full Moon", emoji: "🌕" },
  { name: "Waning Gibbous", emoji: "🌖" },
  { name: "Last Quarter", emoji: "🌗" },
  { name: "Waning Crescent", emoji: "🌘" },
];

export function getMoonPhase(at: Date | string | number): MoonPhase {
  const ms = at instanceof Date ? at.getTime() : new Date(at).getTime();
  const daysSinceNew = (ms - KNOWN_NEW_MOON_MS) / 86400000;
  // Modulo that stays positive for dates before the reference new moon too.
  const age = ((daysSinceNew % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
  const frac = age / SYNODIC_MONTH_DAYS;
  const illumination = (1 - Math.cos(2 * Math.PI * frac)) / 2;
  const index = Math.round(frac * 8) % 8;
  return { ...PHASES[index], illumination };
}
