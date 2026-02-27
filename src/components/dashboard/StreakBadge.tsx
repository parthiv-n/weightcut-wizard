import { Flame } from "lucide-react";

interface StreakBadgeProps {
  streak: number;
  isActive: boolean;
}

export function StreakBadge({ streak, isActive }: StreakBadgeProps) {
  return (
    <div className="inline-flex flex-col items-center">
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
          isActive
            ? "bg-orange-500/10 border-orange-500/20"
            : "bg-orange-500/5 border-orange-500/10"
        }`}
      >
        <Flame
          className={`h-4 w-4 ${
            isActive
              ? "text-orange-400"
              : "text-muted-foreground animate-pulse"
          }`}
        />
        <span className="text-sm font-bold display-number">{streak}</span>
      </div>
      {!isActive && streak > 0 && (
        <span className="text-[10px] text-muted-foreground mt-0.5">
          Log today!
        </span>
      )}
    </div>
  );
}
