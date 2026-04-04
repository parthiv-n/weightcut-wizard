import { memo } from "react";
import type { WeeklyConsistency } from "@/hooks/useGamification";
import { AnimatedRing, AnimatedNumber } from "@/components/motion";

interface ConsistencyRingProps extends WeeklyConsistency {}

export const ConsistencyRing = memo(function ConsistencyRing({
  percentage,
  daysComplete,
  totalDays,
  dailyBreakdown,
}: ConsistencyRingProps) {
  const getRingColor = () => {
    if (percentage >= 70) return "hsl(var(--success))";
    if (percentage >= 40) return "hsl(var(--warning))";
    return "hsl(var(--muted-foreground))";
  };

  const color = getRingColor();

  return (
    <div className="glass-card p-3">
      <div className="flex items-center gap-3">
        {/* Ring */}
        <div className="relative w-16 h-16 flex-shrink-0">
          <AnimatedRing
            progress={percentage / 100}
            size={64}
            strokeWidth={5}
            gradientColors={[color, color]}
            id="consistency-ring"
          />

          {/* Center percentage */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-base font-bold display-number">
              <AnimatedNumber value={percentage} format={(n) => `${Math.round(n)}%`} />
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Weekly Consistency
          </div>
          <div className="text-2xl font-bold display-number mt-0.5">
            <AnimatedNumber value={daysComplete} />
            <span className="text-sm font-normal text-muted-foreground">
              /{totalDays}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">days complete</p>
        </div>
      </div>

      {/* Day dots */}
      <div className="flex items-center justify-between mt-2 px-1">
        {dailyBreakdown.map((day) => (
          <div key={day.date} className="flex flex-col items-center gap-1">
            <div
              className={`w-3.5 h-3.5 rounded-full transition-colors ${
                day.complete
                  ? "bg-green-500"
                  : "bg-muted-foreground/20"
              }`}
            />
            <span className="text-[10px] text-muted-foreground">
              {day.dayLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
