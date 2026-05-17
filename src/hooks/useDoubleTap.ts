/**
 * Distinguishes a deliberate single-tap from a double-tap on a target
 * element. Used by the gym-feed swiper so that:
 *   - single tap on a video post → toggle mute (existing behaviour)
 *   - double tap on any post → like (TikTok / IG signature gesture)
 *
 * We could rely on browser `dblclick` but it fires AFTER a 300ms wait
 * even on touch devices that have no `dblclick` semantics. This hook
 * uses a short timeout (~280ms) that gets cancelled when the second
 * tap arrives, then dispatches single OR double based on the outcome.
 *
 * The 100ms guard rejects fat-finger double-fires from a single tap.
 */
import { useCallback, useRef } from "react";

interface UseDoubleTapOptions {
  onSingleTap?: () => void;
  onDoubleTap: () => void;
  /** Max ms between the two taps to count as a double. Default 280ms. */
  delay?: number;
  /** Min ms — taps closer than this are treated as one (debounce). Default 60ms. */
  minDelay?: number;
}

export function useDoubleTap({
  onSingleTap,
  onDoubleTap,
  delay = 280,
  minDelay = 60,
}: UseDoubleTapOptions) {
  const lastTapAtRef = useRef(0);
  const singleTapTimerRef = useRef<number | null>(null);

  return useCallback(() => {
    const now = Date.now();
    const gap = now - lastTapAtRef.current;

    if (gap < minDelay) {
      // Debounce: two events too close together — treat as one tap.
      return;
    }

    if (gap < delay) {
      // Second tap arrived in time → it's a double-tap. Cancel the
      // pending single-tap dispatch.
      if (singleTapTimerRef.current != null) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapAtRef.current = 0;
      onDoubleTap();
      return;
    }

    // First tap — schedule the single-tap callback. It runs only if no
    // second tap arrives within `delay`.
    lastTapAtRef.current = now;
    if (singleTapTimerRef.current != null) {
      window.clearTimeout(singleTapTimerRef.current);
    }
    singleTapTimerRef.current = window.setTimeout(() => {
      singleTapTimerRef.current = null;
      onSingleTap?.();
    }, delay);
  }, [onSingleTap, onDoubleTap, delay, minDelay]);
}
