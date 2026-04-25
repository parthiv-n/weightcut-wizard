import { Utensils, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="card-surface rounded-2xl border border-border p-3">
      <div className="flex items-center gap-2.5">
        <div className="rounded-full bg-primary/15 p-2 flex-shrink-0">
          <Utensils className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">No Meals Logged Today</h3>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[12px] font-semibold px-3 rounded-full justify-center text-primary hover:bg-primary/10 active:scale-95 underline-offset-4 hover:underline transition-all"
          onClick={onQuickAdd}
        >
          Quick Add
        </Button>
        {previousDayMealCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[12px] font-semibold px-3 rounded-full justify-center text-primary hover:bg-primary/10 active:scale-95 underline-offset-4 hover:underline transition-all"
            onClick={onCopyPreviousDay}
            disabled={copyingPreviousDay}
          >
            {copyingPreviousDay && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Copy Yesterday
          </Button>
        )}
        {lastMeal && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] font-medium px-3 rounded-full justify-center max-w-full"
            onClick={onRepeatLast}
          >
            <RotateCcw className="h-3 w-3 mr-1 flex-shrink-0" />
            <span className="truncate">Repeat: {lastMeal.meal_name}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
