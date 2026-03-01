import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { localCache } from "@/lib/localCache";
import type { ProfileData } from "@/contexts/UserContext";

export interface DailyBreakdown {
  date: string;
  dayLabel: string;
  hasWeight: boolean;
  hasNutrition: boolean;
  complete: boolean;
}

export interface WeeklyConsistency {
  percentage: number;
  daysComplete: number;
  totalDays: 7;
  dailyBreakdown: DailyBreakdown[];
}

export interface MilestoneBadge {
  id: string;
  title: string;
  description: string;
  icon: "Flame" | "Calendar" | "Utensils" | "Trophy" | "Scale" | "TrendingUp" | "Award" | "Zap" | "Star" | "Dumbbell" | "Crown";
  unlocked: boolean;
  progress: number; // 0-1
}

export type AchievementCategory = "streak" | "nutrition" | "weight" | "training";

export interface AchievementNode extends MilestoneBadge {
  category: AchievementCategory;
  order: number;
  currentValue: number;
  targetValue: number;
}

export interface AchievementCategoryGroup {
  category: AchievementCategory;
  label: string;
  icon: string;
  achievements: AchievementNode[];
}

interface GamificationData {
  nutritionDates: string[];
  mealCount: number;
  fightWeekCount: number;
  completedCampCount: number;
  totalCampCount: number;
  allWeightDates: string[];
}

