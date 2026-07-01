import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useEffect } from "react";
import type { ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const dragControls = useDragControls();

  // Without this, the page has no scroll container of its own (it scrolls
  // via the document body), so a drag that starts anywhere over the sheet's
  // backdrop — not exactly on the drag handle — falls through and scrolls
  // the Dex/list content behind it instead of moving the sheet. Locking body
  // scroll while any sheet is open (with the iOS rubber-band-safe
  // position:fixed technique) stops that regardless of where the drag lands.
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
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100) onClose();
              }}
            >
              <div
                className="sheet-handle"
                onPointerDown={(e) => dragControls.start(e)}
                style={{ touchAction: "none" }}
              />
              <div className="sheet-content">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
