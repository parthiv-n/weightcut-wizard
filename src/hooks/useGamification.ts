import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { localCache } from "@/lib/localCache";

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
  icon: "Flame" | "Calendar" | "Utensils" | "Trophy";
  unlocked: boolean;
  progress: number; // 0-1
}

interface GamificationData {
  nutritionDates: string[];
  mealCount: number;
  fightWeekCount: number;
  completedCampCount: number;
}

const CACHE_KEY = "gamification_data";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function getDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function computeStreak(weightLogs: { date: string }[]): {
  streak: number;
  streakIncludesToday: boolean;
} {
  const today = getDateString(new Date());
  const dateSet = new Set(weightLogs.map((l) => l.date));

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

export function useGamification(
  userId: string | null,
  weightLogs: { date: string; weight_kg: string }[],
  todayCalories: number
) {
  const [gamificationData, setGamificationData] =
    useState<GamificationData | null>(null);
  const [badgesLoading, setBadgesLoading] = useState(true);

  // Streak — pure computation from weight logs
  const { streak, streakIncludesToday } = useMemo(
    () => computeStreak(weightLogs),
    [weightLogs]
  );

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

      const data: GamificationData = {
        nutritionDates,
        mealCount,
        fightWeekCount,
        completedCampCount,
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

  // Badges
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

  return {
    streak,
    streakIncludesToday,
    weeklyConsistency,
    badges,
    badgesLoading,
  };
}
