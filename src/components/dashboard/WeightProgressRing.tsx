import { memo } from "react";
import { AnimatedNumber } from "@/components/motion";

interface WeightProgressRingProps {
  currentWeight: number;
  startingWeight: number;
  goalWeight: number;
}

export const WeightProgressRing = memo(function WeightProgressRing({ currentWeight, startingWeight, goalWeight }: WeightProgressRingProps) {
  const totalToLose = startingWeight - goalWeight;
  const weightLost = startingWeight - currentWeight;
  const weightRemaining = currentWeight - goalWeight;
  const progressPercentage = totalToLose > 0 ? (weightLost / totalToLose) * 100 : 0;
  const displayProgress = Math.min(Math.max(progressPercentage, 0), 100);

  return (
    <div className="card-surface rounded-2xl border border-border p-3.5">
      {/* Header */}
      <div className="mb-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">Weight Progress</span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2.5 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-700 ease-out"
          style={{ width: `${displayProgress}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold display-number text-primary">
            <AnimatedNumber value={weightLost} format={(n) => n.toFixed(1)} />
          </span>
          <span className="text-[10px] text-muted-foreground">kg lost</span>
        </div>
        <span className="text-sm font-bold display-number bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          <AnimatedNumber value={displayProgress} format={(n) => `${Math.round(n)}%`} />
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold display-number text-secondary">
            <AnimatedNumber value={Math.max(0, weightRemaining)} format={(n) => n.toFixed(1)} />
          </span>
          <span className="text-[10px] text-muted-foreground">kg to go</span>
        </div>
      </div>

      {/* Current / Target */}
      <div className="text-[10px] text-muted-foreground/60 text-center mt-1.5">
        {currentWeight.toFixed(1)}kg → {goalWeight.toFixed(1)}kg
      </div>
    </div>
  );
});
