import { Card, CardContent } from "@/components/ui/card";

interface CalorieProgressRingProps {
  consumed: number;
  target: number;
}

export function CalorieProgressRing({ consumed, target }: CalorieProgressRingProps) {
  const percentage = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
  const radius = 40;
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
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-muted-foreground mb-1">Calorie Progress</div>
            <div className="text-4xl font-bold mb-1">{consumed}</div>
            <p className="text-xs text-muted-foreground">of {target} kcal</p>
            <p className="text-xs font-medium mt-2" style={{ color: getStatusColor() }}>
              {getStatusText()}
            </p>
          </div>
          
          <div className="relative w-20 h-20 flex-shrink-0 p-1">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="calorieGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={getStatusColor()} stopOpacity="1" />
                  <stop offset="100%" stopColor={getStatusColor()} stopOpacity="0.6" />
                </linearGradient>
              </defs>
              
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="6"
                opacity="0.2"
              />
              
              {/* Progress circle */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="url(#calorieGradient)"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            
            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-lg font-bold">{Math.round(percentage)}%</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
