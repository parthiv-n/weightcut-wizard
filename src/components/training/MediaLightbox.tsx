/**
 * MediaLightbox — full-screen swipeable photo/video viewer.
 *
 * Used by:
 *  - SessionDetailDrawer: tap a thumbnail to view that session's media.
 *  - TrainingLibrary: tap a tile to view all media starting from that index.
 *
 * Interactions (mobile-first, all native gestures):
 *  - Swipe left / right → previous / next media (CSS scroll-snap).
 *  - Swipe DOWN > 80px → dismiss (matches iOS Photos behaviour).
 *  - Tap close button (top-right) → dismiss.
 *  - Videos pause when scrolled out of view (IntersectionObserver) so
 *    audio doesn't bleed between adjacent clips.
 *
 * Why scroll-snap rather than a touch-tracking pager:
 *  - iOS momentum + bounce is free.
 *  - Works inside the Capacitor WebView without a JS animation loop.
 *  - The vertical-dismiss listener is a separate touchmove handler on the
 *    container, so it doesn't fight the scroller's horizontal axis.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";

export interface LightboxItem {
  id: string;
  url: string | null;
  kind: "photo" | "video";
  caption?: string | null;
  capturedAt?: string;
  sessionType?: string | null;
}

interface Props {
  items: LightboxItem[];
  startIndex?: number;
  open: boolean;
  onClose: () => void;
  /** Optional delete handler — when provided, a small trash button shows
   *  on the active item. */
  onDelete?: (item: LightboxItem) => void;
}

const DISMISS_THRESHOLD_PX = 80;

export function MediaLightbox({
  items,
  startIndex = 0,
  open,
  onClose,
  onDelete,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(startIndex);
  // Track vertical drag for swipe-to-dismiss. We only track touchstart.y
  // and translate the whole container so the dismiss feels physical.
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  // Anchor scroll position to startIndex when the lightbox opens.
  useEffect(() => {
    if (!open) return;
    setActiveIndex(startIndex);
    setDragY(0);
    // Wait one frame so the items have laid out before scrolling.
    requestAnimationFrame(() => {
      const el = scrollerRef.current;
      const target = itemRefs.current[startIndex];
      if (!el || !target) return;
      el.scrollTo({ left: target.offsetLeft, behavior: "auto" });
    });
  }, [open, startIndex]);

  // Track which item is centred so the counter + caption can update.
  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < items.length; i++) {
      const node = itemRefs.current[i];
      if (!node) continue;
      const c = node.offsetLeft + node.offsetWidth / 2;
      const d = Math.abs(c - center);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx !== activeIndex) setActiveIndex(bestIdx);
  }, [activeIndex, items.length]);

  // Pause videos that are not the active slide so audio doesn't bleed.
  useEffect(() => {
    itemRefs.current.forEach((node, i) => {
      if (!node) return;
      const video = node.querySelector("video");
      if (!video) return;
      if (i === activeIndex) {
        // Don't autoplay — let the user tap. Just keep the controls live.
      } else {
        try {
          video.pause();
        } catch {
          /* ignore */
        }
      }
    });
  }, [activeIndex]);

  // ESC dismisses on web (Capacitor traps the back button at the OS level
  // and routes it through the React Router; this is a desktop courtesy).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Vertical-drag dismiss. We only commit the dismiss on touchend so a
  // shallow swipe can settle back to centre without tearing the scroll.
  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current == null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    // Only react to downward drags. Upward stays at 0 so we don't fight
    // any browser native pull-to-refresh.
    setDragY(Math.max(0, dy));
  };
  const onTouchEnd = () => {
    if (dragY > DISMISS_THRESHOLD_PX) {
      triggerHaptic(ImpactStyle.Light);
      onClose();
    } else {
      setDragY(0);
    }
    dragStartY.current = null;
  };

  if (!open || items.length === 0) return null;

  const active = items[activeIndex] ?? items[0];
  const opacity = Math.max(0.4, 1 - dragY / 600);

  return (
    <div
      className="fixed inset-0 z-[10001] bg-black flex flex-col touch-none"
      style={{
        opacity,
        transform: `translateY(${dragY}px)`,
        transition: dragY === 0 ? "transform 220ms ease, opacity 220ms ease" : "none",
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar */}
      <div
        className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="h-9 w-9 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center active:bg-white/25 transition-colors"
        >
          <X className="h-4 w-4 text-white" strokeWidth={2.4} />
        </button>
        <span className="text-[12px] font-medium text-white/80 tabular-nums">
          {activeIndex + 1} / {items.length}
        </span>
        {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(active)}
            aria-label="Delete media"
            className="h-9 w-9 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center active:bg-white/25 transition-colors text-rose-300"
          >
            <span className="text-[12px] font-semibold">Del</span>
          </button>
        ) : (
          <div className="h-9 w-9" />
        )}
      </div>

      {/* Pager */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex-1 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide touch-pan-x"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
      >
        {items.map((m, i) => (
          <div
            key={m.id}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            className="snap-center shrink-0 w-screen h-full flex items-center justify-center"
          >
            {!m.url ? (
              <div className="text-white/60 text-sm">Media unavailable</div>
            ) : m.kind === "video" ? (
              <video
                src={m.url}
                className="max-h-full max-w-full"
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={m.url}
                alt={m.caption ?? "Training media"}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            )}
          </div>
        ))}
      </div>

      {/* Bottom caption strip */}
      <div
        className="absolute bottom-0 inset-x-0 z-10 px-5 pb-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="flex items-center gap-2 text-white/80">
          {active.sessionType && (
            <span className="text-[10px] uppercase tracking-wider font-semibold bg-white/15 backdrop-blur-md px-2 py-0.5 rounded-full">
              {active.sessionType}
            </span>
          )}
          {active.capturedAt && (
            <span className="text-[12px] tabular-nums">
              {safeDate(active.capturedAt)}
            </span>
          )}
        </div>
        {active.caption && (
          <p className="mt-1.5 text-[14px] text-white leading-snug line-clamp-3">
            {active.caption}
          </p>
        )}
      </div>
    </div>
  );
}

function safeDate(iso: string): string {
  try {
    return format(parseISO(iso), "EEE, MMM d");
  } catch {
    return iso;
  }
}
