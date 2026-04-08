import { useState, useEffect } from "react";
import { Clock, Zap } from "lucide-react";
import { useSubscriptionContext } from "@/contexts/SubscriptionContext";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function useAICountdown(): string | null {
  const { aiResetTime, isPremium } = useSubscriptionContext();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!aiResetTime || isPremium) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [aiResetTime, isPremium]);

  if (!aiResetTime || isPremium) return null;
  const remaining = aiResetTime.getTime() - now;
  if (remaining <= 0) return null;
  return formatCountdown(remaining);
}

export function AILimitTimer() {
  const { openPaywall, refreshAIUsage, aiResetTime, isPremium, limitTimerVisible } = useSubscriptionContext();
  const countdown = useAICountdown();
  const [fading, setFading] = useState(false);

  // Start fade-out 0.5s before hiding
  useEffect(() => {
    if (!limitTimerVisible) {
      setFading(false);
      return;
    }
    const fadeTimer = setTimeout(() => setFading(true), 4500);
    return () => clearTimeout(fadeTimer);
  }, [limitTimerVisible]);

  // Auto-refresh when countdown expires
  useEffect(() => {
    if (!aiResetTime || isPremium) return;
    const remaining = aiResetTime.getTime() - Date.now();
    if (remaining <= 0) {
      refreshAIUsage();
    }
  }, [countdown, aiResetTime, isPremium, refreshAIUsage]);

  if (!limitTimerVisible || !countdown) return null;

  return (
    <div
      className={`fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] left-1/2 -translate-x-1/2 z-[9999] md:hidden transition-all duration-500 ${
        fading ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0 animate-in slide-in-from-bottom duration-300"
      }`}
    >
      <div className="flex items-center gap-2.5 rounded-xl card-surface border border-primary/20 bg-background/95 px-3.5 py-2.5 shadow-lg shadow-black/20">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Clock className="h-4 w-4 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] text-muted-foreground leading-tight">Free AI resets in</span>
          <span className="text-sm font-bold text-foreground tabular-nums leading-tight">{countdown}</span>
        </div>
        <button
          onClick={openPaywall}
          className="ml-1 flex items-center gap-1 rounded-xl bg-gradient-to-r from-primary to-secondary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground active:scale-95 transition-transform"
        >
          <Zap className="h-3 w-3" />
          Pro
        </button>
      </div>
    </div>
  );
}
