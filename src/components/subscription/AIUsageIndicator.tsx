import { Zap } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

interface AIUsageIndicatorProps {
  className?: string;
}

export function AIUsageIndicator({ className = "" }: AIUsageIndicatorProps) {
  const { isPremium, aiUsage } = useSubscription();

  if (isPremium) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-[10px] font-bold ${className}`}>
        <Zap className="h-2.5 w-2.5" />
        PRO
      </span>
    );
  }

  const remaining = Math.max(0, aiUsage.limit - aiUsage.used);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
        remaining > 0
          ? "bg-muted/30 dark:bg-white/10 text-muted-foreground"
          : "bg-destructive/10 text-destructive"
      } ${className}`}
    >
      <Zap className="h-2.5 w-2.5" />
      {remaining > 0 ? `${remaining} AI left` : "AI limit reached"}
    </span>
  );
}
