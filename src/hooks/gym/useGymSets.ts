import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useUser } from "@/contexts/UserContext";
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

/**
 * Set CRUD against the gym_sessions / gym_sets Convex tables.
 * Optimistic UI is now achieved purely through React state + Convex's
 * reactive query model — the old offline syncQueue path is gone.
 */
export function useGymSets({ activeSession, updateActiveSession }: UseGymSetsOpts) {
  const { userId } = useUser();
  const { toast } = useToast();
  const addSetMut = useMutation(api.gym_sessions.addSetToSession);
  const updateSetMut = useMutation(api.gym_sessions.updateSet);
  const deleteSetMut = useMutation(api.gym_sessions.deleteSet);

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
    const group = activeSession.exerciseGroups.find(g => g.exerciseOrder === exerciseOrder);
    if (group && group.sets.length > 0) {
      // Best-effort batch delete; orphan rows are tolerable in beta.
      await Promise.allSettled(
        group.sets.map((s) => deleteSetMut({ id: s.id as unknown as Id<"gym_sets"> })),
      );
    }
    updateActiveSession(prev => ({
      ...prev,
      exerciseGroups: prev.exerciseGroups
        .filter(g => g.exerciseOrder !== exerciseOrder)
        .map((g, i) => ({ ...g, exerciseOrder: i + 1 })),
    }));
  }, [activeSession, userId, updateActiveSession, deleteSetMut]);

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
    triggerHaptic(ImpactStyle.Light);

    try {
      const insertedId = await addSetMut({
        sessionId: activeSession.sessionId as unknown as Id<"gym_sessions">,
        exerciseId: group.exercise.id as unknown as Id<"exercises">,
        exerciseOrder,
        setOrder,
        reps: setData.reps,
        weightKg: setData.weight_kg ?? undefined,
        rpe: setData.rpe ?? undefined,
        isWarmup: setData.is_warmup ?? false,
        isBodyweight: setData.is_bodyweight ?? group.exercise.is_bodyweight,
      });

      const newSet: GymSet = {
        id: insertedId as unknown as string,
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

      updateActiveSession(prev => ({
        ...prev,
        exerciseGroups: prev.exerciseGroups.map(g =>
          g.exerciseOrder === exerciseOrder
            ? { ...g, sets: [...g.sets, newSet] }
            : g
        ),
      }));

      if (!newSet.is_warmup) invalidateExerciseHistory(userId, group.exercise.id);
      return newSet;
    } catch (err) {
      toast({ description: "Failed to save set. Try again.", variant: "destructive" });
      return null;
    }
  }, [activeSession, userId, updateActiveSession, toast, addSetMut]);

  const updateSet = useCallback(async (setId: string, exerciseOrder: number, updates: Partial<{
    weight_kg: number | null;
    reps: number;
    rpe: number | null;
    is_warmup: boolean;
  }>) => {
    if (!activeSession || !userId) return;

    const group = activeSession.exerciseGroups.find(g => g.exerciseOrder === exerciseOrder);

    updateActiveSession(prev => ({
      ...prev,
      exerciseGroups: prev.exerciseGroups.map(g =>
        g.exerciseOrder === exerciseOrder
          ? { ...g, sets: g.sets.map(s => s.id === setId ? { ...s, ...updates } : s) }
          : g
      ),
    }));

    try {
      await updateSetMut({
        id: setId as unknown as Id<"gym_sets">,
        reps: updates.reps,
        weightKg: updates.weight_kg ?? undefined,
        rpe: updates.rpe ?? undefined,
        isWarmup: updates.is_warmup,
      });
      if (group) invalidateExerciseHistory(userId, group.exercise.id);
    } catch {
      // Convex query will reconcile on next refetch — the optimistic state stays.
    }
  }, [activeSession, userId, updateActiveSession, updateSetMut]);

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
      await deleteSetMut({ id: setId as unknown as Id<"gym_sets"> });
      if (group) invalidateExerciseHistory(userId, group.exercise.id);
    } catch {
      // Reactive state stays consistent — Convex truth wins next refetch.
    }
  }, [activeSession, userId, updateActiveSession, deleteSetMut]);

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
