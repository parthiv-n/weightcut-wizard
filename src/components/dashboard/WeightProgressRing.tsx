import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown } from "lucide-react";
import { AnimatedRing, AnimatedNumber } from "@/components/motion";

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
  const progressFraction = displayProgress / 100;

  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Weight Loss Progress</CardTitle>
        <TrendingDown className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-6">
        <div className="relative w-48 h-48">
          <AnimatedRing
            progress={progressFraction}
            size={160}
            strokeWidth={11}
            gradientColors={["hsl(var(--primary))", "hsl(var(--secondary))"]}
            glowOnComplete
            id="weight-ring"
          />

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold display-number bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent">
              <AnimatedNumber value={displayProgress} format={(n) => `${Math.round(n)}%`} />
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Complete</div>
          </div>
        </div>

        {/* Stats below the ring */}
        <div className="grid grid-cols-2 gap-4 w-full mt-6">
          <div className="text-center p-3 rounded-xl bg-primary/10">
            <div className="text-lg font-bold display-number text-primary">
              <AnimatedNumber value={weightLost} format={(n) => `${n.toFixed(1)}kg`} />
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Lost</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-secondary/10">
            <div className="text-lg font-bold display-number text-secondary">
              <AnimatedNumber value={Math.max(0, weightRemaining)} format={(n) => `${n.toFixed(1)}kg`} />
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">To Go</div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground mt-4 text-center">
          Current: <span className="font-semibold">{currentWeight.toFixed(1)}kg</span> •{" "}
          Target: <span className="font-semibold">{goalWeight.toFixed(1)}kg</span>
        </div>
      </CardContent>
    </Card>
  );
});
