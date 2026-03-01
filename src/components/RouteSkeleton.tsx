import { useLocation } from "react-router-dom";
import {
  DashboardSkeleton,
  NutritionPageSkeleton,
  WeightTrackerSkeleton,
  HydrationSkeleton,
  FightWeekSkeleton,
  FightCampsSkeleton,
  GoalsSkeleton,
} from "@/components/ui/skeleton-loader";

const skeletonMap: Record<string, React.FC> = {
  "/dashboard": DashboardSkeleton,
  "/nutrition": NutritionPageSkeleton,
  "/weight": WeightTrackerSkeleton,
  "/hydration": HydrationSkeleton,
  "/fight-week": FightWeekSkeleton,
  "/fight-camps": FightCampsSkeleton,
  "/goals": GoalsSkeleton,
};

export function RouteSkeleton() {
  const { pathname } = useLocation();
  const Skeleton = skeletonMap[pathname] || DashboardSkeleton;
  return <Skeleton />;
}
