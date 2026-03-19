import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { localCache } from "@/lib/localCache";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic, celebrateSuccess } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { calculateVolume } from "@/lib/gymCalculations";
import type {
  GymSession, GymSet, Exercise, SessionType,
  ExerciseGroup, SessionWithSets, ActiveWorkout,
} from "@/pages/gym/types";

const HISTORY_CACHE_KEY = "gym_session_history";
const ACTIVE_SESSION_KEY = "wcw_active_gym_session";

export function useGymSessions() {
  const { userId } = useUser();
  const { safeAsync, isMounted } = useSafeAsync();
  const { toast } = useToast();
  const [history, setHistory] = useState<SessionWithSets[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<ActiveWorkout | null>(null);
  const exerciseCacheRef = useRef<Map<string, Exercise>>(new Map());

  // Recover active session from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ActiveWorkout;
        setActiveSession(parsed);
      }
    } catch {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  }, []);

  // Persist active session to localStorage on change
  useEffect(() => {
    if (activeSession) {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(activeSession));
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  }, [activeSession]);

  const buildExerciseGroups = useCallback((sets: GymSet[], exercises: Exercise[]): ExerciseGroup[] => {
    const exerciseMap = new Map<string, Exercise>();
    for (const ex of exercises) exerciseMap.set(ex.id, ex);

    const groups = new Map<string, ExerciseGroup>();
    for (const set of sets) {
      const key = `${set.exercise_order}-${set.exercise_id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          exercise: exerciseMap.get(set.exercise_id) || {
            id: set.exercise_id,
            user_id: null,
            name: "Unknown Exercise",
            category: "push",
            muscle_group: "chest",
            equipment: null,
            is_bodyweight: false,
            is_custom: false,
            created_at: "",
          },
          exerciseOrder: set.exercise_order,
          sets: [],
        });
      }
      groups.get(key)!.sets.push(set);
    }

    return Array.from(groups.values()).sort((a, b) => a.exerciseOrder - b.exerciseOrder);
  }, []);

  const fetchHistory = useCallback(async (limit = 20) => {
    if (!userId) return;

    const cached = localCache.get<SessionWithSets[]>(userId, HISTORY_CACHE_KEY);
    if (cached) safeAsync(setHistory)(cached);

    try {
      const { data: sessions, error: sessErr } = await withSupabaseTimeout(
        supabase
          .from("gym_sessions" as any)
          .select("*")
          .eq("user_id", userId)
          .eq("status", "completed")
          .order("date", { ascending: false })
          .limit(limit),
        undefined,
        "Fetch gym session history"
      );

      if (sessErr) throw sessErr;
      if (!isMounted() || !sessions?.length) {
        if (isMounted()) {
          safeAsync(setHistory)([]);
          safeAsync(setHistoryLoading)(false);
        }
        return;
      }

      const sessionIds = (sessions as any[]).map((s: any) => s.id);

      const { data: allSets, error: setsErr } = await withSupabaseTimeout(
        supabase
          .from("gym_sets" as any)
          .select("*")
          .in("session_id", sessionIds)
          .order("exercise_order")
          .order("set_order"),
        undefined,
        "Fetch gym sets for history"
      );

      if (setsErr) throw setsErr;
      if (!isMounted()) return;

      const typedSets = (allSets as any[] || []) as GymSet[];
      const exerciseIds = [...new Set(typedSets.map(s => s.exercise_id))];

      // Fetch exercises we don't have cached
      const uncachedIds = exerciseIds.filter(id => !exerciseCacheRef.current.has(id));
      if (uncachedIds.length > 0) {
        const { data: exData } = await withSupabaseTimeout(
          supabase
            .from("exercises" as any)
            .select("*")
            .in("id", uncachedIds),
          undefined,
          "Fetch exercises for history"
        );
        if (exData) {
          for (const ex of exData as any[]) {
            exerciseCacheRef.current.set(ex.id, ex as Exercise);
          }
        }
      }

      const allExercises = Array.from(exerciseCacheRef.current.values());

      const enriched: SessionWithSets[] = (sessions as any[]).map((session: any) => {
        const sessionSets = typedSets.filter(s => s.session_id === session.id);
        const groups = buildExerciseGroups(sessionSets, allExercises);
        return {
          ...session,
          sets: sessionSets,
          exercises: groups.map(g => g.exercise),
          exerciseGroups: groups,
          totalVolume: calculateVolume(sessionSets),
          exerciseCount: groups.length,
        } as SessionWithSets;
      });

      if (isMounted()) {
        safeAsync(setHistory)(enriched);
        localCache.set(userId, HISTORY_CACHE_KEY, enriched);
      }
    } catch (err) {
      if (!localCache.get(userId, HISTORY_CACHE_KEY)) {
        toast({ description: "Failed to load workout history", variant: "destructive" });
      }
    } finally {
      if (isMounted()) safeAsync(setHistoryLoading)(false);
    }
  }, [userId, safeAsync, isMounted, toast, buildExerciseGroups]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const startSession = useCallback(async (sessionType: SessionType): Promise<string | null> => {
    if (!userId) return null;

    try {
      const { data, error } = await withSupabaseTimeout(
        supabase
          .from("gym_sessions" as any)
          .insert({
            user_id: userId,
            session_type: sessionType,
            status: "in_progress",
            date: new Date().toISOString().split("T")[0],
          } as any)
          .select()
          .single(),
        undefined,
        "Start gym session"
      );

      if (error) throw error;

      const session = data as any;
      const workout: ActiveWorkout = {
        sessionId: session.id,
        sessionType,
        startedAt: Date.now(),
        exerciseGroups: [],
      };

      setActiveSession(workout);
      triggerHaptic(ImpactStyle.Medium);
      toast({ description: `${sessionType} workout started` });
      return session.id;
    } catch (err) {
      toast({ description: "Failed to start workout", variant: "destructive" });
      return null;
    }
  }, [userId, toast]);

  const finishSession = useCallback(async (opts: {
    durationMinutes?: number;
    notes?: string;
    perceivedFatigue?: number;
  }) => {
    if (!userId || !activeSession) return false;

    try {
      const elapsed = Math.round((Date.now() - activeSession.startedAt) / 60000);

      const { error } = await withSupabaseTimeout(
        supabase
          .from("gym_sessions" as any)
          .update({
            status: "completed",
            duration_minutes: opts.durationMinutes ?? elapsed,
            notes: opts.notes || null,
            perceived_fatigue: opts.perceivedFatigue || null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", activeSession.sessionId),
        undefined,
        "Finish gym session"
      );

      if (error) throw error;

      // Also log to fight camp calendar
      const durationMin = opts.durationMinutes ?? elapsed;
      supabase
        .from("fight_camp_calendar")
        .insert({
          user_id: userId,
          date: new Date().toISOString().split("T")[0],
          session_type: activeSession.sessionType,
          duration_minutes: durationMin,
          rpe: opts.perceivedFatigue ?? 5,
          intensity: durationMin >= 60 ? "high" : durationMin >= 30 ? "moderate" : "low",
          notes: opts.notes || null,
        })
        .then(); // fire-and-forget

      setActiveSession(null);
      celebrateSuccess();
      toast({ description: "Workout completed!" });
      // Refresh history
      fetchHistory();
      return true;
    } catch (err) {
      toast({ description: "Failed to finish workout", variant: "destructive" });
      return false;
    }
  }, [userId, activeSession, toast, fetchHistory]);

  const discardSession = useCallback(async () => {
    if (!activeSession) return;

    try {
      await withSupabaseTimeout(
        supabase
          .from("gym_sessions" as any)
          .delete()
          .eq("id", activeSession.sessionId),
        undefined,
        "Discard gym session"
      );
    } catch {
      // Best effort — still clear local state
    }

    setActiveSession(null);
    toast({ description: "Workout discarded" });
  }, [activeSession, toast]);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!userId) return;

    try {
      const { error } = await withSupabaseTimeout(
        supabase
          .from("gym_sessions" as any)
          .delete()
          .eq("id", sessionId),
        undefined,
        "Delete gym session"
      );

      if (error) throw error;

      setHistory(prev => {
        const updated = prev.filter(s => s.id !== sessionId);
        localCache.set(userId, HISTORY_CACHE_KEY, updated);
        return updated;
      });

      toast({ description: "Session deleted" });
    } catch {
      toast({ description: "Failed to delete session", variant: "destructive" });
    }
  }, [userId, toast]);

  const updateActiveSession = useCallback((updater: (prev: ActiveWorkout) => ActiveWorkout) => {
    setActiveSession(prev => prev ? updater(prev) : prev);
  }, []);

  return {
    history,
    historyLoading,
    activeSession,
    startSession,
    finishSession,
    discardSession,
    deleteSession,
    updateActiveSession,
    refetchHistory: fetchHistory,
  };
}
