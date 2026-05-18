/**
 * A single polaroid in the stack — pure presentational shell with no
 * gesture logic of its own. The parent (`PolaroidStack`) is responsible
 * for binding drag/tap handlers to the top card; this component just
 * renders the polaroid look + the LQIP blur-up and exposes a
 * `layoutId` on the image for the shared-element transition into
 * `Profile.tsx`.
 *
 * Why React.memo with a hand-written equality check: motion's
 * `style.rotate` motion-value reference is stable across renders of
 * the same top card, but the parent stack re-renders every time the
 * deck advances (which would otherwise re-render every visible
 * polaroid). The custom comparator scopes the re-render to changes
 * that actually affect the rendered tree.
 *
 * Visual details locked in the spec:
 *   - White frame: `bg-white p-4 pb-10` (16px border on top/L/R, 44px
 *     caption strip on the bottom).
 *   - Image: square `aspect-square` inside `overflow-hidden`. Falls
 *     back to a neutral-200 swatch if `url` is null.
 *   - Author overlay (avatar + name) sits top-left of the image and
 *     is ONLY visible on the top card — peeked cards are deliberately
 *     anonymous so the eye is drawn to the active card.
 *   - LQIP `thumbDataUrl` is rendered as a background image on the
 *     `<img>`'s parent so the blur-up is instant; the full `<img>`
 *     fades in via opacity on its `onLoad` event.
 */
import { memo, useState } from "react";
import { motion } from "motion/react";
import { format } from "date-fns";
import type { FeedPost } from "@/hooks/community/useGymFeed";

interface PolaroidCardProps {
  post: FeedPost;
  /** 0 = top card, 1 = middle, 2 = bottom. Drives z-index + offsets. */
  stackPosition: 0 | 1 | 2;
  /** True when this card is the top of the stack (gesture-bound). */
  isTop: boolean;
  /** Deterministic per-card rotation from the parent (post-id hash). */
  rotationDeg: number;
  /** Long-press the author overlay → enter profile. Wired by parent so
   *  the same handler can also intercept tap-vs-long-press in one place. */
  onAuthorLongPress?: () => void;
}

// Position table — same numbers as `StackSkeleton`. Kept duplicated
// rather than imported because the skeleton's positions are purely
// visual and may drift from the live stack's behaviour later.
const STACK_OFFSETS: Record<0 | 1 | 2, { scale: number; y: number; opacity: number; z: number }> = {
  0: { scale: 1, y: 0, opacity: 1, z: 30 },
  1: { scale: 0.96, y: 10, opacity: 0.7, z: 20 },
  2: { scale: 0.92, y: 20, opacity: 0.4, z: 10 },
};

function PolaroidCardBase({
  post,
  stackPosition,
  isTop,
  rotationDeg,
  onAuthorLongPress,
}: PolaroidCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const offsets = STACK_OFFSETS[stackPosition];

  // For non-top cards, we bake the rotation into the static layout
  // value so they don't compete with the top card's live drag rotate.
  // The top card's rotation is owned by the parent stack (rotate
  // motion value bound on the wrapping motion.div).
  const staticTransform = isTop
    ? undefined
    : {
        scale: offsets.scale,
        y: offsets.y,
        opacity: offsets.opacity,
        rotate: rotationDeg,
      };

  return (
    <motion.div
      className={`absolute inset-0 ${isTop ? "" : "pointer-events-none"}`}
      style={{ zIndex: offsets.z }}
      animate={staticTransform}
      transition={{ type: "spring", stiffness: 220, damping: 28, mass: 1 }}
    >
      <div className="bg-white p-4 pb-10 rounded-sm shadow-2xl select-none">
        {/* Image well */}
        <div className="relative aspect-square overflow-hidden bg-neutral-200">
          {/* LQIP backdrop — visible until the full image loads. */}
          {post.thumbDataUrl && (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${post.thumbDataUrl})`,
                filter: "blur(12px)",
                transform: "scale(1.1)", // hide blur edges
              }}
            />
          )}

          {post.url ? (
            <motion.img
              // Shared-element transition target: only bind layoutId on
              // the top card. Binding it on all three cards triggers
              // framer's shared-layout measurement pipeline every render
              // (perf P0 — flagged 2026-05-18). The grid → polaroid
              // back-nav still works because the destination card is
              // always the top of the stack at restore time.
              layoutId={isTop ? `post-${post.id}-image` : undefined}
              // For the top card we load the full-res image immediately.
              // For background cards (positions 1/2) the 256-px thumb is
              // visually indistinguishable at their scale — use it when
              // available so the initial network cost is ~70% lower. Fall
              // back to the full URL when thumbUrl is absent.
              src={isTop ? post.url : (post.thumbUrl ?? post.url)}
              alt={post.caption ?? "Training media"}
              draggable={false}
              onLoad={() => setImgLoaded(true)}
              loading={isTop ? "eager" : "lazy"}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
              style={{ opacity: imgLoaded ? 1 : 0 }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-xs">
              Media unavailable
            </div>
          )}

          {/* Author overlay — top card only. The pointer-events scope
              lets the parent stack absorb drag/tap on the rest of the
              card while still routing long-press here. */}
          {isTop && (
            <button
              type="button"
              aria-label={`View ${post.author.displayName}'s profile`}
              className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40 backdrop-blur-md"
              // Suppress click so the polaroid's tap-to-flick doesn't fire.
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => {
                e.preventDefault();
                onAuthorLongPress?.();
              }}
            >
              {post.author.avatarUrl ? (
                <img
                  src={post.author.avatarUrl}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover ring-1 ring-white/40"
                />
              ) : (
                <div className="h-5 w-5 rounded-full bg-white/30 flex items-center justify-center text-[10px] font-bold text-white">
                  {post.author.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="text-[11px] font-medium text-white">
                {post.author.displayName}
              </span>
            </button>
          )}
        </div>

        {/* Caption strip — 44px bottom region of the polaroid. The
            spec leans on date + relative time only; the session
            metadata + caption belong on the info-card below. */}
        <div className="h-7 flex items-center justify-center text-[11px] text-neutral-700 tabular-nums tracking-wide">
          {formatPolaroidDate(post.createdAt)}
        </div>
      </div>
    </motion.div>
  );
}

/** Custom equality — only re-render when the visible bits change.
 *  This is the hot path while the stack animates, so dropping refs
 *  (`onAuthorLongPress`) from the compare is worth it. */
function areEqual(prev: PolaroidCardProps, next: PolaroidCardProps): boolean {
  return (
    prev.post.id === next.post.id &&
    prev.isTop === next.isTop &&
    prev.stackPosition === next.stackPosition &&
    prev.rotationDeg === next.rotationDeg &&
    // url + thumb can mutate while the post stays the same id (Convex
    // re-hydration on the storage URL). Compare so we trigger the
    // fade-in animation when the real image arrives.
    prev.post.url === next.post.url &&
    prev.post.thumbUrl === next.post.thumbUrl &&
    prev.post.thumbDataUrl === next.post.thumbDataUrl
  );
}

export const PolaroidCard = memo(PolaroidCardBase, areEqual);

/* ─── caption helpers ─── */

function formatPolaroidDate(epochMs: number): string {
  try {
    return format(new Date(epochMs), "MMM d · h:mm a");
  } catch {
    return "";
  }
}
