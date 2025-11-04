import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";

interface CalorieBudgetIndicatorProps {
  dailyTarget: number;
  consumed: number;
  safetyStatus: "green" | "yellow" | "red";
  safetyMessage: string;
}

export function CalorieBudgetIndicator({
  dailyTarget,
  consumed,
  safetyStatus,
  safetyMessage,
}: CalorieBudgetIndicatorProps) {
  const percentage = (consumed / dailyTarget) * 100;
  const remaining = dailyTarget - consumed;

  const getStatusColor = () => {
    if (safetyStatus === "red") return "destructive";
    if (safetyStatus === "yellow") return "default";
    return "default";
  };

  const getStatusIcon = () => {
    if (safetyStatus === "red") return <AlertCircle className="h-5 w-5" />;
    if (safetyStatus === "yellow") return <AlertTriangle className="h-5 w-5" />;
    return <CheckCircle className="h-5 w-5" />;
  };

  const getProgressColor = () => {
    if (percentage > 100) return "bg-destructive";
    if (percentage > 90) return "bg-yellow-500";
    return "bg-primary";
  };

  return (
    <div className="space-y-4">
      <Alert variant={getStatusColor()} className="animate-fade-in">
        <div className="flex items-start gap-3">
          {getStatusIcon()}
          <div className="flex-1">
            <AlertTitle>Daily Calorie Budget</AlertTitle>
            <AlertDescription>{safetyMessage}</AlertDescription>
          </div>
        </div>
      </Alert>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">
            {consumed} / {dailyTarget} calories
          </span>
          <span className={remaining >= 0 ? "text-muted-foreground" : "text-destructive"}>
            {remaining >= 0 ? `${remaining} remaining` : `${Math.abs(remaining)} over`}
          </span>
        </div>
        <Progress value={Math.min(percentage, 100)} className={getProgressColor()} />
        <div className="text-xs text-muted-foreground text-center">
          {percentage.toFixed(1)}% of daily target
        </div>
      </div>
    </div>
  );
}
