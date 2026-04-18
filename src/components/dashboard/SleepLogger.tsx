import { memo, useCallback, useEffect, useState } from "react";
import { Moon, ChevronRight, Check, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { localCache } from "@/lib/localCache";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { logger } from "@/lib/logger";
import { triggerHapticSuccess } from "@/lib/haptics";

interface SleepLoggerProps {
  userId: string;
  compact?: boolean;
}

const MIN_HOURS = 0;
const MAX_HOURS = 16;
const STEP = 0.5;
const DEFAULT_HOURS = 7.5;

const today = () => new Date().toISOString().split("T")[0];
const cacheKey = (date: string) => `sleep_log_${date}`;

export const SleepLogger = memo(function SleepLogger({ userId, compact }: SleepLoggerProps) {
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Load from cache, then background-fetch from Supabase
  useEffect(() => {
    const date = today();
    const cached = localCache.get<number>(userId, cacheKey(date));
    if (cached !== null) {
      setHours(cached);
      setSaved(true);
    }

    withSupabaseTimeout(
      supabase
        .from("sleep_logs")
        .select("hours")
        .eq("user_id", userId)
        .eq("date", date)
        .maybeSingle(),
      6000,
      "Fetch sleep log"
    )
      .then(({ data, error }) => {
        if (error) throw error;
        if (data) {
          setHours(data.hours);
          setSaved(true);
          localCache.set(userId, cacheKey(date), data.hours);
        }
      })
      .catch((err) => {
        logger.warn("SleepLogger: fetch failed", { error: err?.message });
      });
  }, [userId]);

  const handleSave = useCallback(async () => {
    const date = today();
    // Optimistic update
    setSaved(true);
    setIsEditing(false);
    localCache.set(userId, cacheKey(date), hours);
    // Also update the sleep_logs array cache so the Sleep chart page renders instantly
    const existing = localCache.get<{ date: string; hours: number }[]>(userId, "sleep_logs") ?? [];
    const idx = existing.findIndex(r => r.date === date);
    const updated = idx >= 0
      ? existing.map((r, i) => i === idx ? { ...r, hours } : r)
      : [...existing, { date, hours }].sort((a, b) => a.date.localeCompare(b.date));
    localCache.set(userId, "sleep_logs", updated);
    window.dispatchEvent(new Event("sleep-logged"));
    triggerHapticSuccess();

    try {
      const { error } = await withSupabaseTimeout(
        supabase.from("sleep_logs").upsert(
          { user_id: userId, date, hours },
          { onConflict: "user_id,date" }
        ),
        6000,
        "Save sleep log"
      );
      if (error) throw error;
    } catch (err: any) {
      logger.error("SleepLogger: save failed", err);
    }
  }, [userId, hours]);

  const adjust = (delta: number) => {
    setHours((h) => Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round((h + delta) * 10) / 10)));
  };

  // Collapsed state
  if (!isEditing) {
    if (compact) {
      return (
        <button
          type="button"
          className="card-surface rounded-2xl border border-border p-2.5 flex items-center justify-center active:scale-[0.98] transition-all text-center w-full"
          onClick={() => setIsEditing(true)}
        >
          {saved ? (
            <p className="text-[14px] font-semibold leading-tight"><span className="tabular-nums">{hours}</span><span className="text-muted-foreground">h</span> sleep</p>
          ) : (
            <p className="text-[14px] font-semibold leading-tight">Sleep</p>
          )}
        </button>
      );
    }
    return (
      <button
        type="button"
        className="card-surface rounded-2xl p-3 sm:p-4 w-full flex items-center gap-3 active:scale-[0.98] transition-all duration-200 text-left"
        onClick={() => setIsEditing(true)}
      >
        <Moon className="w-5 h-5 text-primary flex-shrink-0" />
        {saved ? (
          <>
            <span className="text-sm font-semibold flex-1">
              <span className="tabular-nums">{hours}</span>
              <span className="text-muted-foreground">h</span>
            </span>
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-muted-foreground flex-1">Log Sleep</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
          </>
        )}
      </button>
    );
  }

  // Expanded stepper
  return (
    <div className="card-surface rounded-2xl p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Moon className="w-5 h-5 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Sleep</span>
      </div>

      <div className="flex items-center justify-center gap-5">
        <button
          type="button"
          className="h-7 w-7 rounded-full bg-muted/40 flex items-center justify-center text-sm font-medium active:bg-muted/60 transition-colors"
          onClick={() => adjust(-STEP)}
          disabled={hours <= MIN_HOURS}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="text-lg font-bold tabular-nums">
          {hours}<span className="text-muted-foreground ml-0.5">h</span>
        </span>
        <button
          type="button"
          className="h-7 w-7 rounded-full bg-muted/40 flex items-center justify-center text-sm font-medium active:bg-muted/60 transition-colors"
          onClick={() => adjust(STEP)}
          disabled={hours >= MAX_HOURS}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="text-xs font-semibold text-primary active:opacity-70 transition-opacity"
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );
});
