import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const dragControls = useDragControls();
  const contentRef = useRef<HTMLDivElement>(null);

  // Without this, the page has no scroll container of its own (it scrolls
  // via the document body), so touches over an open sheet could still
  // scroll the page behind it. Locking body scroll while any sheet is open
  // (with the iOS rubber-band-safe position:fixed technique) stops that.
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  // The header (handle + close button) has no scrollable content, so it can
  // hand off to Framer's drag immediately on pointerdown. The scrollable
  // body can't do that — starting the drag eagerly on pointerdown claims the
  // touch immediately, before we know which direction the user is moving,
  // which blocks native scrolling entirely (this is what made scrolling long
  // lists like Recent Catches feel broken/unresponsive). Instead we watch
  // the first bit of movement ourselves: if it's a clear pull downward while
  // already scrolled to the top, hand off to the sheet's drag; if it's
  // upward or the list isn't at the top, back off and let the browser
  // scroll normally.
  function startDragFromContent(e: ReactPointerEvent<HTMLDivElement>) {
    const startY = e.clientY;
    const pointerId = e.pointerId;

    function onMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      const deltaY = moveEvent.clientY - startY;
      if (Math.abs(deltaY) < 6) return;
      cleanup();
      if (deltaY > 0 && (contentRef.current?.scrollTop ?? 0) <= 0) {
        dragControls.start(moveEvent);
      }
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  }

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
              className="sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              drag="y"
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 500) onClose();
              }}
            >
              <div className="sheet-header" onPointerDown={(e) => dragControls.start(e)}>
                <div className="sheet-handle" />
              </div>
              <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
                ✕
              </button>
              <div className="sheet-content" ref={contentRef} onPointerDown={startDragFromContent}>
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
