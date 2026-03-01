import { memo } from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  );
}

// Specific skeleton components for common UI patterns

export const MealCardSkeleton = memo(function MealCardSkeleton() {
  return (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="flex justify-between items-start">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-18" />
            <Skeleton className="h-6 w-14" />
          </div>
        </div>
        <Skeleton className="h-8 w-8" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
});

export const ProfileCardSkeleton = memo(function ProfileCardSkeleton() {
  return (
    <div className="p-6 border rounded-lg space-y-4">
      <div className="flex items-center space-x-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-16" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-16" />
        </div>
      </div>
    </div>
  );
});

export const MacroProgressSkeleton = memo(function MacroProgressSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-2 w-full" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="text-center space-y-2">
            <Skeleton className="h-3 w-12 mx-auto" />
            <Skeleton className="h-4 w-8 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
});

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4" />
            </div>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <MacroProgressSkeleton />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-28" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <MealCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function NutritionPageSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* Header with date picker */}
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Macro Progress */}
      <MacroProgressSkeleton />

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex space-x-4">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Meal List */}
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <MealCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function WeightTrackerSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      {/* Log input card */}
      <div className="p-4 border rounded-lg space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      {/* Chart card */}
      <div className="p-4 border rounded-lg space-y-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-48 w-full" />
      </div>
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <ProfileCardSkeleton />
        <MacroProgressSkeleton />
      </div>
    </div>
  );
}

export function HydrationSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* Input card */}
      <div className="p-4 border rounded-lg space-y-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
      {/* Protocol placeholder */}
      <div className="p-4 border rounded-lg space-y-3">
        <Skeleton className="h-5 w-44" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 items-center">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FightWeekSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-56" />
      </div>
      {/* Countdown card */}
      <div className="p-4 border rounded-lg space-y-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-16 w-full" />
      </div>
      {/* Phase cards */}
      {[1, 2].map((i) => (
        <div key={i} className="p-4 border rounded-lg space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function FightCampsSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* Camp cards */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 border rounded-lg space-y-3">
          <div className="flex justify-between items-center">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  );
}

export function GoalsSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-44" />
      </div>
      {/* Goal cards */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 border rounded-lg space-y-3">
          <Skeleton className="h-5 w-28" />
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-20" />
          </div>
        </div>
      ))}
      {/* Save button */}
      <Skeleton className="h-12 w-full rounded-2xl" />
    </div>
  );
}

export { Skeleton };
