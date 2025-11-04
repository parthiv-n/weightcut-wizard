import { Card, CardContent } from "@/components/ui/card";

interface CalorieProgressRingProps {
  consumed: number;
  target: number;
}

export function CalorieProgressRing({ consumed, target }: CalorieProgressRingProps) {
  const percentage = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const remaining = Math.max(target - consumed, 0);
  
  // Determine status color based on consumption
  const getStatusColor = () => {
    if (consumed < target * 0.8) return "hsl(var(--chart-1))"; // Under target
    if (consumed <= target * 1.1) return "hsl(var(--success))"; // On track
    return "hsl(var(--destructive))"; // Over target
  };

  const getStatusText = () => {
    if (consumed < target * 0.8) return "Under Target";
    if (consumed <= target * 1.1) return "On Track";
    return "Over Target";
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-48 h-48">
            <svg className="w-full h-full transform -rotate-90">
              <defs>
                <linearGradient id="calorieGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={getStatusColor()} stopOpacity="1" />
                  <stop offset="100%" stopColor={getStatusColor()} stopOpacity="0.6" />
                </linearGradient>
              </defs>
              
              {/* Background circle */}
              <circle
                cx="96"
                cy="96"
                r={radius}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="12"
                opacity="0.2"
              />
              
              {/* Progress circle */}
              <circle
                cx="96"
                cy="96"
                r={radius}
                fill="none"
                stroke="url(#calorieGradient)"
                strokeWidth="12"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            
            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl font-bold">{Math.round(percentage)}%</div>
              <div className="text-xs text-muted-foreground mt-1">{getStatusText()}</div>
            </div>
          </div>

          {/* Stats */}
          <div className="w-full space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Consumed</span>
              <span className="font-semibold">{consumed} kcal</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Target</span>
              <span className="font-semibold">{target} kcal</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Remaining</span>
              <span className="font-semibold">{remaining} kcal</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
