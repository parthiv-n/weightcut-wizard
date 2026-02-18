import { Card, CardContent } from "@/components/ui/card";

interface CalorieProgressRingProps {
  consumed: number;
  target: number;
}

export function CalorieProgressRing({ consumed, target }: CalorieProgressRingProps) {
  const percentage = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const remaining = Math.max(target - consumed, 0);
  
  // Debug logging
  console.log('CalorieProgressRing:', { consumed, target, percentage, circumference, strokeDashoffset });
  
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
    <Card className="overflow-hidden h-full">
      <CardContent className="p-6 pb-28 relative h-full flex flex-col justify-between">
        <div className="flex flex-col pr-28">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Calorie Progress</div>
          <div className="text-4xl font-bold display-number mb-1">{consumed}</div>
          <p className="text-xs text-muted-foreground">of {target} kcal</p>
          <p className="text-xs font-medium mt-2" style={{ color: getStatusColor() }}>
            {getStatusText()}
          </p>
        </div>

        <div className="absolute bottom-6 right-6 w-28 h-28 md:w-36 md:h-36 lg:w-48 lg:h-48 p-1">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="calorieGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={getStatusColor()} stopOpacity="1" />
                <stop offset="50%" stopColor={getStatusColor()} stopOpacity="0.8" />
                <stop offset="100%" stopColor={getStatusColor()} stopOpacity="0.6" />
              </linearGradient>
              <filter id="calorieGlow">
                <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={getStatusColor()} floodOpacity="0.5" />
              </filter>
            </defs>

            {/* Background track */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={getStatusColor()}
              strokeWidth="8"
              opacity="0.15"
            />

            {/* Progress arc */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="url(#calorieGradient)"
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
              filter="url(#calorieGlow)"
            />
          </svg>

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-xl md:text-2xl lg:text-3xl font-bold display-number">{Math.round(percentage)}%</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
