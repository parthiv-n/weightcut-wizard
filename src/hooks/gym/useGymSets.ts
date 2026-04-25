import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { syncQueue } from "@/lib/syncQueue";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { gymSetSchema } from "@/lib/validation";
import { invalidateExerciseHistory } from "./useGymAnalytics";
import type { GymSet, Exercise, ExerciseGroup, ActiveWorkout } from "@/pages/gym/types";

interface UseGymSetsOpts {
  activeSession: ActiveWorkout | null;
  updateActiveSession: (updater: (prev: ActiveWorkout) => ActiveWorkout) => void;
}

export function useGymSets({ activeSession, updateActiveSession }: UseGymSetsOpts) {
  const { userId } = useUser();
  const { toast } = useToast();

  const addExerciseToSession = useCallback((exercise: Exercise) => {
    if (!activeSession || !userId) return;

    const nextOrder = activeSession.exerciseGroups.length + 1;
    const newGroup: ExerciseGroup = {
      exercise,
      exerciseOrder: nextOrder,
      sets: [],
    };

    updateActiveSession(prev => ({
      ...prev,
      exerciseGroups: [...prev.exerciseGroups, newGroup],
    }));

    triggerHaptic(ImpactStyle.Light);
  }, [activeSession, userId, updateActiveSession]);

  const removeExerciseFromSession = useCallback(async (exerciseOrder: number) => {
    if (!activeSession || !userId) return;

    // Batch delete sets from DB
    const group = activeSession.exerciseGroups.find(g => g.exerciseOrder === exerciseOrder);
    if (group && group.sets.length > 0) {
      const setIds = group.sets.map(s => s.id);
      try {
        await withSupabaseTimeout(
          supabase.from("gym_sets" as any).delete().in("id", setIds),
          undefined,
          "Delete exercise sets"
        );
      } catch {
        // Best effort — sets orphaned but not critical
      }
    }

    updateActiveSession(prev => ({
      ...prev,
      exerciseGroups: prev.exerciseGroups
        .filter(g => g.exerciseOrder !== exerciseOrder)
        .map((g, i) => ({ ...g, exerciseOrder: i + 1 })),
    }));
  }, [activeSession, userId, updateActiveSession]);

  const addSet = useCallback(async (exerciseOrder: number, setData: {
    weight_kg?: number | null;
    reps: number;
    rpe?: number | null;
    is_warmup?: boolean;
    is_bodyweight?: boolean;
  }): Promise<GymSet | null> => {
    if (!activeSession || !userId) return null;

    const group = activeSession.exerciseGroups.find(g => g.exerciseOrder === exerciseOrder);
    if (!group) return null;

    const validation = gymSetSchema.safeParse(setData);
    if (!validation.success) {
      toast({ description: validation.error.errors[0].message, variant: "destructive" });
      return null;
    }

    const setOrder = group.sets.length + 1;
    const newSetId = crypto.randomUUID();

    const newSet: GymSet = {
      id: newSetId,
      session_id: activeSession.sessionId,
      exercise_id: group.exercise.id,
      user_id: userId,
      set_order: setOrder,
      exercise_order: exerciseOrder,
      weight_kg: setData.weight_kg ?? null,
      reps: setData.reps,
      rpe: setData.rpe ?? null,
      is_warmup: setData.is_warmup ?? false,
      is_bodyweight: setData.is_bodyweight ?? group.exercise.is_bodyweight,
      assisted_weight_kg: null,
      notes: null,
      created_at: new Date().toISOString(),
    };

    // Optimistic update
    updateActiveSession(prev => ({
      ...prev,
      exerciseGroups: prev.exerciseGroups.map(g =>
        g.exerciseOrder === exerciseOrder
          ? { ...g, sets: [...g.sets, newSet] }
          : g
      ),
    }));

    triggerHaptic(ImpactStyle.Light);

    // Persist to DB
    try {
      // Best-effort auth refresh — prevents all sets failing after app resume
      try { await supabase.auth.refreshSession(); } catch { /* queued if this fails */ }
      const { error } = await withSupabaseTimeout(
        supabase.from("gym_sets" as any).insert({
          id: newSetId,
          session_id: activeSession.sessionId,
          exercise_id: group.exercise.id,
          user_id: userId,
          set_order: setOrder,
          exercise_order: exerciseOrder,
          weight_kg: newSet.weight_kg,
          reps: newSet.reps,
          rpe: newSet.rpe,
          is_warmup: newSet.is_warmup,
          is_bodyweight: newSet.is_bodyweight,
          assisted_weight_kg: newSet.assisted_weight_kg,
          notes: newSet.notes,
        } as any),
        undefined,
        "Add gym set"
      );

      if (error) throw error;
      // Bust the chart cache for this exercise so Strength Progression reflects the new set immediately
      if (!newSet.is_warmup) invalidateExerciseHistory(userId, group.exercise.id);
    } catch {
      // Queue for offline sync
      syncQueue.enqueue(userId, {
        table: "gym_sets",
        action: "insert",
        payload: {
          id: newSetId,
          session_id: activeSession.sessionId,
          exercise_id: group.exercise.id,
          user_id: userId,
          set_order: setOrder,
          exercise_order: exerciseOrder,
          weight_kg: newSet.weight_kg,
          reps: newSet.reps,
          rpe: newSet.rpe,
          is_warmup: newSet.is_warmup,
          is_bodyweight: newSet.is_bodyweight,
        },
        recordId: newSetId,
        timestamp: Date.now(),
      });
    }

    return newSet;
  }, [activeSession, userId, updateActiveSession, toast]);

  const updateSet = useCallback(async (setId: string, exerciseOrder: number, updates: Partial<{
    weight_kg: number | null;
    reps: number;
    rpe: number | null;
    is_warmup: boolean;
  }>) => {
    if (!activeSession || !userId) return;

    const group = activeSession.exerciseGroups.find(g => g.exerciseOrder === exerciseOrder);

    // Optimistic
    updateActiveSession(prev => ({
      ...prev,
      exerciseGroups: prev.exerciseGroups.map(g =>
        g.exerciseOrder === exerciseOrder
          ? { ...g, sets: g.sets.map(s => s.id === setId ? { ...s, ...updates } : s) }
          : g
      ),
    }));

    try {
      const { error } = await withSupabaseTimeout(
        supabase.from("gym_sets" as any).update(updates as any).eq("id", setId),
        undefined,
        "Update gym set"
      );

      if (error) throw error;
      if (group) invalidateExerciseHistory(userId, group.exercise.id);
    } catch {
      syncQueue.enqueue(userId, {
        table: "gym_sets",
        action: "update",
        payload: updates,
        recordId: setId,
        timestamp: Date.now(),
      });
    }
  }, [activeSession, userId, updateActiveSession]);

  const deleteSet = useCallback(async (setId: string, exerciseOrder: number) => {
    if (!activeSession || !userId) return;

    const group = activeSession.exerciseGroups.find(g => g.exerciseOrder === exerciseOrder);

    updateActiveSession(prev => ({
      ...prev,
      exerciseGroups: prev.exerciseGroups.map(g =>
        g.exerciseOrder === exerciseOrder
          ? {
              ...g,
              sets: g.sets
                .filter(s => s.id !== setId)
                .map((s, i) => ({ ...s, set_order: i + 1 })),
            }
          : g
      ),
    }));

    try {
      await withSupabaseTimeout(
        supabase.from("gym_sets" as any).delete().eq("id", setId),
        undefined,
        "Delete gym set"
      );
      if (group) invalidateExerciseHistory(userId, group.exercise.id);
    } catch {
      syncQueue.enqueue(userId, {
        table: "gym_sets",
        action: "delete",
        payload: {},
        recordId: setId,
        timestamp: Date.now(),
      });
    }
  }, [activeSession, userId, updateActiveSession]);

  const duplicateLastSet = useCallback(async (exerciseOrder: number): Promise<GymSet | null> => {
    if (!activeSession) return null;

    const group = activeSession.exerciseGroups.find(g => g.exerciseOrder === exerciseOrder);
    if (!group || group.sets.length === 0) return null;

    const lastSet = group.sets[group.sets.length - 1];
    return addSet(exerciseOrder, {
      weight_kg: lastSet.weight_kg,
      reps: lastSet.reps,
      rpe: lastSet.rpe,
      is_warmup: lastSet.is_warmup,
      is_bodyweight: lastSet.is_bodyweight,
    });
  }, [activeSession, addSet]);

  return {
    addExerciseToSession,
    removeExerciseFromSession,
    addSet,
    updateSet,
    deleteSet,
    duplicateLastSet,
  };
}
