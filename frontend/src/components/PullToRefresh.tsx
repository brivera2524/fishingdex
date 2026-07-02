import { animate, motion, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface PullToRefreshProps {
  onRefresh: () => void | Promise<void>;
  children: ReactNode;
}

const SPRING = { type: "spring" as const, damping: 30, stiffness: 300 };
const PULL_THRESHOLD = 64;
const MAX_PULL = 100;

// Mirrors BottomSheet's touch-handling approach: raw non-passive touchmove
// listeners rather than Pointer Events, since only those can reliably
// preventDefault() the browser's native scroll once it's decided to pull
// down at the top of the page (see BottomSheet.tsx for the fuller
// explanation — the same race applies here).
export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startY = 0;
    let phase: "pending" | "pulling" | "scrolling" | "ignored" = "pending";

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) {
        phase = "ignored";
        return;
      }
      startY = e.touches[0].clientY;
      const target = e.target as HTMLElement;
      // Leave map panning (and anything else with its own gesture handling)
      // alone, same reasoning as BottomSheet.
      phase = target.closest(".leaflet-container") ? "ignored" : "pending";
    }

    function onTouchMove(e: TouchEvent) {
      if (phase === "ignored") return;
      const deltaY = e.touches[0].clientY - startY;

      if (phase === "pending") {
        if (Math.abs(deltaY) < 4) return;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        phase = deltaY > 0 && scrollTop <= 0 ? "pulling" : "scrolling";
      }

      if (phase === "pulling") {
        e.preventDefault();
        y.set(Math.min(MAX_PULL, deltaY * 0.5));
      }
    }

    function onTouchEnd() {
      if (phase === "pulling") {
        if (y.get() >= PULL_THRESHOLD) {
          setRefreshing(true);
          animate(y, PULL_THRESHOLD, SPRING);
          Promise.resolve(onRefresh()).finally(() => {
            setRefreshing(false);
            animate(y, 0, SPRING);
          });
        } else {
          animate(y, 0, SPRING);
        }
      }
      phase = "pending";
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [onRefresh, y]);

  return (
    <div ref={containerRef} className="pull-refresh">
      <motion.div className="pull-refresh-indicator" style={{ height: y }}>
        <span className={`pull-refresh-spinner${refreshing ? " spinning" : ""}`}>↓</span>
      </motion.div>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}
