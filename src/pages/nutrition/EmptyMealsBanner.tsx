import { Utensils, Loader2, RotateCcw, Plus } from "lucide-react";
import type { Meal } from "@/pages/nutrition/types";

interface EmptyMealsBannerProps {
  visible: boolean;
  previousDayMealCount: number;
  copyingPreviousDay: boolean;
  lastMeal: Meal | null;
  onQuickAdd: () => void;
  onCopyPreviousDay: () => void;
  onRepeatLast: () => void;
}

export function EmptyMealsBanner({
  visible,
  previousDayMealCount,
  copyingPreviousDay,
  lastMeal,
  onQuickAdd,
  onCopyPreviousDay,
  onRepeatLast,
}: EmptyMealsBannerProps) {
  if (!visible) return null;

  const hasSecondary = previousDayMealCount > 0 || !!lastMeal;

  return (
    <div className="card-surface rounded-2xl border border-border/50 px-4 py-5 flex flex-col items-center text-center gap-3">
      <div
        className="h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary) / 0.06))",
        }}
      >
        <Utensils className="h-5 w-5 text-primary" />
      </div>

      <div className="space-y-0.5">
        <h3 className="text-[15px] font-semibold leading-tight">Nothing logged yet</h3>
        <p className="text-[12px] text-muted-foreground leading-snug">
          Tap a meal section below or use Quick Add to start.
        </p>
      </div>

      <button
        onClick={onQuickAdd}
        className="w-full max-w-[260px] h-11 rounded-2xl bg-primary text-primary-foreground text-[13px] font-semibold shadow-lg shadow-primary/15 active:scale-[0.98] transition-transform inline-flex items-center justify-center gap-1.5"
      >
        <Plus className="h-4 w-4" />
        Quick Add
      </button>

      {hasSecondary && (
        <div className="flex items-center justify-center gap-3 pt-0.5">
          {previousDayMealCount > 0 && (
            <button
              onClick={onCopyPreviousDay}
              disabled={copyingPreviousDay}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {copyingPreviousDay && <Loader2 className="h-3 w-3 animate-spin" />}
              Copy yesterday
            </button>
          )}
          {previousDayMealCount > 0 && lastMeal && (
            <span className="text-muted-foreground/40 text-[10px]">·</span>
          )}
          {lastMeal && (
            <button
              onClick={onRepeatLast}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground active:scale-[0.97] transition-all max-w-[140px]"
            >
              <RotateCcw className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">Repeat last</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
