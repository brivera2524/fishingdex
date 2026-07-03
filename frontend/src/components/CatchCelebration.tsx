import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

export type CelebrationTier = "catch" | "pb" | "record";

export interface CelebrationDetails {
  tier: CelebrationTier;
  speciesName: string;
  weight: number | null;
  /** The weight this catch just beat — present for "pb"/"record" tiers. */
  previousWeight: number | null;
}

interface CatchCelebrationProps {
  details: CelebrationDetails;
  onDone: () => void;
}

interface Particle {
  angle: number;
  distance: number;
  size: number;
  color: string;
  delay: number;
}

interface TierConfig {
  colors: string[];
  particleCount: number;
  particleDuration: number;
  badgeClass: string;
  overlayClass: string;
  flash: boolean;
  glow: boolean;
  durationMs: number;
  /** navigator.vibrate() pattern — a real (if invisible) haptic tier ladder
   * on Android. Apple has never implemented the Vibration API in Safari
   * (including PWAs), so this is a no-op on iPhone regardless of pattern —
   * a platform limitation, not something fixable from here. */
  vibration: number | number[];
}

const TIERS: Record<CelebrationTier, TierConfig> = {
  catch: {
    colors: ["#5eead4", "#2dd4bf", "#0f9d8f"],
    particleCount: 10,
    particleDuration: 0.6,
    badgeClass: "",
    overlayClass: "",
    flash: false,
    glow: false,
    durationMs: 1200,
    vibration: 40,
  },
  pb: {
    colors: ["#60a5fa", "#38bdf8", "#818cf8"],
    particleCount: 26,
    particleDuration: 0.9,
    badgeClass: "celebration-badge-pb",
    overlayClass: "",
    flash: false,
    glow: false,
    durationMs: 2200,
    vibration: [40, 60, 40],
  },
  record: {
    colors: ["#facc15", "#fb923c", "#f87171", "#c084fc", "#60a5fa"],
    particleCount: 56,
    particleDuration: 1.3,
    badgeClass: "celebration-badge-record",
    overlayClass: "celebration-overlay-record",
    flash: true,
    glow: true,
    durationMs: 3800,
    vibration: [60, 40, 60, 40, 140],
  },
};

function buildParticles(count: number, colors: string[]): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    angle: (Math.PI * 2 * i) / count + Math.random() * 0.5,
    distance: 120 + Math.random() * 160,
    size: 6 + Math.random() * 10,
    color: colors[i % colors.length],
    delay: Math.random() * 0.15,
  }));
}

function formatLb(n: number): string {
  return `${n.toFixed(1)} lb`;
}

// Builds the badge's headline + detail line from the actual catch data,
// rather than a generic "LEGENDARY CATCH!" — a specific "beat previous by
// X lb" reads as a real accomplishment instead of just a canned label.
function buildBadgeText(details: CelebrationDetails): { title: string; subtitle: string | null } {
  const { tier, speciesName, weight, previousWeight } = details;

  if (tier === "record") {
    const title = `🏆 New ${speciesName} Record!`;
    if (weight != null && previousWeight != null) {
      const margin = weight - previousWeight;
      return { title, subtitle: `${formatLb(weight)} — beat previous by ${formatLb(margin)}` };
    }
    return { title, subtitle: weight != null ? formatLb(weight) : null };
  }

  if (tier === "pb") {
    const title = "🎣 New Personal Best!";
    if (weight != null && previousWeight != null) {
      const margin = weight - previousWeight;
      return { title, subtitle: `${speciesName} · ${formatLb(weight)} (+${formatLb(margin)})` };
    }
    return { title, subtitle: weight != null ? `${speciesName} · ${formatLb(weight)}` : speciesName };
  }

  return { title: "🎣 Nice catch!", subtitle: weight != null ? `${speciesName} · ${formatLb(weight)}` : speciesName };
}

// Portalled to the body for the same reason as DiscoveryReveal — a
// BottomSheet's motion.div always carries an inline transform, which would
// otherwise confine this full-screen overlay to the sheet's own box.
export default function CatchCelebration({ details, onDone }: CatchCelebrationProps) {
  const config = TIERS[details.tier];
  const { title, subtitle } = buildBadgeText(details);
  const particles = useMemo(() => buildParticles(config.particleCount, config.colors), [config]);

  useEffect(() => {
    if ("vibrate" in navigator) navigator.vibrate(config.vibration);
    const timeout = setTimeout(onDone, config.durationMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details.tier]);

  return createPortal(
    <div className={`celebration-overlay ${config.overlayClass}`} onClick={onDone}>
      {config.glow && (
        <motion.div
          className="celebration-glow"
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: [0, 0.8, 0.6], rotate: 360 }}
          transition={{ opacity: { duration: 0.6 }, rotate: { duration: 3.5, ease: "linear" } }}
        />
      )}
      {config.flash && (
        <motion.div
          className="celebration-flash"
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      )}
      <div className="celebration-burst">
        {particles.map((p, i) => (
          <motion.span
            key={i}
            className="celebration-particle"
            style={{ width: p.size, height: p.size, background: p.color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
            animate={{
              x: Math.cos(p.angle) * p.distance,
              y: Math.sin(p.angle) * p.distance,
              opacity: 0,
              scale: 1,
              rotate: Math.random() * 360,
            }}
            transition={{ duration: config.particleDuration, delay: p.delay, ease: "easeOut" }}
          />
        ))}
      </div>
      <motion.div
        className={`celebration-badge ${config.badgeClass}`}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 12, stiffness: 220, delay: 0.1 }}
      >
        <span className="celebration-badge-title">{title}</span>
        {subtitle && <span className="celebration-badge-subtitle">{subtitle}</span>}
      </motion.div>
    </div>,
    document.body
  );
}
