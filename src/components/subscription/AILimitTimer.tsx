import { useState, useEffect } from "react";
import { Gem, Zap } from "lucide-react";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";

/** Returns "Xh Ym" until midnight local time, or null if not applicable */
export function useNextGemCountdown(gems: number, isPremium: boolean): string | null {
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    if (isPremium || gems >= 2) {
      setCountdown(null);
      return;
    }

    const tick = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      if (diff <= 0) {
        setCountdown(null);
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setCountdown(`${h}h ${m}m`);
    };

    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [gems, isPremium]);

  return countdown;
}

export function AILimitTimer() {
  const { openPaywall, isPremium, gems } = useSubscriptionContext();
  const countdown = useNextGemCountdown(gems, isPremium);

  if (isPremium || gems > 0) return null;

  return (
    <div
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] left-1/2 -translate-x-1/2 z-[9999] md:hidden animate-in slide-in-from-bottom duration-300"
    >
      <div className="flex items-center gap-2.5 rounded-2xl card-surface border border-primary/20 bg-background/95 px-3.5 py-2.5 shadow-lg shadow-black/20">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Gem className="h-4 w-4 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] text-muted-foreground leading-tight">No gems left</span>
          {countdown && (
            <span className="text-sm font-bold text-foreground tabular-nums leading-tight">Free gem in {countdown}</span>
          )}
        </div>
        <button
          onClick={openPaywall}
          className="ml-1 flex items-center gap-1 rounded-2xl bg-gradient-to-r from-primary to-secondary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground active:scale-95 transition-transform"
        >
          <Zap className="h-3 w-3" />
          Pro
        </button>
      </div>
    </div>
  );
}
