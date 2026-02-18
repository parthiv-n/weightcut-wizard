import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown } from "lucide-react";

interface WeightProgressRingProps {
  currentWeight: number;
  startingWeight: number;
  goalWeight: number;
}

export function WeightProgressRing({ currentWeight, startingWeight, goalWeight }: WeightProgressRingProps) {
  const totalToLose = startingWeight - goalWeight;
  const weightLost = startingWeight - currentWeight;
  const weightRemaining = currentWeight - goalWeight;
  const progressPercentage = totalToLose > 0 ? (weightLost / totalToLose) * 100 : 0;
  
  // Ensure progress doesn't exceed 100%
  const displayProgress = Math.min(Math.max(progressPercentage, 0), 100);
  
  // Calculate circle properties
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (displayProgress / 100) * circumference;

  return (
    <Card className="overflow-hidden animate-fade-in">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Weight Loss Progress</CardTitle>
        <TrendingDown className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-6">
        <div className="relative w-48 h-48 animate-scale-in">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
            <defs>
              <linearGradient id="weightGradientArc" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(var(--primary))" />
                <stop offset="50%" stopColor="hsl(var(--secondary))" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
              </linearGradient>
              <filter id="weightGlow">
                <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="hsl(var(--primary))" floodOpacity="0.5" />
              </filter>
            </defs>
            {/* Background track */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="11"
              opacity="0.15"
            />
            {/* Progress arc */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="url(#weightGradientArc)"
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
              filter="url(#weightGlow)"
            />
          </svg>

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold display-number bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent">
              {displayProgress.toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Complete</div>
          </div>
        </div>

        {/* Stats below the ring */}
        <div className="grid grid-cols-2 gap-4 w-full mt-6">
          <div className="text-center p-3 rounded-xl bg-primary/10">
            <div className="text-lg font-bold display-number text-primary">{weightLost.toFixed(1)}kg</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Lost</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-secondary/10">
            <div className="text-lg font-bold display-number text-secondary">{Math.max(0, weightRemaining).toFixed(1)}kg</div>
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
}
