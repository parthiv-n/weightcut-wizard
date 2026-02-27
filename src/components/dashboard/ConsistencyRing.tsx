import type { WeeklyConsistency } from "@/hooks/useGamification";

interface ConsistencyRingProps extends WeeklyConsistency {}

export function ConsistencyRing({
  percentage,
  daysComplete,
  totalDays,
  dailyBreakdown,
}: ConsistencyRingProps) {
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (percentage / 100) * circumference;

  const getRingColor = () => {
    if (percentage >= 70) return "hsl(var(--success))";
    if (percentage >= 40) return "hsl(var(--warning))";
    return "hsl(var(--muted-foreground))";
  };

  const color = getRingColor();

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-4">
        {/* Ring */}
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg
            className="w-full h-full transform -rotate-90"
            viewBox="0 0 80 80"
          >
            <defs>
              <linearGradient
                id="consistencyGradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor={color} stopOpacity="1" />
                <stop offset="50%" stopColor={color} stopOpacity="0.8" />
                <stop offset="100%" stopColor={color} stopOpacity="0.6" />
              </linearGradient>
              <filter id="consistencyGlow">
                <feDropShadow
                  dx="0"
                  dy="0"
                  stdDeviation="2"
                  floodColor={color}
                  floodOpacity="0.5"
                />
              </filter>
            </defs>

            {/* Background track */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="6"
              opacity="0.15"
            />

            {/* Progress arc */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke="url(#consistencyGradient)"
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
              filter="url(#consistencyGlow)"
            />
          </svg>

          {/* Center percentage */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-base font-bold display-number">
              {percentage}%
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Weekly Consistency
          </div>
          <div className="text-2xl font-bold display-number mt-0.5">
            {daysComplete}
            <span className="text-sm font-normal text-muted-foreground">
              /{totalDays}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">days complete</p>
        </div>
      </div>

      {/* Day dots */}
      <div className="flex items-center justify-between mt-3 px-1">
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
}
