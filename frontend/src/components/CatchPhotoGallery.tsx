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
  const x = useMotionValue(0);

  // Snap back to the first photo whenever the photo set changes — e.g. a
  // different catch's detail sheet opens — instead of keeping a stale index.
  useEffect(() => {
    setIndex(0);
    x.set(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  if (photos.length === 0) return null;

  if (photos.length === 1) {
    return <img className="catch-photo" src={`${API_BASE}${photos[0].photo_url}`} alt={alt} />;
  }

  function goTo(next: number) {
    const clamped = Math.max(0, Math.min(photos.length - 1, next));
    setIndex(clamped);
    const width = containerRef.current?.offsetWidth ?? 0;
    animate(x, -clamped * width, SPRING);
  }

  return (
    <div className="catch-photo-gallery" ref={containerRef}>
      <motion.div
        className="catch-photo-gallery-track"
        style={{ x }}
        drag="x"
        dragConstraints={containerRef}
        dragElastic={0.15}
        onDragEnd={(_, info) => {
          const width = containerRef.current?.offsetWidth ?? 1;
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
