import { Zap, Gem } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

interface AIUsageIndicatorProps {
  className?: string;
}

export function AIUsageIndicator({ className = "" }: AIUsageIndicatorProps) {
  const { isPremium, gems } = useSubscription();

  if (isPremium) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-[10px] font-bold ${className}`}>
        <Zap className="h-2.5 w-2.5" />
        PRO
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
        gems > 0
          ? "bg-muted/30 dark:bg-white/10 text-muted-foreground"
          : "bg-destructive/10 text-destructive"
      } ${className}`}
    >
      <Gem className="h-2.5 w-2.5" />
      {gems > 0 ? `${gems}` : "No gems"}
    </span>
  );
}
