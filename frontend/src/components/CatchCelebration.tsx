import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

interface CatchCelebrationProps {
  tier: "pb" | "record";
  onDone: () => void;
}

const PB_COLORS = ["#2dd4bf", "#5eead4", "#0f9d8f"];
const RECORD_COLORS = ["#facc15", "#fb923c", "#f87171", "#c084fc", "#60a5fa"];

interface Particle {
  angle: number;
  distance: number;
  size: number;
  color: string;
  delay: number;
}

function buildParticles(count: number, colors: string[]): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    angle: (Math.PI * 2 * i) / count + Math.random() * 0.5,
    distance: 120 + Math.random() * 160,
    size: 6 + Math.random() * 10,
    color: colors[i % colors.length],
    delay: Math.random() * 0.15,
  }));
}

// Portalled to the body for the same reason as DiscoveryReveal — a
// BottomSheet's motion.div always carries an inline transform, which would
// otherwise confine this full-screen overlay to the sheet's own box.
export default function CatchCelebration({ tier, onDone }: CatchCelebrationProps) {
  const isRecord = tier === "record";
  const particles = useMemo(
    () => buildParticles(isRecord ? 40 : 20, isRecord ? RECORD_COLORS : PB_COLORS),
    [isRecord]
  );

  useEffect(() => {
    const timeout = setTimeout(onDone, isRecord ? 3000 : 2000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecord]);

  return createPortal(
    <div className={`celebration-overlay${isRecord ? " celebration-overlay-record" : ""}`} onClick={onDone}>
      {isRecord && (
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
            transition={{ duration: isRecord ? 1.1 : 0.8, delay: p.delay, ease: "easeOut" }}
          />
        ))}
      </div>
      <motion.div
        className={`celebration-badge${isRecord ? " celebration-badge-record" : ""}`}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 12, stiffness: 220, delay: 0.1 }}
      >
        {isRecord ? "🏆 NEW RECORD!" : "🎣 New Personal Best!"}
      </motion.div>
    </div>,
    document.body
  );
}
