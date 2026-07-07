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
  // offsetWidth ad hoc — feeds both the drag clamping below and the goTo()
  // snap targets, so they're never out of sync.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.offsetWidth);
    return () => observer.disconnect();
  }, []);

  function goTo(next: number) {
    const clamped = Math.max(0, Math.min(photos.length - 1, next));
    setIndex(clamped);
    animate(x, -clamped * width, SPRING);
  }

  // Mirrors BottomSheet's / PullToRefresh's touch-handling approach — raw
  // non-passive touchmove rather than Framer's pointer-based `drag`, since
  // only that can reliably preventDefault() the browser's own vertical
  // scroll once a gesture is confirmed horizontal. Framer's drag="x" relies
  // on the CSS touch-action it sets (pan-y) to arbitrate the two axes, but
  // touch-action is decided by the compositor before any JS runs, so a
  // diagonal swipe could start scrolling the page natively before Framer's
  // JS ever got a chance to claim it — that's the page-scroll-fights-swipe
  // bug this replaces. Deciding the axis ourselves in the first few pixels
  // (same 4px threshold BottomSheet/PullToRefresh use) and only then calling
  // preventDefault keeps horizontal swipes clean without losing the ability
  // to scroll the sheet from on top of a photo (an earlier attempt at this
  // fix set `touch-action: none` on the track, which does stop the wobble
  // but also blocks all native scrolling starting from a photo, including
  // an ordinary "scroll down to read the comments" swipe — this doesn't).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || photos.length <= 1) return;

    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let phase: "pending" | "dragging" | "scrolling" = "pending";

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      baseX = x.get();
      phase = "pending";
    }

    function onTouchMove(e: TouchEvent) {
      const deltaX = e.touches[0].clientX - startX;
      const deltaY = e.touches[0].clientY - startY;

      if (phase === "pending") {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 4) return;
        phase = Math.abs(deltaX) > Math.abs(deltaY) ? "dragging" : "scrolling";
      }

      if (phase === "dragging") {
        e.preventDefault();
        const min = -(photos.length - 1) * width;
        const raw = baseX + deltaX;
        // Rubber-band past either end instead of hard-stopping.
        const clamped = raw > 0 ? raw * 0.3 : raw < min ? min + (raw - min) * 0.3 : raw;
        x.set(clamped);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (phase === "dragging") {
        const endX = e.changedTouches[0]?.clientX ?? startX;
        const deltaX = endX - startX;
        if (deltaX < -SWIPE_THRESHOLD && index < photos.length - 1) {
          goTo(index + 1);
        } else if (deltaX > SWIPE_THRESHOLD && index > 0) {
          goTo(index - 1);
        } else {
          animate(x, -index * width, SPRING);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length, width, index]);

  if (photos.length === 0) return null;

  if (photos.length === 1) {
    return <img className="catch-photo" src={`${API_BASE}${photos[0].photo_url}`} alt={alt} />;
  }

  return (
    <div className="catch-photo-gallery" ref={containerRef}>
      <motion.div className="catch-photo-gallery-track" style={{ x }}>
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
