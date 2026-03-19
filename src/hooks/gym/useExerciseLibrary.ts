import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { localCache } from "@/lib/localCache";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { useToast } from "@/hooks/use-toast";
import { customExerciseSchema } from "@/lib/validation";
import { EXERCISE_DATABASE } from "@/data/exerciseDatabase";
import type { Exercise, ExerciseCategory, Equipment } from "@/pages/gym/types";

const CACHE_KEY = "exercise_library";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

let _fallbackCache: Exercise[] | null = null;
function getFallbackExercises(): Exercise[] {
  if (_fallbackCache) return _fallbackCache;
  _fallbackCache = EXERCISE_DATABASE.map((seed, i) => ({
    id: `local-${i}`,
    ...seed,
    user_id: null,
    is_custom: false,
    created_at: new Date().toISOString(),
  })) as Exercise[];
  return _fallbackCache;
}

export function useExerciseLibrary() {
  const { userId } = useUser();
  const { safeAsync, isMounted } = useSafeAsync();
  const { toast } = useToast();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ExerciseCategory | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState<Equipment | null>(null);

  const fetchExercises = useCallback(async () => {
    if (!userId) return;

    // Cache first
    const cached = localCache.get<Exercise[]>(userId, CACHE_KEY, CACHE_TTL);
    if (cached) safeAsync(setExercises)(cached);

    try {
      const { data, error } = await withSupabaseTimeout(
        supabase
          .from("exercises" as any)
          .select("*")
          .order("name"),
        undefined,
        "Fetch exercises"
      );

      if (error) throw error;
      if (!isMounted()) return;

      const typed = (data as any[]) as Exercise[];
      if (typed.length > 0) {
        safeAsync(setExercises)(typed);
        localCache.set(userId, CACHE_KEY, typed);
      } else {
        // DB returned empty — use local fallback
        safeAsync(setExercises)(getFallbackExercises());
      }
    } catch (err) {
      if (!localCache.get(userId, CACHE_KEY)) {
        // Network/RLS error and no cache — use local fallback
        safeAsync(setExercises)(getFallbackExercises());
      }
    } finally {
      if (isMounted()) safeAsync(setLoading)(false);
    }
  }, [userId, safeAsync, isMounted, toast]);

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  const addCustomExercise = useCallback(async (data: {
    name: string;
    category: ExerciseCategory;
    muscle_group: string;
    equipment: Equipment | null;
    is_bodyweight: boolean;
  }): Promise<Exercise | null> => {
    if (!userId) return null;

    const result = customExerciseSchema.safeParse(data);
    if (!result.success) {
      toast({ description: result.error.errors[0].message, variant: "destructive" });
      return null;
    }

    try {
      const { data: created, error } = await withSupabaseTimeout(
        supabase
          .from("exercises" as any)
          .insert({
            user_id: userId,
            name: data.name,
            category: data.category,
            muscle_group: data.muscle_group,
            equipment: data.equipment,
            is_bodyweight: data.is_bodyweight,
            is_custom: true,
          } as any)
          .select()
          .single(),
        undefined,
        "Create custom exercise"
      );

      if (error) throw error;

      const exercise = created as unknown as Exercise;
      setExercises(prev => {
        const updated = [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name));
        if (userId) localCache.set(userId, CACHE_KEY, updated);
        return updated;
      });

      toast({ description: `${data.name} added to your exercises` });
      return exercise;
    } catch (err) {
      toast({ description: "Failed to create exercise", variant: "destructive" });
      return null;
    }
  }, [userId, toast]);

  const deleteCustomExercise = useCallback(async (exerciseId: string) => {
    if (!userId) return;

    try {
      const { error } = await withSupabaseTimeout(
        supabase.from("exercises" as any).delete().eq("id", exerciseId),
        undefined,
        "Delete custom exercise"
      );

      if (error) throw error;

      setExercises(prev => {
        const updated = prev.filter(e => e.id !== exerciseId);
        localCache.set(userId, CACHE_KEY, updated);
        return updated;
      });

      toast({ description: "Exercise deleted" });
    } catch {
      toast({ description: "Failed to delete exercise", variant: "destructive" });
    }
  }, [userId, toast]);

  const filteredExercises = useMemo(() => {
    let filtered = exercises;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.muscle_group.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    }

    if (categoryFilter) {
      filtered = filtered.filter(e => e.category === categoryFilter);
    }

    if (equipmentFilter) {
      filtered = filtered.filter(e => e.equipment === equipmentFilter);
    }

    return filtered;
  }, [exercises, searchQuery, categoryFilter, equipmentFilter]);

  const groupedByMuscle = useMemo(() => {
    const groups: Record<string, Exercise[]> = {};
    for (const ex of filteredExercises) {
      const key = ex.muscle_group;
      if (!groups[key]) groups[key] = [];
      groups[key].push(ex);
    }
    return groups;
  }, [filteredExercises]);

  return {
    exercises,
    filteredExercises,
    groupedByMuscle,
    loading,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    equipmentFilter,
    setEquipmentFilter,
    addCustomExercise,
    deleteCustomExercise,
    refetch: fetchExercises,
  };
}
