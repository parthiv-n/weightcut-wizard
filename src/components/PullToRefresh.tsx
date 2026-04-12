import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";

const THRESHOLD = 80;

export function PullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const getMain = useCallback(() => document.querySelector("main"), []);

  useEffect(() => {
    const main = getMain();
    if (!main) return;

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
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) {
        const dampened = Math.min(dy * 0.4, THRESHOLD * 1.5);
        setPullDistance(dampened);
      }
    };

    const onTouchEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;

      if (pullDistance >= THRESHOLD) {
        setRefreshing(true);
        setPullDistance(THRESHOLD * 0.6);
        triggerHaptic(ImpactStyle.Medium);
        // Hard refresh — reload the page like pressing the browser refresh button
        setTimeout(() => window.location.reload(), 300);
      } else {
        setPullDistance(0);
      }
    };

    main.addEventListener("touchstart", onTouchStart, { passive: true });
    main.addEventListener("touchmove", onTouchMove, { passive: true });
    main.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      main.removeEventListener("touchstart", onTouchStart);
      main.removeEventListener("touchmove", onTouchMove);
      main.removeEventListener("touchend", onTouchEnd);
    };
  }, [pullDistance, refreshing, getMain]);

  if (pullDistance <= 0 && !refreshing) return null;

  const progress = Math.min(pullDistance / THRESHOLD, 1);

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
          style={{ transform: refreshing ? undefined : `rotate(${progress * 360}deg)` }}
        />
      </div>
      {progress >= 1 && !refreshing && (
        <span className="text-[10px] text-muted-foreground/60 mt-1">Release to refresh</span>
      )}
    </div>
  );
}
