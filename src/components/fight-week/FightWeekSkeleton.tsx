import { Skeleton } from "@/components/ui/skeleton";

/**
 * Body skeleton shown while the Fight Week AI plan is generating.
 * Mirrors the layout of the rendered plan: summary, 3 stat tiles, breakdown, timeline.
 */
export function FightWeekSkeleton() {
  return (
    <div className="space-y-2.5" aria-label="Generating fight week plan">
      <Skeleton className="h-16 rounded-2xl" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-14 rounded-2xl" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-56 rounded-2xl" />
      <div className="space-y-1.5">
        <Skeleton className="h-12 rounded-2xl" />
        <Skeleton className="h-12 rounded-2xl" />
        <Skeleton className="h-12 rounded-2xl" />
      </div>
    </div>
  );
}
