import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic, celebrateSuccess, confirmDelete } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { calculateVolume } from "@/lib/gymCalculations";
import { logger } from "@/lib/logger";
import { invalidateGymAnalytics } from "./useGymAnalytics";
import type {
  GymSet, Exercise, SessionType,
  ExerciseGroup, SessionWithSets, ActiveWorkout,
} from "@/pages/gym/types";

const ACTIVE_SESSION_KEY = "wcw_active_gym_session";

export function useGymSessions() {
  const { userId } = useUser();
  const { toast } = useToast();

  // Active session lives in localStorage so refresh / app-resume restores it.
  const [activeSession, setActiveSession] = useState<ActiveWorkout | null>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_SESSION_KEY);
      return saved ? JSON.parse(saved) as ActiveWorkout : null;
    } catch {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return null;
    }
  });

  // Reactive history query — Convex pushes updates when sets/sessions change.
  const sessionsRaw = useQuery(api.gym_sessions.listHistory, userId ? { limit: 20 } : "skip");
  const allExercises = useQuery(api.exercises.listForUser, userId ? {} : "skip");

  // The history view used to include per-session sets. We fetch sets per
  // session via individual `getSessionWithSets` queries lazily; for the list
  // view we synthesise empty sets to keep render fast.
  const exercisesMap = useMemo(() => {
    const map = new Map<string, Exercise>();
    for (const ex of (allExercises ?? []) as unknown as Exercise[]) map.set(ex.id, ex);
    return map;
  }, [allExercises]);

  // Hydrate history with sets resolved server-side via `listHistoryWithSets`
  // would be cleaner; for now we expose the bare session list (used by the
  // GymTracker history tab) and let detail pages pull sets via getSessionWithSets.
  const history: SessionWithSets[] = useMemo(() => {
    return ((sessionsRaw ?? []) as any[]).map((s) => ({
      ...s,
      sets: [] as GymSet[],
      exercises: [] as Exercise[],
      exerciseGroups: [] as ExerciseGroup[],
      totalVolume: 0,
      exerciseCount: 0,
    }));
  }, [sessionsRaw]);
  const historyLoading = sessionsRaw === undefined;
  void calculateVolume; // kept import for downstream consumers
  void exercisesMap;

  // Persist active session to localStorage on change.
  useEffect(() => {
    if (activeSession) {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(activeSession));
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  }, [activeSession]);

  // Mutations.
  const createSessionMut = useMutation(api.gym_sessions.createSession);
  const completeSessionMut = useMutation(api.gym_sessions.completeSession);
  const deleteSessionMut = useMutation(api.gym_sessions.deleteSession);
  const updateSetMut = useMutation(api.gym_sessions.updateSet);
  const deleteSetMut = useMutation(api.gym_sessions.deleteSet);
  const createCalendarEntryMut = useMutation(api.fight_camp.createCalendarEntry);

  const startSession = useCallback(async (sessionType: SessionType): Promise<string | null> => {
    if (!userId) {
      toast({ description: "Please sign in to start a workout", variant: "destructive" });
      return null;
    }

    if (activeSession) {
      return activeSession.sessionId;
    }

    try {
      const sessionId = await createSessionMut({
        date: new Date().toISOString().split("T")[0],
        sessionType,
        status: "in_progress",
      });
      const workout: ActiveWorkout = {
        sessionId: sessionId as unknown as string,
        sessionType,
        startedAt: Date.now(),
        exerciseGroups: [],
      };
      setActiveSession(workout);
      triggerHaptic(ImpactStyle.Medium);
      return workout.sessionId;
    } catch (err) {
      logger.error("startSession failed", err);
      const msg = (err as any)?.message || "Failed to start workout";
      toast({ description: msg, variant: "destructive" });
      return null;
    }
  }, [userId, activeSession, toast, createSessionMut]);

  const finishSession = useCallback(async (opts: {
    durationMinutes?: number;
    notes?: string;
    perceivedFatigue?: number;
  }) => {
    if (!userId || !activeSession) return false;

    try {
      const elapsed = Math.round((Date.now() - activeSession.startedAt) / 60000);
      const durationMin = opts.durationMinutes ?? elapsed;

      await completeSessionMut({
        id: activeSession.sessionId as unknown as Id<"gym_sessions">,
        durationMinutes: durationMin,
        notes: opts.notes ?? undefined,
        perceivedFatigue: opts.perceivedFatigue ?? undefined,
      });

      invalidateGymAnalytics(userId);

      // Also log to training calendar (best-effort).
      try {
        await createCalendarEntryMut({
          date: new Date().toISOString().split("T")[0],
          sessionType: activeSession.sessionType,
          durationMinutes: durationMin,
          rpe: opts.perceivedFatigue ?? 5,
          intensity: durationMin >= 60 ? "high" : durationMin >= 30 ? "moderate" : "low",
          notes: opts.notes ?? undefined,
        });
      } catch (calErr) {
        logger.warn("Failed to log gym session to training calendar", { error: String(calErr) });
      }

      setActiveSession(null);
      celebrateSuccess();
      return true;
    } catch (err) {
      toast({ description: "Failed to finish workout", variant: "destructive" });
      return false;
    }
  }, [userId, activeSession, toast, completeSessionMut, createCalendarEntryMut]);

  const discardSession = useCallback(async () => {
    if (!activeSession) return;
    try {
      await deleteSessionMut({
        id: activeSession.sessionId as unknown as Id<"gym_sessions">,
      });
    } catch {
      // Best effort — still clear local state.
    }
    setActiveSession(null);
  }, [activeSession, deleteSessionMut]);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!userId) return;
    try {
      await deleteSessionMut({ id: sessionId as unknown as Id<"gym_sessions"> });
      invalidateGymAnalytics(userId);
      confirmDelete();
    } catch {
      toast({ description: "Failed to delete session", variant: "destructive" });
    }
  }, [userId, toast, deleteSessionMut]);

  const updateActiveSession = useCallback((updater: (prev: ActiveWorkout) => ActiveWorkout) => {
    setActiveSession(prev => prev ? updater(prev) : prev);
  }, []);

  const updateCompletedSet = useCallback(async (
    setId: string,
    updates: Partial<{ weight_kg: number | null; reps: number; is_warmup: boolean }>,
  ) => {
    if (!userId) return;
    try {
      await updateSetMut({
        id: setId as unknown as Id<"gym_sets">,
        reps: updates.reps,
        weightKg: updates.weight_kg ?? undefined,
        isWarmup: updates.is_warmup,
      });
      invalidateGymAnalytics(userId);
    } catch {
      // Reactive state will resync.
    }
  }, [userId, updateSetMut]);

  const deleteCompletedSet = useCallback(async (setId: string) => {
    if (!userId) return;
    try {
      await deleteSetMut({ id: setId as unknown as Id<"gym_sets"> });
      invalidateGymAnalytics(userId);
    } catch {
      // Reactive state will resync.
    }
  }, [userId, deleteSetMut]);

  const refetchHistory = useCallback(async (_limit = 20) => { /* reactive — no-op */ }, []);

  return {
    history,
    historyLoading,
    activeSession,
    startSession,
    finishSession,
    discardSession,
    deleteSession,
    updateActiveSession,
    updateCompletedSet,
    deleteCompletedSet,
    refetchHistory,
  };
}
