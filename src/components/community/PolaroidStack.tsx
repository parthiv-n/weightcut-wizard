/**
 * PolaroidStack — the centerpiece of the Corner tab.
 *
 * Renders exactly the top 3 cards from `posts.slice(topIndex)` and
 * binds drag / tap / double-tap / long-press to the topmost one. The
 * stack physics + gesture thresholds are spec-locked:
 *
 *   - Card stack: top {scale 1, opacity 1, rot from hash}, second
 *     {scale 0.96, opacity 0.7, y+10}, third {scale 0.92, opacity 0.4,
 *     y+20}. Rotations are deterministic per-card via a tiny string
 *     hash so the deck looks intentional, not random.
 *   - Springs: damping 18, stiffness 220, mass 0.9 (resting position).
 *     Snap-back on insufficient flick: damping 30 (firmer).
 *   - Flick trigger: |offset.x| > 120px OR |velocity.x| > 600. Below
 *     that, snap back to centre.
 *   - Exit animation: x → dir * vw * 1.4, rotate ±30°, opacity 0, 350ms.
 *   - Tap-to-flick: random direction ±vw*1.4, same physics. Single
 *     tap on a card → flick; double-tap → glove burst (like, card
 *     stays).
 *
 * Why we DON'T use AnimatePresence keyed on `topIndex`:
 *   AnimatePresence's "exit" treatment would also try to animate the
 *   second/third cards moving up a layer — but those are still
 *   visible in the new render. The result is a flash of double-rendered
 *   cards. We hand-roll the exit via `exitingPostId` state so only the
 *   flicked card animates off and the rest snap into their new
 *   positions naturally via the layout offsets.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform, useDragControls, useReducedMotion, type PanInfo } from "motion/react";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { useDoubleTap } from "@/hooks/useDoubleTap";
import { PolaroidCard } from "./PolaroidCard";
import { EmptyStackState } from "./EmptyStackState";
import type { FeedPost, FeedStatus } from "@/hooks/community/useGymFeed";
import type { Id } from "../../../convex/_generated/dataModel";

const STACK_DEPTH = 3;
const FLICK_OFFSET_PX = 120;
const FLICK_VELOCITY = 600;
const EXIT_DURATION_MS = 240;
const REDUCED_EXIT_DURATION_MS = 100;
const PREFETCH_TRIGGER = 5; // load more when within N cards of end

// iOS-pop-tier spring for the fling exit. Stiff + low mass = snappy start.
const EXIT_SPRING = { type: "spring", stiffness: 520, damping: 36, mass: 0.7 } as const;
// Snap-back spring when a drag is released below the flick threshold.
const SNAPBACK_SPRING = { type: "spring", stiffness: 600, damping: 32, mass: 0.6 } as const;
// Softer spring for the card behind rising to top position.
const SETTLE_SPRING = { type: "spring", stiffness: 220, damping: 28, mass: 1 } as const;

interface PolaroidStackProps {
  posts: FeedPost[];
  status: FeedStatus;
  loadMore: () => void;
  /** Fires whenever the top card changes — drives the SessionInfoCard. */
  onIndexChange: (index: number) => void;
  /** Long-press on the author chip OR explicit profile request. */
  onOpenProfile: (userId: Id<"users">) => void;
  /** Double-tap → record like. Called by the parent so the session
   *  info card's `useFeedEngagement` instance owns the optimistic state. */
  onDoubleTapLike: (post: FeedPost) => void;
  /** "Share a session" CTA when stack is exhausted. */
  onPostClick: () => void;
  /** Current top index (controlled by parent so SessionInfoCard sees it). */
  topIndex: number;
  /** Advance the deck — owned by the parent hook so sessionStorage stays
   *  in sync. */
  advance: () => void;
  /** Called with the post id the moment a swipe commits (before advance).
   *  Use this to fire markPostViewed or any other side-effect. */
  onSwipeCommit?: (postId: Id<"session_media">) => void;
}

interface GloveBurst {
  id: number;
  x: number;
  y: number;
}

