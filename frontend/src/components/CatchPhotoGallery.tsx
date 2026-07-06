import { animate, motion, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../api/client";
import type { CatchPhoto } from "../api/types";

interface CatchPhotoGalleryProps {
  photos: CatchPhoto[];
  alt?: string;
}

const SPRING = { type: "spring" as const, damping: 32, stiffness: 320 };
const SWIPE_THRESHOLD = 60;

/** Instagram-style horizontal swipe-through gallery for a catch's photos.
 * Falls back to a single plain <img> (no drag machinery) when there's only
 * one photo, and renders nothing when there are none. */
export default function CatchPhotoGallery({ photos, alt = "" }: CatchPhotoGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);

  // Snap back to the first photo whenever the photo set changes — e.g. a
  // different catch's detail sheet opens — instead of keeping a stale index.
  useEffect(() => {
    setIndex(0);
    x.set(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  // Track the container's width via ResizeObserver rather than reading
  // offsetWidth ad hoc — feeds both the numeric drag constraints below and
  // the goTo()/onDragEnd snap targets, so they're never out of sync.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.offsetWidth);
    return () => observer.disconnect();
  }, []);

  if (photos.length === 0) return null;

  if (photos.length === 1) {
    return <img className="catch-photo" src={`${API_BASE}${photos[0].photo_url}`} alt={alt} />;
  }

  function goTo(next: number) {
    const clamped = Math.max(0, Math.min(photos.length - 1, next));
    setIndex(clamped);
    animate(x, -clamped * width, SPRING);
  }

  return (
    <div className="catch-photo-gallery" ref={containerRef}>
      <motion.div
        className="catch-photo-gallery-track"
        style={{ x }}
        drag="x"
        // A numeric range instead of a ref: dragConstraints={containerRef}
        // re-measures against the live (transform-adjusted) DOM rect on every
        // drag, which fights with the imperative animate() calls in goTo()
        // and produced a broken snap when returning to earlier photos.
        dragConstraints={{ left: -(photos.length - 1) * width, right: 0 }}
        dragElastic={0.15}
        onDragEnd={(_, info) => {
          if (info.offset.x < -SWIPE_THRESHOLD && index < photos.length - 1) {
            goTo(index + 1);
          } else if (info.offset.x > SWIPE_THRESHOLD && index > 0) {
            goTo(index - 1);
          } else {
            animate(x, -index * width, SPRING);
          }
        }}
      >
        {photos.map((p) => (
          <img key={p.id} className="catch-photo catch-photo-gallery-item" src={`${API_BASE}${p.photo_url}`} alt={alt} />
        ))}
      </motion.div>
      <div className="catch-photo-gallery-dots">
        {photos.map((p, i) => (
          <span key={p.id} className={`catch-photo-gallery-dot${i === index ? " active" : ""}`} />
        ))}
      </div>
    </div>
  );
}
