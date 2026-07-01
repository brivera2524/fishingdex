import { AnimatePresence, animate, motion, useDragControls, useMotionValue } from "framer-motion";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Locks the sheet to its max height instead of auto-fitting content.
   * Use this when the sheet holds internal tabs whose content heights
   * differ a lot (e.g. a species grid vs. a catch list) — without it, the
   * sheet visibly grows/shrinks each time you switch tabs. */
  fixedHeight?: boolean;
}

const SPRING = { type: "spring" as const, damping: 32, stiffness: 320 };
const DISMISS_THRESHOLD = 60;

export default function BottomSheet({ open, onClose, children, fixedHeight = false }: BottomSheetProps) {
  const dragControls = useDragControls();
  const y = useMotionValue(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Without this, the page has no scroll container of its own (it scrolls
  // via the document body), so touches over an open sheet could still
  // scroll the page behind it. Locking body scroll while any sheet is open
  // (with the iOS rubber-band-safe position:fixed technique) stops that.
  useEffect(() => {
    if (!open) return;
    y.set(0);
    const scrollY = window.scrollY;
    const { style } = document.body;
    const prevPosition = style.position;
    const prevTop = style.top;
    const prevWidth = style.width;
    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.width = "100%";
    return () => {
      style.position = prevPosition;
      style.top = prevTop;
      style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The header (handle + close button) has no scrollable content, so Framer's
  // built-in drag can start right on pointerdown with no conflict.
  //
  // The content area is different: it needs native scrolling most of the
  // time, so it can't eagerly claim the touch. But Pointer Events can't
  // reliably cancel the browser's own scroll gesture once it starts — that's
  // a race only *touch* events with a non-passive listener can win, which is
  // why the previous pointermove-based handoff felt like it only worked on
  // fast flicks (a slow drag gave the browser's native scroll recognizer time
  // to claim the touch first). So this drives the sheet's position directly:
  // watch touchmove ourselves, and the instant we've confirmed "pulling down
  // while already at the top", call preventDefault to take the touch away
  // from the browser for the rest of the gesture.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !open) return;

    let startY = 0;
    let phase: "pending" | "dragging" | "scrolling" | "ignored" = "pending";

    function onTouchStart(e: TouchEvent) {
      startY = e.touches[0].clientY;
      // Leaflet (and anything else that owns its own pan/drag gestures, like
      // a map) needs the raw touch stream to itself — if we also watch it
      // for "pull to dismiss", our preventDefault fight with Leaflet's own
      // handling and the map ends up panning the page behind it instead of
      // itself.
      const target = e.target as HTMLElement;
      phase = target.closest(".leaflet-container") ? "ignored" : "pending";
    }

    function onTouchMove(e: TouchEvent) {
      if (phase === "ignored") return;
      const deltaY = e.touches[0].clientY - startY;

      if (phase === "pending") {
        if (Math.abs(deltaY) < 4) return;
        phase = deltaY > 0 && el!.scrollTop <= 0 ? "dragging" : "scrolling";
      }

      if (phase === "dragging") {
        e.preventDefault();
        y.set(Math.max(0, deltaY * 0.6));
      }
    }

    function onTouchEnd() {
      if (phase === "dragging") {
        if (y.get() > DISMISS_THRESHOLD) {
          onClose();
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
  }, [open, onClose, y]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="sheet-wrap">
            <motion.div
              className={`sheet${fixedHeight ? " sheet-fixed-height" : ""}`}
              style={{ y }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={SPRING}
              drag="y"
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > DISMISS_THRESHOLD) onClose();
              }}
            >
              <div className="sheet-header" onPointerDown={(e) => dragControls.start(e)}>
                <div className="sheet-handle" />
              </div>
              <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
                ✕
              </button>
              <div className="sheet-content" ref={contentRef}>
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