export function PolaroidStack({
  posts,
  status,
  loadMore,
  onIndexChange,
  onOpenProfile,
  onDoubleTapLike,
  onPostClick,
  topIndex,
  advance,
  onSwipeCommit,
}: PolaroidStackProps) {
  const prefersReducedMotion = useReducedMotion();
  // Motion primitives for the top card. We instantiate them HERE rather
  // than reach into `usePolaroidStack` so the hook stays decoupled from
  // the stack's render tree (testable in isolation, can drive multiple
  // stacks later if needed).
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-18, 0, 18]);

  // Track which card is mid-flick so we render its exit animation
  // without unmounting the still-visible underneath cards.
  const [exitingPostId, setExitingPostId] = useState<Id<"session_media"> | null>(null);
  const exitDirRef = useRef<1 | -1>(1);
  // Capture release velocity so the exit target carries momentum past the edge.
  const exitVelocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });

  // Glove-tap delight burst layer. Multiple bursts can stack if the
  // user double-taps rapidly — each is keyed and self-removes.
  const [bursts, setBursts] = useState<GloveBurst[]>([]);
  const burstIdRef = useRef(0);

  // ── Stack slice ────────────────────────────────────────────────────
  // Always EXACTLY the next 3 cards (or fewer near the end). Slicing
  // keeps memory bounded — we never have more than 3 polaroid DOM
  // subtrees alive, regardless of how big the feed grows.
  const visible = useMemo(() => posts.slice(topIndex, topIndex + STACK_DEPTH), [posts, topIndex]);

  // Notify parent when the top index changes so the info-card binds
  // to the new top post.
  useEffect(() => {
    onIndexChange(topIndex);
  }, [topIndex, onIndexChange]);

  // ── Eager preload of the top 3 ─────────────────────────────────────
  // Hand-rolled rather than using `<link rel="preload">` because the
  // image URLs come from a reactive Convex query — we don't know them
  // until first paint, and we want the browser cache populated before
  // the user starts swiping.
  useEffect(() => {
    visible.forEach((post) => {
      if (!post.url) return;
      const img = new Image();
      img.src = post.url;
    });
  }, [visible]);

  // ── Pagination trigger ─────────────────────────────────────────────
  // When we're within `PREFETCH_TRIGGER` cards of the end and Convex
  // says more pages exist, fetch eagerly so the user never sees a
  // "loading more…" interstitial.
  useEffect(() => {
    if (status !== "CanLoadMore") return;
    if (posts.length - topIndex >= PREFETCH_TRIGGER) return;
    loadMore();
  }, [topIndex, posts.length, status, loadMore]);

  // ── Flick mechanics ────────────────────────────────────────────────
  const topPost = visible[0];

  const commitFlick = useCallback(
    (direction: 1 | -1, vx = 0, vy = 0) => {
      if (!topPost) return;
      exitDirRef.current = direction;
      exitVelocityRef.current = { vx, vy };
      // Fire the callback BEFORE advancing so parent's optimistic state
      // matches the in-flight animation.
      onSwipeCommit?.(topPost.id);
      setExitingPostId(topPost.id);
      triggerHaptic(ImpactStyle.Medium);

      // After the exit animation, advance the stack and reset motion
      // values so the next top card starts at rest. We schedule the
      // advance via setTimeout rather than `onAnimationComplete` so
      // the timing is deterministic even if motion re-evaluates the
      // animation prop mid-flight.
      const exitMs = prefersReducedMotion ? REDUCED_EXIT_DURATION_MS : EXIT_DURATION_MS;
      window.setTimeout(() => {
        setExitingPostId(null);
        x.set(0);
        y.set(0);
        advance();
      }, exitMs);
    },
    [topPost, advance, x, y, onSwipeCommit, prefersReducedMotion],
  );

  const handleDragEnd = useCallback(
    (_e: unknown, info: PanInfo) => {
      const dx = info.offset.x;
      const vx = info.velocity.x;
      const vy = info.velocity.y;
      const shouldFlick = Math.abs(dx) > FLICK_OFFSET_PX || Math.abs(vx) > FLICK_VELOCITY;
      if (shouldFlick) {
        commitFlick(dx > 0 ? 1 : -1, vx, vy);
      }
      // Below the flick threshold — spring the card smoothly back to
      // centre. `motion.set()` is synchronous, which makes the snap-back
      // visually instantaneous. Animating gives the gesture proper
      // weight without slowing the user down.
      else {
        animate(x, 0, SNAPBACK_SPRING);
        animate(y, 0, SNAPBACK_SPRING);
      }
    },
    [commitFlick, x, y],
  );

  // ── Glove-tap delight ──────────────────────────────────────────────
  const spawnBurst = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    // Convert to local coords relative to the card.
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const id = ++burstIdRef.current;
    setBursts((prev) => [...prev, { id, x: localX, y: localY }]);
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 520);
  }, []);

  // Combined tap handler — single tap (after the double-tap timer
  // resolves) flicks; double tap fires the glove burst and like.
  const lastTapCoords = useRef<{ clientX: number; clientY: number; rect: DOMRect } | null>(null);

  const doubleTap = useDoubleTap({
    onSingleTap: () => {
      // Tap-to-flick: random direction so consecutive taps don't all
      // pile up on the same side. No real velocity for a tap so pass 0.
      if (!topPost || exitingPostId) return;
      const dir = Math.random() > 0.5 ? 1 : -1;
      commitFlick(dir, 0, 0);
    },
    onDoubleTap: () => {
      if (!topPost) return;
      const coords = lastTapCoords.current;
      if (coords) {
        spawnBurst(coords.clientX, coords.clientY, coords.rect);
      }
      onDoubleTapLike(topPost);
    },
  });

  const handleCardClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      lastTapCoords.current = { clientX: e.clientX, clientY: e.clientY, rect };
      doubleTap();
    },
    [doubleTap],
  );

  // ── Empty state ────────────────────────────────────────────────────
  if (visible.length === 0) {
    return <EmptyStackState onPostClick={onPostClick} />;
  }

  return (
    <div className="relative mx-auto" style={{ width: 312, height: 396 }}>
      {visible.map((post, idx) => {
        const stackPos = idx as 0 | 1 | 2;
        const isTop = idx === 0 && exitingPostId !== post.id;
        const isExiting = exitingPostId === post.id;
        const rotationDeg = computeRotation(post.id);

        if (isExiting) {
          // The flicked card animates off-screen via explicit `animate`.
          // Exit target is a function of the release direction + velocity
          // so the card carries momentum past the screen edge rather than
          // jumping to a fixed offset.
          const dir = exitDirRef.current;
          const { vx, vy } = exitVelocityRef.current;
          // Base exit: 140% of vw. Scale by velocity (clamped) so a fast
          // flick carries further — max 1.8× vw, min 1.4× vw.
          const velocityBoost = Math.min(Math.abs(vx) / 1200, 0.4);
          const exitX = dir * window.innerWidth * (1.4 + velocityBoost);
          // Y carry-through: preserve vertical velocity direction + scale.
          const exitY = vy * 0.3;
          // Rotation deepens with direction; reduced-motion path skips rotation.
          const exitRotate = prefersReducedMotion ? rotationDeg : dir * 18;

          if (prefersReducedMotion) {
            // Reduced-motion: short fade, no rotation change.
            return (
              <motion.div
                key={post.id}
                className="absolute inset-0"
                style={{ zIndex: 40 }}
                initial={{ x: x.get(), y: y.get(), rotate: rotationDeg, opacity: 1 }}
                animate={{ x: exitX, y: exitY, rotate: exitRotate, opacity: 0 }}
                transition={{ duration: REDUCED_EXIT_DURATION_MS / 1000, ease: "linear" }}
              >
                <PolaroidCard post={post} stackPosition={0} isTop rotationDeg={rotationDeg} />
              </motion.div>
            );
          }

          return (
            <motion.div
              key={post.id}
              className="absolute inset-0"
              style={{ zIndex: 40 }}
              initial={{ x: x.get(), y: y.get(), rotate: rotate.get(), opacity: 1 }}
              animate={{ x: exitX, y: exitY, rotate: exitRotate, opacity: 0 }}
              transition={{
                x: EXIT_SPRING,
                y: EXIT_SPRING,
                rotate: EXIT_SPRING,
                // Opacity fades only in the last 40% of travel — achieved via
                // a delay that equals 60% of the expected spring settling time.
                opacity: { delay: 0.13, duration: 0.18, ease: "easeIn" },
              }}
            >
              <PolaroidCard
                post={post}
                stackPosition={0}
                isTop
                rotationDeg={rotationDeg}
              />
            </motion.div>
          );
        }

        if (isTop) {
          // The top card is the only one that listens to drag + tap.
          // Wrap it in a motion.div that owns the drag transform; the
          // inner PolaroidCard renders the visual frame.
          return (
            <motion.div
              key={post.id}
              className="absolute inset-0 touch-none"
              style={{ x, y, rotate, zIndex: 30 }}
              drag="x"
              dragControls={dragControls}
              dragElastic={0.55}
              dragMomentum={false}
              onDragEnd={handleDragEnd}
              onClick={handleCardClick}
            >
              <PolaroidCard
                post={post}
                stackPosition={0}
                isTop
                rotationDeg={rotationDeg}
                onAuthorLongPress={() => onOpenProfile(post.author.userId)}
              />

              {/* Glove-tap burst layer — local to the top card so the
                  SVG explodes from the tap point in the polaroid's
                  own coordinate space. */}
              {bursts.map((b) => (
                <GloveBurst key={b.id} x={b.x} y={b.y} />
              ))}
            </motion.div>
          );
        }

        // Background cards — static layout per stack position. No
        // gesture wiring, no pointer events (the card sets
        // `pointer-events-none` when not top).
        return (
          <PolaroidCard
            key={post.id}
            post={post}
            stackPosition={stackPos}
            isTop={false}
            rotationDeg={rotationDeg}
          />
        );
      })}
    </div>
  );
}

