import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useAITask } from "@/contexts/AITaskContext";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { useSubscription } from "@/hooks/useSubscription";
import { localCache } from "@/lib/localCache";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { logger } from "@/lib/logger";
import { Dumbbell, Activity, Sparkles } from "lucide-react";
import type {
  SavedRoutine,
  RoutineExercise,
  RoutineGenerationParams,
  TrainingGoal,
  CombatSport,
} from "@/pages/gym/types";

const CACHE_KEY = "saved_routines";

export function useRoutines() {
  const { userId } = useUser();
  const { safeAsync, isMounted } = useSafeAsync();
  const { toast } = useToast();
  const { addTask, completeTask, failTask } = useAITask();
  const {
    checkAIAccess,
    openPaywall,
    openNoGemsDialog,
    incrementLocalUsage,
    markLimitReached,
    handleAILimitError,
  } = useSubscription();

  const [routines, setRoutines] = useState<SavedRoutine[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(true);
  const [generatingRoutine, setGeneratingRoutine] = useState(false);

  const fetchRoutines = useCallback(async () => {
    if (!userId) return;

    const cached = localCache.get<SavedRoutine[]>(userId, CACHE_KEY);
    if (cached) safeAsync(setRoutines)(cached);

    try {
      const { data, error } = await withSupabaseTimeout(
        supabase
          .from("saved_routines")
          .select("*")
          .eq("user_id", userId)
          .order("sort_order")
          .order("created_at", { ascending: false }),
        undefined,
        "Fetch saved routines"
      );

      if (error) throw error;
      if (!isMounted()) return;

      const typed = (data || []) as SavedRoutine[];
      safeAsync(setRoutines)(typed);
      localCache.set(userId, CACHE_KEY, typed);
    } catch (err) {
      logger.error("Failed to fetch routines", err);
      if (!localCache.get(userId, CACHE_KEY)) {
        toast({ description: "Failed to load routines", variant: "destructive" });
      }
    } finally {
      if (isMounted()) safeAsync(setRoutinesLoading)(false);
    }
  }, [userId, safeAsync, isMounted, toast]);

  useEffect(() => {
    fetchRoutines();
  }, [fetchRoutines]);

  const generateRoutine = useCallback(
    async (params: RoutineGenerationParams) => {
      if (!checkAIAccess()) {
        openNoGemsDialog();
        return null;
      }

      safeAsync(setGeneratingRoutine)(true);
      const taskId = addTask({
        id: `gym-routine-${Date.now()}`,
        type: "gym-routine",
        label: "Generating Routine",
        steps: [
          { icon: Dumbbell, label: "Planning exercises" },
          { icon: Activity, label: "Optimizing sets & reps" },
          { icon: Sparkles, label: "Finalizing routine" },
        ],
        returnPath: "/gym?tab=routines",
      });

      try {
        const { data, error } = await supabase.functions.invoke(
          "workout-generator",
          { body: params }
        );

        if (error) {
          if (handleAILimitError(error)) { failTask(taskId, "Limit reached"); return null; }
          throw error;
        }

        incrementLocalUsage();
        const routine = data?.routineData || data;
        if (!routine?.exercises) {
          failTask(taskId, "No exercises returned");
          return null;
        }
        const result = {
          exercises: routine.exercises as RoutineExercise[],
          name: routine.routine_name || routine.name || "Generated Routine",
          notes: routine.notes || "",
          recommendedGymDays: routine.recommended_gym_days || null,
          splitUsed: routine.split_used || null,
        };
        completeTask(taskId, result);
        return result;
      } catch (err: any) {
        failTask(taskId, err?.message || "Failed to generate routine");
        logger.error("Failed to generate routine", err);
        toast({
          description: "Failed to generate routine",
          variant: "destructive",
        });
        return null;
      } finally {
        if (isMounted()) safeAsync(setGeneratingRoutine)(false);
      }
    },
    [
      checkAIAccess,
      openPaywall,
      openNoGemsDialog,
      incrementLocalUsage,
      markLimitReached,
      handleAILimitError,
      safeAsync,
      isMounted,
      toast,
    ]
  );

  const saveRoutine = useCallback(
    async (
      name: string,
      goal: TrainingGoal,
      exercises: RoutineExercise[],
      sport?: CombatSport,
      trainingDays?: number,
      isAiGenerated?: boolean
    ) => {
      if (!userId) return;

      try {
        const { error } = await withSupabaseTimeout(
          supabase.from("saved_routines").insert({
            user_id: userId,
            name,
            goal,
            exercises,
            sport: sport || null,
            training_days_per_week: trainingDays || null,
            is_ai_generated: isAiGenerated ?? false,
          }),
          undefined,
          "Save routine"
        );

        if (error) throw error;

        await fetchRoutines();
      } catch (err) {
        logger.error("Failed to save routine", err);
        toast({ description: "Failed to save routine", variant: "destructive" });
      }
    },
    [userId, fetchRoutines, toast]
  );

  const deleteRoutine = useCallback(
    async (id: string) => {
      if (!userId) return;

      try {
        const { error } = await withSupabaseTimeout(
          supabase.from("saved_routines")
            .delete()
            .eq("id", id),
          undefined,
          "Delete routine"
        );

        if (error) throw error;

        setRoutines((prev) => {
          const updated = prev.filter((r) => r.id !== id);
          localCache.set(userId, CACHE_KEY, updated);
          return updated;
        });

      } catch (err) {
        logger.error("Failed to delete routine", err);
        toast({
          description: "Failed to delete routine",
          variant: "destructive",
        });
      }
    },
    [userId, toast]
  );

  const renameRoutine = useCallback(
    async (id: string, name: string) => {
      if (!userId) return;

      try {
        const { error } = await withSupabaseTimeout(
          supabase.from("saved_routines")
            .update({ name, updated_at: new Date().toISOString() })
            .eq("id", id),
          undefined,
          "Rename routine"
        );

        if (error) throw error;

        setRoutines((prev) => {
          const updated = prev.map((r) =>
            r.id === id ? { ...r, name } : r
          );
          localCache.set(userId, CACHE_KEY, updated);
          return updated;
        });
      } catch (err) {
        logger.error("Failed to rename routine", err);
        toast({
          description: "Failed to rename routine",
          variant: "destructive",
        });
      }
    },
    [userId, toast]
  );

  return {
    routines,
    routinesLoading,
    generatingRoutine,
    fetchRoutines,
    generateRoutine,
    saveRoutine,
    deleteRoutine,
    renameRoutine,
  };
}
