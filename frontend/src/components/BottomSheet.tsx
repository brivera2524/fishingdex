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
  // always start a drag. The scrollable body can too, but only once it's
  // already scrolled to the top — otherwise a pull-down there just scrolls
  // the list, the same way a native iOS/Android sheet behaves. Because
  // dragListener is off, Framer never starts a drag on its own; it only
  // starts here, and a plain tap (no real movement) still passes through to
  // whatever's underneath, so list items stay tappable.
  function startDragFromContent(e: ReactPointerEvent) {
    if ((contentRef.current?.scrollTop ?? 0) <= 0) {
      dragControls.start(e);
    }
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
