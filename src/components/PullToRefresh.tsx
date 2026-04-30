import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { getPullRefreshHandler } from "@/lib/pullRefreshRegistry";

const THRESHOLD = 80;
const HOLD_DURATION = 200;

export function PullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const startY = useRef(0);
  const pulling = useRef(false);
  const holdStart = useRef<number | null>(null);
  const holdRaf = useRef<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const getMain = useCallback(() => document.querySelector("main"), []);

  useEffect(() => {
    const main = getMain();
    if (!main) return;

    const clearHold = () => {
      holdStart.current = null;
      if (holdRaf.current !== null) {
        cancelAnimationFrame(holdRaf.current);
        holdRaf.current = null;
      }
      if (holdTimer.current !== null) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      setHoldProgress(0);
    };

    const tickHold = () => {
      if (holdStart.current === null) return;
      const elapsed = Date.now() - holdStart.current;
      setHoldProgress(Math.min(elapsed / HOLD_DURATION, 1));
      if (elapsed < HOLD_DURATION) {
        holdRaf.current = requestAnimationFrame(tickHold);
      }
    };

    const triggerRefresh = () => {
      pulling.current = false;
      clearHold();
      setRefreshing(true);
      setPullDistance(THRESHOLD * 0.6);
      triggerHaptic(ImpactStyle.Medium);
      const handler = getPullRefreshHandler();
      if (handler) {
        // Soft refresh: invoke the registered handler, then collapse the
        // spinner. Falls back to reload if the handler throws.
        Promise.resolve()
          .then(() => handler())
          .catch(() => window.location.reload())
          .finally(() => {
            setTimeout(() => {
              setRefreshing(false);
              setPullDistance(0);
            }, 250);
          });
      } else {
        setTimeout(() => window.location.reload(), 300);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (main.scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return;
      if (main.scrollTop > 0) {
        pulling.current = false;
        setPullDistance(0);
        clearHold();
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) {
        const dampened = Math.min(dy * 0.4, THRESHOLD * 1.5);
        setPullDistance(dampened);
        if (dampened >= THRESHOLD) {
          if (holdStart.current === null) {
            holdStart.current = Date.now();
            triggerHaptic(ImpactStyle.Light);
            holdRaf.current = requestAnimationFrame(tickHold);
            holdTimer.current = window.setTimeout(triggerRefresh, HOLD_DURATION);
          }
        } else if (holdStart.current !== null) {
          clearHold();
        }
      }
    };

    const onTouchEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;
      clearHold();
      setPullDistance(0);
    };

    main.addEventListener("touchstart", onTouchStart, { passive: true });
    main.addEventListener("touchmove", onTouchMove, { passive: true });
    main.addEventListener("touchend", onTouchEnd, { passive: true });
    main.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      main.removeEventListener("touchstart", onTouchStart);
      main.removeEventListener("touchmove", onTouchMove);
      main.removeEventListener("touchend", onTouchEnd);
      main.removeEventListener("touchcancel", onTouchEnd);
      clearHold();
    };
  }, [refreshing, getMain]);

  if (pullDistance <= 0 && !refreshing) return null;

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const atThreshold = progress >= 1;
  const spinnerProgress = atThreshold ? holdProgress : progress;

  return (
    <div
      className="flex flex-col items-center justify-center w-full pointer-events-none md:hidden"
      style={{
        height: `${pullDistance}px`,
        transition: pulling.current ? "none" : "height 0.3s ease-out",
        overflow: "hidden",
      }}
    >
      <div
        className="h-8 w-8 rounded-full bg-muted/80 border border-border/50 flex items-center justify-center"
        style={{
          opacity: Math.max(0.3, progress),
          transform: `scale(${0.6 + progress * 0.4})`,
          transition: pulling.current ? "none" : "all 0.3s ease-out",
        }}
      >
        <RefreshCw
          className={`h-4 w-4 text-muted-foreground ${refreshing ? "animate-spin" : ""}`}
          style={{ transform: refreshing ? undefined : `rotate(${spinnerProgress * 360}deg)` }}
        />
      </div>
      {atThreshold && !refreshing && (
        <span className="text-[10px] text-muted-foreground/60 mt-1">
          {holdProgress >= 1 ? "Refreshing…" : "Hold to refresh"}
        </span>
      )}
    </div>
  );
}
