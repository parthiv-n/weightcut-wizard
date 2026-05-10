import { useCallback, useMemo, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useUser } from "@/contexts/UserContext";
import { localCache } from "@/lib/localCache";
import { logger } from "@/lib/logger";
import type { GymSet, SessionWithSets } from "@/pages/gym/types";

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
  const convex = useConvex();
  const [loading] = useState(false);

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
    if (cached && cached.length > 0) return cached;

    try {
      const rows = await convex.query(api.gym_sessions.listSetsForExercise, {
        exerciseId: exerciseId as Id<"exercises">,
        limit,
      });
      const sets = (rows ?? []) as unknown as GymSet[];
      if (sets.length > 0) localCache.set(userId, cacheKey, sets);
      return sets;
    } catch (err) {
      logger.warn("fetchExerciseHistory failed", { exerciseId, error: String(err) });
      return [];
    }
  }, [userId, convex]);

  return {
    analytics,
    loading,
    fetchExerciseHistory,
  };
}
