import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { Species } from "../api/types";

interface DiscoveryRevealProps {
  species: Species;
  /** Fully-resolved image src (blob: URL or absolute URL) — caller resolves it. */
  photoSrc: string | null;
  onDone: () => void;
}

export default function DiscoveryReveal({ species, photoSrc, onDone }: DiscoveryRevealProps) {
  const [flipped, setFlipped] = useState(false);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFlipped(true), 700);
    const t2 = setTimeout(() => setShowText(true), 1300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Portalled to the body since this can be rendered from inside a
  // BottomSheet, whose motion.div always has an inline `transform` applied
  // (even at rest) — that makes it the containing block for any `position:
  // fixed` descendant, which would otherwise confine this overlay to the
  // sheet's box instead of the full viewport.
  return createPortal(
    <div className="discovery-overlay">
      <motion.div
        className="discovery-card"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 14, stiffness: 180 }}
      >
        <motion.div
          className="discovery-flip-inner"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          <div className="discovery-face discovery-face-front">
            <span className="dex-card-emoji" style={{ fontSize: 64 }}>
              🐟
            </span>
          </div>
          <div className="discovery-face discovery-face-back">
            {photoSrc ? (
              <img src={photoSrc} alt={species.common_name} />
            ) : (
              <span className="dex-card-emoji" style={{ fontSize: 64 }}>
                🐟
              </span>
            )}
          </div>
        </motion.div>
      </motion.div>

      {showText && (
        <motion.div
          className="discovery-text"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p className="discovery-title">New species discovered!</p>
          <h1 style={{ color: "#fff", marginBottom: 24 }}>{species.common_name}</h1>
          <button type="button" onClick={onDone}>
            Awesome!
          </button>
        </motion.div>
      )}
    </div>,
    document.body
  );
}
