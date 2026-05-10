import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { celebrateSuccess } from "@/lib/haptics";
import { calculateEpley1RM, calculateSetVolume, comparePR } from "@/lib/gymCalculations";
import type { ExercisePR, GymSet, PRRecord } from "@/pages/gym/types";

export function useExercisePRs() {
  const { userId } = useUser();
  const { toast } = useToast();
  // Reactive Convex query — auto-refreshes whenever a PR is upserted.
  const rows = useQuery(api.exercise_prs.getForUser, userId ? {} : "skip");
  const updatePRMut = useMutation(api.exercise_prs.updatePR);

  const prs = useMemo(() => {
    const map = new Map<string, ExercisePR>();
    for (const pr of (rows ?? []) as unknown as ExercisePR[]) {
      map.set(pr.exercise_id, pr);
    }
    return map;
  }, [rows]);

  const loading = rows === undefined;
  const prsRef = useRef(prs);
  useEffect(() => { prsRef.current = prs; }, [prs]);

  const checkAndUpdatePR = useCallback(async (set: GymSet): Promise<PRRecord[]> => {
    if (!userId || set.is_warmup) return [];

    const existingPR = prsRef.current.get(set.exercise_id) ?? null;
    const newRecords = comparePR(set, existingPR);
    if (newRecords.length === 0) return [];

    const weight = set.weight_kg ?? 0;
    const volume = calculateSetVolume(set);
    const e1rm = calculateEpley1RM(weight, set.reps);

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

    try {
      await updatePRMut({
        exerciseId: set.exercise_id as unknown as Id<"exercises">,
        bestSetId: set.id as unknown as Id<"gym_sets">,
        maxWeightKg: Math.max(weight, existingPR?.max_weight_kg ?? 0),
        maxReps: Math.max(set.reps, existingPR?.max_reps ?? 0),
        maxVolume: Math.max(volume, existingPR?.max_volume ?? 0),
        estimated1rm: Math.max(e1rm, existingPR?.estimated_1rm ?? 0),
      });
    } catch {
      // Reactive query will re-sync from server next mount.
    }

    return newRecords;
  }, [userId, toast, updatePRMut]);

  const getPRForExercise = useCallback((exerciseId: string): ExercisePR | null => {
    return prs.get(exerciseId) ?? null;
  }, [prs]);

  // No-op refetch helper retained for callers that depended on it. Convex
  // queries are reactive — there's nothing to manually re-fetch.
  const refetch = useCallback(async () => { /* no-op under Convex */ }, []);

  // Surface the stable map under both names for backward compat.
  const [stableMap, setStableMap] = useState<Map<string, ExercisePR>>(new Map());
  useEffect(() => { setStableMap(prs); }, [prs]);

  return {
    prs: stableMap,
    loading,
    checkAndUpdatePR,
    getPRForExercise,
    refetch,
  };
}
