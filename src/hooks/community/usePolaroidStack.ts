/**
 * Stack state machine for the polaroid deck.
 *
 * Two responsibilities the page-level component shouldn't have to know
 * about:
 *
 *   1. Persist `topIndex` to `sessionStorage` so a round-trip into a
 *      profile (or any modal that unmounts the Community page) restores
 *      the deck to the same card on return. We deliberately use
 *      `sessionStorage` — `localStorage` would resurrect a stale
 *      mid-deck position days later, after the underlying feed has
 *      churned, leaving the user stranded mid-stack with no context.
 *
 *   2. Expose the drag primitives (`useDragControls`, the x/y motion
 *      values, and the live `rotate` transform) so the top card binds
 *      directly without redoing the math in two places.
 *
 * The threshold logic + flick animation live in `PolaroidStack` itself —
 * the hook here is purely state + plumbing. Splitting it any further
 * would just be ceremony.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useDragControls, useMotionValue, useTransform } from "motion/react";

const STORAGE_KEY = "wcw:community:topIndex";

interface UsePolaroidStackOptions {
  /** Total post count — restore is gated on `stored < postCount` so a
   *  shrinking feed doesn't strand the user past the end. */
  postCount: number;
}

export interface UsePolaroidStackResult {
  topIndex: number;
  setTopIndex: (n: number) => void;
  /** Advance to the next card. Use this instead of `setTopIndex(i + 1)`
   *  so the hook can persist the new position synchronously. */
  advance: () => void;
  /** Reset to the beginning of the deck (e.g. on pull-to-refresh). */
  reset: () => void;
  dragControls: ReturnType<typeof useDragControls>;
  x: ReturnType<typeof useMotionValue<number>>;
  y: ReturnType<typeof useMotionValue<number>>;
  /** Live rotation in degrees, driven by x. Bound directly to the top
   *  card's `style.rotate`. */
  rotate: ReturnType<typeof useTransform<number, number>>;
}

export function usePolaroidStack({
  postCount,
}: UsePolaroidStackOptions): UsePolaroidStackResult {
  // Pull the persisted index synchronously on mount. We can't read
  // `sessionStorage` in a useEffect AND start the deck at the right
  // card on first paint — the read has to happen during render init.
  // Wrapping in `useRef` keeps the lazy init from re-running on every
  // re-render.
  const initialIndexRef = useRef<number | null>(null);
  if (initialIndexRef.current === null) {
    initialIndexRef.current = readPersistedIndex();
  }

  const [topIndex, setTopIndexState] = useState<number>(initialIndexRef.current);

  // If the stored index is past the end of the (newly-loaded) feed,
  // snap back to 0 so the user sees the freshest post instead of an
  // empty state. This runs once after the first non-zero `postCount`
  // arrives.
  const settledRef = useRef(false);
  useEffect(() => {
    if (settledRef.current) return;
    if (postCount === 0) return;
    if (topIndex >= postCount) {
      setTopIndexState(0);
      writePersistedIndex(0);
    }
    settledRef.current = true;
  }, [postCount, topIndex]);

  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // Spec: live rotation maps [-200, 0, 200] → [-18°, 0°, 18°]. Clamping
  // happens at motion's boundary — anything beyond ±200 stays at the
  // last mapped value, which feels right when the user is mid-flick.
  const rotate = useTransform(x, [-200, 0, 200], [-18, 0, 18]);

  const setTopIndex = useCallback((n: number) => {
    setTopIndexState(n);
    writePersistedIndex(n);
  }, []);

  const advance = useCallback(() => {
    setTopIndexState((prev) => {
      const next = prev + 1;
      writePersistedIndex(next);
      return next;
    });
    // Reset the motion values so the NEW top card starts at rest.
    // Without this, the next card inherits the flicked-card's x and
    // pops into view mid-rotation.
    x.set(0);
    y.set(0);
  }, [x, y]);

  const reset = useCallback(() => {
    setTopIndexState(0);
    writePersistedIndex(0);
    x.set(0);
    y.set(0);
  }, [x, y]);

  return {
    topIndex,
    setTopIndex,
    advance,
    reset,
    dragControls,
    x,
    y,
    rotate,
  };
}

/* ─── sessionStorage helpers ─── */

function readPersistedIndex(): number {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  } catch {
    // Private mode / disabled storage — start fresh.
    return 0;
  }
}

function writePersistedIndex(n: number): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(n));
  } catch {
    /* ignore */
  }
}
