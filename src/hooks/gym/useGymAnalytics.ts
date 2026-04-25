import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { localCache } from "@/lib/localCache";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { calculateVolume } from "@/lib/gymCalculations";
import { logger } from "@/lib/logger";
import type { GymSession, GymSet, SessionWithSets } from "@/pages/gym/types";

const ANALYTICS_CACHE_KEY = "gym_analytics";
const CACHE_TTL = 60 * 60 * 1000; // 1h

export function invalidateGymAnalytics(userId: string) {
  if (typeof window === 'undefined') return;
  const prefix = `wcw_${userId}_gym_exercise_history_`;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) localStorage.removeItem(key);
  }
}

/** Invalidate cached history for a single exercise — cheap, called per-set during active workouts. */
export function invalidateExerciseHistory(userId: string, exerciseId: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`wcw_${userId}_gym_exercise_history_${exerciseId}`);
}

interface WeeklyVolume {
  week: string;
  volume: number;
  sessions: number;
}

interface MuscleDistribution {
  muscleGroup: string;
  setCount: number;
  percentage: number;
}

interface GymAnalyticsData {
  weeklyVolumes: WeeklyVolume[];
  muscleDistribution: MuscleDistribution[];
  sessionsThisWeek: number;
  avgDuration: number;
  totalSessions: number;
  mostTrainedMuscle: string;
}

export function useGymAnalytics(history: SessionWithSets[]) {
  const { userId } = useUser();
  const { safeAsync, isMounted } = useSafeAsync();
  const [exerciseSetsMap, setExerciseSetsMap] = useState<Map<string, GymSet[]>>(new Map());
  const [loading, setLoading] = useState(false);

  const analytics = useMemo((): GymAnalyticsData => {
    if (!history.length) {
      return {
        weeklyVolumes: [],
        muscleDistribution: [],
        sessionsThisWeek: 0,
        avgDuration: 0,
        totalSessions: 0,
        mostTrainedMuscle: "-",
      };
    }

    // Weekly volume
    const weekMap = new Map<string, { volume: number; sessions: number }>();
    for (const session of history) {
      const date = new Date(session.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split("T")[0];

      const existing = weekMap.get(weekKey) || { volume: 0, sessions: 0 };
      existing.volume += session.totalVolume;
      existing.sessions += 1;
      weekMap.set(weekKey, existing);
    }

    const weeklyVolumes: WeeklyVolume[] = Array.from(weekMap.entries())
      .map(([week, data]) => ({ week, ...data }))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-8);

    // Muscle group distribution
    const muscleCount = new Map<string, number>();
    let totalSets = 0;
    for (const session of history) {
      for (const group of session.exerciseGroups) {
        const count = group.sets.filter(s => !s.is_warmup).length;
        muscleCount.set(
          group.exercise.muscle_group,
          (muscleCount.get(group.exercise.muscle_group) || 0) + count
        );
        totalSets += count;
      }
    }

    const muscleDistribution: MuscleDistribution[] = Array.from(muscleCount.entries())
      .map(([muscleGroup, setCount]) => ({
        muscleGroup,
        setCount,
        percentage: totalSets > 0 ? Math.round((setCount / totalSets) * 100) : 0,
      }))
      .sort((a, b) => b.setCount - a.setCount);

    // Sessions this week
    const now = new Date();
    const weekStartDate = new Date(now);
    weekStartDate.setDate(now.getDate() - now.getDay());
    weekStartDate.setHours(0, 0, 0, 0);
    const sessionsThisWeek = history.filter(s => new Date(s.date) >= weekStartDate).length;

    // Avg duration
    const withDuration = history.filter(s => s.duration_minutes);
    const avgDuration = withDuration.length > 0
      ? Math.round(withDuration.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / withDuration.length)
      : 0;

    const mostTrainedMuscle = muscleDistribution.length > 0
      ? muscleDistribution[0].muscleGroup
      : "-";

    return {
      weeklyVolumes,
      muscleDistribution,
      sessionsThisWeek,
      avgDuration,
      totalSessions: history.length,
      mostTrainedMuscle,
    };
  }, [history]);

  const fetchExerciseHistory = useCallback(async (exerciseId: string, limit = 50): Promise<GymSet[]> => {
    if (!userId) return [];

    const cacheKey = `gym_exercise_history_${exerciseId}`;
    const cached = localCache.get<GymSet[]>(userId, cacheKey, CACHE_TTL);
    // Empty arrays are NOT a valid cache hit — they'd suppress refetch for a full hour
    // even after the user has logged new sets. Only return populated caches.
    if (cached && cached.length > 0) return cached;

    try {
      // NOTE: do NOT add `.eq("user_id", userId)` here — RLS already scopes by auth.uid()
      // and adding the explicit filter excludes legacy rows where user_id was NULL,
      // making the chart show "No data yet" even when sets exist for the exercise.
      const { data, error } = await withSupabaseTimeout(
        supabase
          .from("gym_sets" as any)
          .select("*")
          .eq("exercise_id", exerciseId)
          .eq("is_warmup", false)
          .order("created_at", { ascending: false })
          .limit(limit),
        15000,
        "Fetch exercise history"
      );

      if (error) throw error;

      const sets = (data as any[] || []) as GymSet[];
      // Only cache populated results — caching [] would mask transient failures
      // and prevent the next fetch from finding newly-logged sets.
      if (sets.length > 0) localCache.set(userId, cacheKey, sets);
      return sets;
    } catch (err) {
      logger.warn("fetchExerciseHistory failed", { exerciseId, error: String(err) });
      return [];
    }
  }, [userId]);

  return {
    analytics,
    loading,
    fetchExerciseHistory,
  };
}