/* ─── Glove-tap burst ─── */

// 64px filled-red boxing-glove SVG. Inlined (rather than emoji) so the
// glyph renders identically on every iOS / Android / WebKit version —
// emoji rendering varies wildly across platforms, and the brand wants
// a known shape. Kept simple: silhouette of a glove with wrist cuff.
const BoxingGloveSvg = memo(function BoxingGloveSvg({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Main glove body */}
      <path
        d="M14 22c0-7.18 5.82-13 13-13h6c7.73 0 14 6.27 14 14v9c0 9.94-8.06 18-18 18h-2c-7.18 0-13-5.82-13-13V22z"
        fill="#DC2626"
      />
      {/* Thumb pocket */}
      <path
        d="M12 26c0-3.31 2.69-6 6-6h2v12h-2c-3.31 0-6-2.69-6-6z"
        fill="#B91C1C"
      />
      {/* Wrist cuff */}
      <rect x="16" y="48" width="28" height="8" rx="2" fill="#7F1D1D" />
      {/* Highlight stitch */}
      <path
        d="M22 24c2.5-2 6-3 10-3"
        stroke="#FCA5A5"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
});

const GloveBurst = memo(function GloveBurst({ x, y }: { x: number; y: number }) {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute select-none"
      style={{ left: x, top: y, translateX: "-50%", translateY: "-50%" }}
      initial={{ scale: 0.6, rotate: 0, opacity: 1 }}
      animate={{ scale: 1.4, rotate: 12, opacity: 0 }}
      transition={{ duration: 0.48, ease: [0.32, 0.72, 0, 1] }}
    >
      {/* Red boxing glove SVG. Combat-sports vernacular co-signs the
          work — heavier than a heart, lighter than a "post". */}
      <BoxingGloveSvg size={64} />
    </motion.div>
  );
});

/* ─── Deterministic per-card rotation ─── */

/** Tiny stable string hash (djb2). Stable across reloads so a card's
 *  rotation doesn't shift mid-session, which would look jittery. */
function hashId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h) ^ id.charCodeAt(i);
  }
  // Force positive int.
  return Math.abs(h);
}

/** Map a post id → a stable rotation in [-2.4°, 2.4°] stepped by 1.2°.
 *  Spec: ((hash % 5) - 2) * 1.2 — gives a 5-step "scatter" that reads
 *  as a real polaroid stack rather than a perfect alignment. */
function computeRotation(id: string): number {
  return ((hashId(id) % 5) - 2) * 1.2;
}
