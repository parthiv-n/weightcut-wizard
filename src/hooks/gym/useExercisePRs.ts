import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { localCache } from "@/lib/localCache";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { useToast } from "@/hooks/use-toast";
import { celebrateSuccess } from "@/lib/haptics";
import { calculateEpley1RM, calculateSetVolume, comparePR } from "@/lib/gymCalculations";
import type { ExercisePR, GymSet, PRRecord } from "@/pages/gym/types";

const PR_CACHE_KEY = "exercise_prs";
const CACHE_TTL = 60 * 60 * 1000; // 1h

export function useExercisePRs() {
  const { userId } = useUser();
  const { safeAsync, isMounted } = useSafeAsync();
  const { toast } = useToast();
  const [prs, setPrs] = useState<Map<string, ExercisePR>>(new Map());
  const [loading, setLoading] = useState(true);
  const prsRef = useRef(prs);
  prsRef.current = prs;

  const fetchPRs = useCallback(async () => {
    if (!userId) return;

    const cached = localCache.get<[string, ExercisePR][]>(userId, PR_CACHE_KEY, CACHE_TTL);
    if (cached) {
      safeAsync(setPrs)(new Map(cached));
      safeAsync(setLoading)(false);
    }

    try {
      const { data, error } = await withSupabaseTimeout(
        supabase
          .from("exercise_prs" as any)
          .select("*")
          .eq("user_id", userId)
          .limit(200),
        undefined,
        "Fetch exercise PRs"
      );

      if (error) throw error;
      if (!isMounted()) return;

      const map = new Map<string, ExercisePR>();
      for (const pr of (data as any[] || []) as ExercisePR[]) {
        map.set(pr.exercise_id, pr);
      }

      safeAsync(setPrs)(map);
      localCache.set(userId, PR_CACHE_KEY, Array.from(map.entries()));
    } catch {
      // Cache fallback is fine
    } finally {
      if (isMounted()) safeAsync(setLoading)(false);
    }
  }, [userId, safeAsync, isMounted]);

  useEffect(() => {
    fetchPRs();
  }, [fetchPRs]);

  const checkAndUpdatePR = useCallback(async (set: GymSet): Promise<PRRecord[]> => {
    if (!userId || set.is_warmup) return [];

    const existingPR = prsRef.current.get(set.exercise_id) ?? null;
    const newRecords = comparePR(set, existingPR);

    if (newRecords.length === 0) return [];

    const weight = set.weight_kg ?? 0;
    const volume = calculateSetVolume(set);
    const e1rm = calculateEpley1RM(weight, set.reps);

    const upsertData = {
      user_id: userId,
      exercise_id: set.exercise_id,
      max_weight_kg: Math.max(weight, existingPR?.max_weight_kg ?? 0),
      max_reps: Math.max(set.reps, existingPR?.max_reps ?? 0),
      max_volume: Math.max(volume, existingPR?.max_volume ?? 0),
      estimated_1rm: Math.max(e1rm, existingPR?.estimated_1rm ?? 0),
      best_set_id: set.id,
      updated_at: new Date().toISOString(),
    };

    // Optimistic update
    const optimisticPR: ExercisePR = {
      id: existingPR?.id ?? crypto.randomUUID(),
      ...upsertData,
    };
    setPrs(prev => {
      const next = new Map(prev);
      next.set(set.exercise_id, optimisticPR);
      localCache.set(userId, PR_CACHE_KEY, Array.from(next.entries()));
      return next;
    });

    // Celebrate
    const prTypes = newRecords.map(r => {
      switch (r.type) {
        case "weight": return "Weight";
        case "reps": return "Rep";
        case "volume": return "Volume";
        case "1rm": return "1RM";
      }
    });
    toast({ description: `New PR! ${prTypes.join(" + ")} record!` });
    celebrateSuccess();

    // Persist
    try {
      if (existingPR) {
        await withSupabaseTimeout(
          supabase
            .from("exercise_prs" as any)
            .update(upsertData as any)
            .eq("id", existingPR.id),
          undefined,
          "Update exercise PR"
        );
      } else {
        await withSupabaseTimeout(
          supabase
            .from("exercise_prs" as any)
            .insert(upsertData as any),
          undefined,
          "Insert exercise PR"
        );
      }
    } catch {
      // Optimistic state is already set — will sync on next fetch
    }

    return newRecords;
  }, [userId, toast]);

  const getPRForExercise = useCallback((exerciseId: string): ExercisePR | null => {
    return prs.get(exerciseId) ?? null;
  }, [prs]);

  return {
    prs,
    loading,
    checkAndUpdatePR,
    getPRForExercise,
    refetch: fetchPRs,
  };
}