const CACHE_KEY = "gamification_data";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function getDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function computeStreak(weightDates: string[]): {
  streak: number;
  streakIncludesToday: boolean;
} {
  const today = getDateString(new Date());
  const dateSet = new Set(weightDates);

  const streakIncludesToday = dateSet.has(today);

  // Start from today if logged, otherwise from yesterday
  const start = new Date();
  if (!streakIncludesToday) {
    start.setDate(start.getDate() - 1);
  }

  let streak = 0;
  const cursor = new Date(start);

  while (dateSet.has(getDateString(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { streak, streakIncludesToday };
}

function computeWeeklyConsistency(
  weightLogs: { date: string }[],
  nutritionDates: Set<string>
): WeeklyConsistency {
  const weightDateSet = new Set(weightLogs.map((l) => l.date));
  const breakdown: DailyBreakdown[] = [];
  let daysComplete = 0;

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getDateString(d);
    // getDay(): 0=Sun, shift so Mon=0
    const dayIndex = (d.getDay() + 6) % 7;
    const hasWeight = weightDateSet.has(dateStr);
    const hasNutrition = nutritionDates.has(dateStr);
    const complete = hasWeight && hasNutrition;

    if (complete) daysComplete++;

    breakdown.push({
      date: dateStr,
      dayLabel: DAY_LABELS[dayIndex],
      hasWeight,
      hasNutrition,
      complete,
    });
  }

  return {
    percentage: Math.round((daysComplete / 7) * 100),
    daysComplete,
    totalDays: 7,
    dailyBreakdown: breakdown,
  };
}

function computeBadges(
  streak: number,
  mealCount: number,
  fightWeekCount: number,
  completedCampCount: number
): MilestoneBadge[] {
  return [
    {
      id: "streak_7",
      title: "7-Day Streak",
      description: "Log your weight 7 days in a row",
      icon: "Flame",
      unlocked: streak >= 7,
      progress: Math.min(streak / 7, 1),
    },
    {
      id: "first_fight_week",
      title: "Fight Week Planned",
      description: "Create your first fight week plan",
      icon: "Calendar",
      unlocked: fightWeekCount >= 1,
      progress: fightWeekCount >= 1 ? 1 : 0,
    },
    {
      id: "meals_100",
      title: "100 Meals Logged",
      description: "Log 100 meals in the nutrition tracker",
      icon: "Utensils",
      unlocked: mealCount >= 100,
      progress: Math.min(mealCount / 100, 1),
    },
    {
      id: "first_camp",
      title: "Camp Completed",
      description: "Complete your first fight camp",
      icon: "Trophy",
      unlocked: completedCampCount >= 1,
      progress: completedCampCount >= 1 ? 1 : 0,
    },
  ];
}

function computeAllAchievements(
  streak: number,
  mealCount: number,
  fightWeekCount: number,
  completedCampCount: number,
  totalCampCount: number,
  allWeightDates: string[],
  profile: ProfileData | null
): AchievementCategoryGroup[] {
  // Weight goal progress calculation
  let weightGoalProgress = 0;
  if (profile?.current_weight_kg && profile?.goal_weight_kg) {
    // Use first weight log date to approximate starting weight
    // Since we only have dates, we use current_weight_kg from profile as latest
    const startWeight = profile.current_weight_kg;
    const goalWeight = profile.goal_weight_kg;
    const totalToLose = startWeight - goalWeight;
    if (totalToLose > 0) {
      // current_weight_kg updates with each log, so check if they're making progress
      // Without the actual starting weight value, we estimate progress from log count
      // Better: use the profile fields directly
      weightGoalProgress = 0; // We'll compute per-milestone below
    } else {
      weightGoalProgress = 1;
    }
  }

  const streakAchievements: AchievementNode[] = [
    { id: "streak_7", title: "7-Day Streak", description: "Log weight 7 days in a row", icon: "Flame", unlocked: streak >= 7, progress: Math.min(streak / 7, 1), category: "streak", order: 0, currentValue: Math.min(streak, 7), targetValue: 7 },
    { id: "streak_14", title: "14-Day Streak", description: "Log weight 14 days in a row", icon: "Flame", unlocked: streak >= 14, progress: Math.min(streak / 14, 1), category: "streak", order: 1, currentValue: Math.min(streak, 14), targetValue: 14 },
    { id: "streak_30", title: "1 Month Streak", description: "Log weight 30 days in a row", icon: "Flame", unlocked: streak >= 30, progress: Math.min(streak / 30, 1), category: "streak", order: 2, currentValue: Math.min(streak, 30), targetValue: 30 },
    { id: "streak_60", title: "2 Month Streak", description: "Log weight 60 days in a row", icon: "Zap", unlocked: streak >= 60, progress: Math.min(streak / 60, 1), category: "streak", order: 3, currentValue: Math.min(streak, 60), targetValue: 60 },
    { id: "streak_90", title: "3 Month Streak", description: "Log weight 90 days in a row", icon: "Zap", unlocked: streak >= 90, progress: Math.min(streak / 90, 1), category: "streak", order: 4, currentValue: Math.min(streak, 90), targetValue: 90 },
    { id: "streak_180", title: "6 Month Streak", description: "Log weight 180 days in a row", icon: "Star", unlocked: streak >= 180, progress: Math.min(streak / 180, 1), category: "streak", order: 5, currentValue: Math.min(streak, 180), targetValue: 180 },
    { id: "streak_365", title: "1 Year Streak", description: "Log weight 365 days in a row", icon: "Crown", unlocked: streak >= 365, progress: Math.min(streak / 365, 1), category: "streak", order: 6, currentValue: Math.min(streak, 365), targetValue: 365 },
  ];

  const nutritionAchievements: AchievementNode[] = [
    { id: "meal_1", title: "First Meal", description: "Log your first meal", icon: "Utensils", unlocked: mealCount >= 1, progress: Math.min(mealCount / 1, 1), category: "nutrition", order: 0, currentValue: Math.min(mealCount, 1), targetValue: 1 },
    { id: "meals_100", title: "100 Meals", description: "Log 100 meals", icon: "Utensils", unlocked: mealCount >= 100, progress: Math.min(mealCount / 100, 1), category: "nutrition", order: 1, currentValue: Math.min(mealCount, 100), targetValue: 100 },
    { id: "meals_250", title: "250 Meals", description: "Log 250 meals", icon: "Utensils", unlocked: mealCount >= 250, progress: Math.min(mealCount / 250, 1), category: "nutrition", order: 2, currentValue: Math.min(mealCount, 250), targetValue: 250 },
    { id: "meals_500", title: "500 Meals", description: "Log 500 meals", icon: "Award", unlocked: mealCount >= 500, progress: Math.min(mealCount / 500, 1), category: "nutrition", order: 3, currentValue: Math.min(mealCount, 500), targetValue: 500 },
    { id: "meals_1000", title: "1000 Meals", description: "Log 1000 meals", icon: "Crown", unlocked: mealCount >= 1000, progress: Math.min(mealCount / 1000, 1), category: "nutrition", order: 4, currentValue: Math.min(mealCount, 1000), targetValue: 1000 },
  ];

  // Weight goal achievements — use profile goal progress
  const hasWeighIn = allWeightDates.length > 0;
  const goalWeight = profile?.goal_weight_kg ?? 0;
  const currentWeight = profile?.current_weight_kg ?? 0;
  // For goal progress, we need starting weight which we don't have stored separately
  // Use the distance from current to goal vs total journey
  // Since we can't know starting weight from dates alone, use a simple heuristic:
  // If current > goal, they haven't reached it. We show progress based on how close they are.
  const totalToLose = currentWeight - goalWeight;
  const weightAchievements: AchievementNode[] = [
    { id: "weight_first", title: "First Weigh-In", description: "Log your first weight", icon: "Scale", unlocked: hasWeighIn, progress: hasWeighIn ? 1 : 0, category: "weight", order: 0, currentValue: hasWeighIn ? 1 : 0, targetValue: 1 },
    { id: "weight_25", title: "25% to Goal", description: "Reach 25% of your weight goal", icon: "TrendingUp", unlocked: totalToLose <= 0 || (goalWeight > 0 && currentWeight <= goalWeight + totalToLose * 0.75), progress: goalWeight > 0 && totalToLose > 0 ? Math.min(1 - (totalToLose > 0 ? (currentWeight - goalWeight) / totalToLose : 0), 1) / 0.25 : (hasWeighIn ? 0 : 0), category: "weight", order: 1, currentValue: 25, targetValue: 25 },
    { id: "weight_50", title: "50% to Goal", description: "Reach 50% of your weight goal", icon: "TrendingUp", unlocked: totalToLose <= 0, progress: 0, category: "weight", order: 2, currentValue: 50, targetValue: 50 },
    { id: "weight_75", title: "75% to Goal", description: "Reach 75% of your weight goal", icon: "Award", unlocked: totalToLose <= 0, progress: 0, category: "weight", order: 3, currentValue: 75, targetValue: 75 },
    { id: "weight_goal", title: "Goal Reached", description: "Reach your goal weight", icon: "Crown", unlocked: goalWeight > 0 && currentWeight <= goalWeight, progress: goalWeight > 0 && totalToLose > 0 ? Math.max(0, 1 - (currentWeight - goalWeight) / totalToLose) : 0, category: "weight", order: 4, currentValue: goalWeight > 0 ? Math.round(Math.max(0, 1 - (currentWeight - goalWeight) / Math.max(totalToLose, 1)) * 100) : 0, targetValue: 100 },
  ];

  const trainingAchievements: AchievementNode[] = [
    { id: "camp_first", title: "First Camp", description: "Create your first fight camp", icon: "Dumbbell", unlocked: totalCampCount >= 1, progress: totalCampCount >= 1 ? 1 : 0, category: "training", order: 0, currentValue: Math.min(totalCampCount, 1), targetValue: 1 },
    { id: "camp_completed", title: "Camp Completed", description: "Complete a fight camp", icon: "Trophy", unlocked: completedCampCount >= 1, progress: completedCampCount >= 1 ? 1 : 0, category: "training", order: 1, currentValue: Math.min(completedCampCount, 1), targetValue: 1 },
    { id: "camps_3", title: "3 Camps", description: "Create 3 fight camps", icon: "Dumbbell", unlocked: totalCampCount >= 3, progress: Math.min(totalCampCount / 3, 1), category: "training", order: 2, currentValue: Math.min(totalCampCount, 3), targetValue: 3 },
    { id: "camps_5", title: "5 Camps", description: "Create 5 fight camps", icon: "Award", unlocked: totalCampCount >= 5, progress: Math.min(totalCampCount / 5, 1), category: "training", order: 3, currentValue: Math.min(totalCampCount, 5), targetValue: 5 },
    { id: "camps_10", title: "10 Camps", description: "Create 10 fight camps", icon: "Star", unlocked: totalCampCount >= 10, progress: Math.min(totalCampCount / 10, 1), category: "training", order: 4, currentValue: Math.min(totalCampCount, 10), targetValue: 10 },
    { id: "first_fight_week", title: "Fight Week Plan", description: "Create a fight week plan", icon: "Calendar", unlocked: fightWeekCount >= 1, progress: fightWeekCount >= 1 ? 1 : 0, category: "training", order: 5, currentValue: Math.min(fightWeekCount, 1), targetValue: 1 },
  ];

  return [
    { category: "streak", label: "Streak", icon: "Flame", achievements: streakAchievements },
    { category: "nutrition", label: "Nutrition", icon: "Utensils", achievements: nutritionAchievements },
    { category: "weight", label: "Weight", icon: "Scale", achievements: weightAchievements },
    { category: "training", label: "Training", icon: "Dumbbell", achievements: trainingAchievements },
  ];
}

export function useGamification(
  userId: string | null,
  weightLogs: { date: string; weight_kg: string }[],
  todayCalories: number,
  profile?: ProfileData | null
) {
  const [gamificationData, setGamificationData] =
    useState<GamificationData | null>(null);
  const [badgesLoading, setBadgesLoading] = useState(true);

  // Streak — computed from full weight date set when available, fallback to weightLogs prop
  const { streak, streakIncludesToday } = useMemo(() => {
    const dates = gamificationData?.allWeightDates?.length
      ? gamificationData.allWeightDates
      : weightLogs.map((l) => l.date);
    return computeStreak(dates);
  }, [weightLogs, gamificationData?.allWeightDates]);

  // Fetch nutrition dates + badge counts
  useEffect(() => {
    if (!userId) {
      setBadgesLoading(false);
      return;
    }

    // Check cache first
    const cached = localCache.get<GamificationData>(
      userId,
      CACHE_KEY,
      CACHE_TTL_MS
    );
    if (cached) {
      setGamificationData(cached);
      setBadgesLoading(false);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      const sevenDaysAgo = getDateString(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );

      const results = await Promise.allSettled([
        // Nutrition dates for past 7 days
        supabase
          .from("nutrition_logs")
          .select("date")
          .eq("user_id", userId)
          .gte("date", sevenDaysAgo),
        // Total meal count
        supabase
          .from("nutrition_logs")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId),
        // Fight week plans count
        supabase
          .from("fight_week_plans")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId),
        // Completed camps count
        supabase
          .from("fight_camps")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("is_completed", true),
        // Total camp count
        supabase
          .from("fight_camps")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId),
        // All weight log dates (no limit — needed for accurate streaks)
        supabase
          .from("weight_logs")
          .select("date")
          .eq("user_id", userId)
          .order("date", { ascending: true }),
      ]);

      if (cancelled) return;

      const nutritionDates =
        results[0].status === "fulfilled"
          ? (results[0].value.data || []).map((r: any) => r.date)
          : [];
      const mealCount =
        results[1].status === "fulfilled" ? results[1].value.count || 0 : 0;
      const fightWeekCount =
        results[2].status === "fulfilled" ? results[2].value.count || 0 : 0;
      const completedCampCount =
        results[3].status === "fulfilled" ? results[3].value.count || 0 : 0;
      const totalCampCount =
        results[4].status === "fulfilled" ? results[4].value.count || 0 : 0;
      const allWeightDates =
        results[5].status === "fulfilled"
          ? (results[5].value.data || []).map((r: any) => r.date)
          : [];

      const data: GamificationData = {
        nutritionDates,
        mealCount,
        fightWeekCount,
        completedCampCount,
        totalCampCount,
        allWeightDates,
      };

      localCache.set(userId, CACHE_KEY, data);
      setGamificationData(data);
      setBadgesLoading(false);
    };

    fetchData().catch(() => {
      if (!cancelled) setBadgesLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Weekly consistency
  const weeklyConsistency = useMemo(() => {
    const nutritionDateSet = new Set(gamificationData?.nutritionDates || []);
    return computeWeeklyConsistency(weightLogs, nutritionDateSet);
  }, [weightLogs, gamificationData?.nutritionDates]);

  // Badges (dashboard row — unchanged)
  const badges = useMemo(
    () =>
      computeBadges(
        streak,
        gamificationData?.mealCount || 0,
        gamificationData?.fightWeekCount || 0,
        gamificationData?.completedCampCount || 0
      ),
    [streak, gamificationData]
  );

  // Full achievement tree
  const allAchievements = useMemo(
    () =>
      computeAllAchievements(
        streak,
        gamificationData?.mealCount || 0,
        gamificationData?.fightWeekCount || 0,
        gamificationData?.completedCampCount || 0,
        gamificationData?.totalCampCount || 0,
        gamificationData?.allWeightDates || [],
        profile ?? null
      ),
    [streak, gamificationData, profile]
  );

  return {
    streak,
    streakIncludesToday,
    weeklyConsistency,
    badges,
    badgesLoading,
    allAchievements,
  };
}
