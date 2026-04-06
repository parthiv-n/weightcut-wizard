import { Zap } from "lucide-react";

interface PremiumBadgeProps {
  className?: string;
}

export function PremiumBadge({ className = "" }: PremiumBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider ${className}`}
    >
      <Zap className="h-2.5 w-2.5" />
      PRO
    </span>
  );
}
