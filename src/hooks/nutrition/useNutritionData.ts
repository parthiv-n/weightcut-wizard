import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { AIPersistence } from "@/lib/aiPersistence";
import { nutritionCache, onMealsChange } from "@/lib/nutritionCache";
import { localCache } from "@/lib/localCache";
import { syncQueue } from "@/lib/syncQueue";
import { preloadAdjacentDates } from "@/lib/backgroundSync";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { calculateCalorieTarget as calculateCalorieTargetUtil } from "@/lib/calorieCalculation";
import { logger } from "@/lib/logger";
import type { Meal, MacroGoals, Ingredient } from "@/pages/nutrition/types";
import type { DietAnalysisResult } from "@/types/dietAnalysis";

const LOCAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — stale-while-revalidate handles freshness

interface UseNutritionDataParams {
  selectedDate: string;
  meals: Meal[];
  setMeals: React.Dispatch<React.SetStateAction<Meal[]>>;
  mealPlanIdeas: Meal[];
  setMealPlanIdeas: React.Dispatch<React.SetStateAction<Meal[]>>;
  dailyCalorieTarget: number;
  setDailyCalorieTarget: React.Dispatch<React.SetStateAction<number>>;
  aiMacroGoals: MacroGoals | null;
  setAiMacroGoals: React.Dispatch<React.SetStateAction<MacroGoals | null>>;
  setSafetyStatus: React.Dispatch<React.SetStateAction<"green" | "yellow" | "red">>;
  setSafetyMessage: React.Dispatch<React.SetStateAction<string>>;
}

export function useNutritionData(params: UseNutritionDataParams) {
  const {
    selectedDate, meals, setMeals, mealPlanIdeas, setMealPlanIdeas,
    dailyCalorieTarget, setDailyCalorieTarget,
    aiMacroGoals, setAiMacroGoals,
    setSafetyStatus, setSafetyMessage,
  } = params;

  const { isSessionValid, checkSessionValidity, refreshSession, userId, profile: contextProfile, refreshProfile } = useUser();
  const profile = contextProfile;
  const { safeAsync, isMounted } = useSafeAsync();
  const { toast } = useToast();
  const [fetchingMacroGoals, setFetchingMacroGoals] = useState(false);
  const [mealsLoading, setMealsLoading] = useState(false);
  const lastFetchRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDateRef = useRef(selectedDate);
  const mealsRef = useRef(meals);
  mealsRef.current = meals;

  // Diet analysis state
  const [dietAnalysis, setDietAnalysis] = useState<DietAnalysisResult | null>(null);
  const [dietAnalysisLoading, setDietAnalysisLoading] = useState(false);

  // Share stats
  const [shareOpen, setShareOpen] = useState(false);
  const [nutritionStreak, setNutritionStreak] = useState(0);
  const [totalMealsLogged, setTotalMealsLogged] = useState(0);

  const calculateCalorieTarget = (profileData: any) => {
    const target = calculateCalorieTargetUtil(profileData);
    setDailyCalorieTarget(target);
    setSafetyStatus("green");
    setSafetyMessage("");
  };

  const fetchMacroGoals = async () => {
    if (!profile) return;

    const fightWeekTarget = profile.fight_week_target_kg;
    if (!fightWeekTarget) {
      safeAsync(setAiMacroGoals)(null);
      return;
    }

    safeAsync(setFetchingMacroGoals)(true);
    try {
      if (!userId) {
        safeAsync(setAiMacroGoals)(null);
        safeAsync(setFetchingMacroGoals)(false);
        return;
      }

      // Check localStorage first for cold-start instant render
      const persistedMacros = localCache.get<any>(userId, 'macro_goals', 60 * 60 * 1000);
      if (persistedMacros?.macroGoals) {
        safeAsync(setAiMacroGoals)(persistedMacros.macroGoals);
        if (persistedMacros.dailyCalorieTarget) {
          safeAsync(setDailyCalorieTarget)(persistedMacros.dailyCalorieTarget);
        }
        safeAsync(setFetchingMacroGoals)(false);
      }

      const cachedMacroGoals = nutritionCache.getMacroGoals(userId);
      if (cachedMacroGoals) {
        safeAsync(setAiMacroGoals)(cachedMacroGoals.macroGoals);
        if (cachedMacroGoals.dailyCalorieTarget) {
          safeAsync(setDailyCalorieTarget)(cachedMacroGoals.dailyCalorieTarget);
        }
        if (cachedMacroGoals.profileUpdate && profile && profile.manual_nutrition_override !== cachedMacroGoals.profileUpdate.manual_nutrition_override) {
          refreshProfile();
        }
        safeAsync(setFetchingMacroGoals)(false);
        return;
      }

      const profileData = contextProfile;

      if (!profileData) {
        setAiMacroGoals(null);
      } else if (profileData?.ai_recommended_calories) {
        const macroGoals: MacroGoals = {
          proteinGrams: profileData.ai_recommended_protein_g || 0,
          carbsGrams: profileData.ai_recommended_carbs_g || 0,
          fatsGrams: profileData.ai_recommended_fats_g || 0,
          recommendedCalories: profileData.ai_recommended_calories || 0,
        };

        setAiMacroGoals(macroGoals);
        setDailyCalorieTarget(profileData.ai_recommended_calories);
        if (profile && profile.manual_nutrition_override !== profileData.manual_nutrition_override) {
          refreshProfile();
        }

        const macroData = {
          macroGoals,
          dailyCalorieTarget: profileData.ai_recommended_calories,
          profileUpdate: { manual_nutrition_override: profileData.manual_nutrition_override }
        };
        nutritionCache.setMacroGoals(userId, macroData);
        localCache.set(userId, 'macro_goals', macroData);
      } else {
        setAiMacroGoals(null);
      }
    } catch (error) {
      safeAsync(setAiMacroGoals)(null);
    } finally {
      safeAsync(setFetchingMacroGoals)(false);
    }
  };

  const loadMeals = async (skipCache = false, _retryCount = 0, silent = false, clearAnalysis = false) => {
    if (!userId) return;
    const fetchDate = selectedDate; // capture for stale-closure guard
    lastFetchRef.current = Date.now();

    if (clearAnalysis && _retryCount === 0) {
      setDietAnalysis(null);
      AIPersistence.remove(userId, `diet_analysis_${fetchDate}`);
    }

    // Clear any pending retry since we're fetching now
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (!skipCache) {
      const cachedMeals = nutritionCache.getMeals(userId, fetchDate);
      if (cachedMeals) {
        setMeals(cachedMeals);
        safeAsync(setMealsLoading)(false);
        return;
      }
    }

    // Try localStorage with 2hr TTL — serve from cache, then continue to DB for background revalidation
    let servedFromLocal = false;
    if (!skipCache) {
      const localMeals = localCache.getForDate<Meal[]>(userId, "nutrition_logs", fetchDate, LOCAL_CACHE_TTL_MS);
      if (localMeals && localMeals.length > 0) {
        // Normalize meal_name to prevent "Untitled" display from stale cache
        const normalized = localMeals.map(m => ({ ...m, meal_name: m.meal_name || "Meal" }));
        setMeals(normalized);
        nutritionCache.setMeals(userId, fetchDate, localMeals);
        safeAsync(setMealsLoading)(false);
        servedFromLocal = true;
        // Don't return — continue to DB so stale cache gets corrected
      }
    }

    // Only show loading skeleton if we have nothing to display and this isn't a silent/post-mutation refresh
    const hasVisibleMeals = mealsRef.current.length > 0;
    if (!silent && !servedFromLocal && !hasVisibleMeals) {
      safeAsync(setMealsLoading)(true);
    }

    let data: any[] | null = null;
    try {
      const result = await withSupabaseTimeout(
        supabase
          .from("nutrition_logs")
          .select("id, meal_name, calories, protein_g, carbs_g, fats_g, meal_type, portion_size, recipe_notes, is_ai_generated, ingredients, date, created_at")
          .eq("user_id", userId)
          .eq("date", fetchDate)
          .order("created_at", { ascending: true })
          .limit(100),
        undefined,
        "Load meals"
      );
      if (result.error) throw result.error;
      data = result.data;
    } catch (err) {
      if (!isMounted()) return;
      logger.error("Error loading meals", err);
      {
        // Last-resort: try localStorage without TTL for offline fallback
        const fallback = localCache.getForDate<Meal[]>(userId, "nutrition_logs", fetchDate);
        if (fallback && fallback.length > 0) {
          setMeals(fallback);
          safeAsync(setMealsLoading)(false);
        }
        // Schedule auto-retry with backoff (3s, 6s, 12s, max 15s)
        const delay = Math.min(3000 * Math.pow(2, _retryCount), 15000);
        retryTimerRef.current = setTimeout(() => {
          if (isMounted()) loadMeals(true, _retryCount + 1);
        }, delay);
      }
      return;
    }

    if (!isMounted()) return;
    // Stale response guard — user may have navigated to a different date
    if (activeDateRef.current !== fetchDate) return;

    const typedMeals = (data || []).map(meal => ({
      ...meal,
      ingredients: (meal.ingredients as unknown) as Ingredient[] | undefined,
    }));

    const pendingOps = syncQueue.peek(userId);
    const dbIds = new Set(typedMeals.map(m => m.id));

    const pendingDeleteIds = new Set(
      pendingOps
        .filter(op => op.table === "nutrition_logs" && op.action === "delete")
        .map(op => op.recordId)
    );
    let mergedMeals: Meal[] = typedMeals.filter(m => !pendingDeleteIds.has(m.id)) as Meal[];

    const pendingInserts = pendingOps.filter(
      op =>
        op.table === "nutrition_logs" &&
        op.action === "insert" &&
        (op.payload as any).date === fetchDate &&
        !dbIds.has(op.recordId)
    );
    for (const op of pendingInserts) {
      const p = op.payload as any;
      mergedMeals.push({
        id: op.recordId,
        meal_name: p.meal_name || "Logged meal",
        calories: p.calories,
        protein_g: p.protein_g ?? undefined,
        carbs_g: p.carbs_g ?? undefined,
        fats_g: p.fats_g ?? undefined,
        meal_type: p.meal_type || "snack",
        portion_size: p.portion_size ?? undefined,
        recipe_notes: p.recipe_notes ?? undefined,
        ingredients: p.ingredients ?? undefined,
        is_ai_generated: p.is_ai_generated,
        date: p.date ?? fetchDate,
      });
    }

    // Update state only if data actually changed (prevents flicker on navigation)
    const currentMeals = mealsRef.current;
    const serializedNew = JSON.stringify(mergedMeals);
    const serializedCurrent = JSON.stringify(currentMeals);
    if (serializedNew !== serializedCurrent) {
      setMeals(mergedMeals as Meal[]);
    }
    safeAsync(setMealsLoading)(false);
    nutritionCache.setMeals(userId, fetchDate, mergedMeals as Meal[]);
    localCache.setForDate(userId, "nutrition_logs", fetchDate, mergedMeals);
  };

  // Load meals on date/user change
  useEffect(() => {
    activeDateRef.current = selectedDate;
    const hasCachedMeals = userId && (
      nutritionCache.getMeals(userId, selectedDate) ||
      localCache.getForDate(userId, "nutrition_logs", selectedDate, LOCAL_CACHE_TTL_MS)
    );
    if (!hasCachedMeals) setMealsLoading(true);
    loadMeals();
    if (userId) setTimeout(() => preloadAdjacentDates(userId, selectedDate), 2000);
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [selectedDate, userId]);

  // Recalculate calorie target when relevant profile fields change
  useEffect(() => {
    if (contextProfile) calculateCalorieTarget(contextProfile);
  }, [contextProfile?.ai_recommended_calories, contextProfile?.tdee, contextProfile?.bmr,
      contextProfile?.current_weight_kg, contextProfile?.goal_weight_kg,
      contextProfile?.manual_nutrition_override]);

  // Load persisted meal plans once on mount
  useEffect(() => {
    if (!userId) return;
    const persistedData = AIPersistence.load(userId, 'meal_plans');
    if (persistedData && mealPlanIdeas.length === 0) {
      setMealPlanIdeas(persistedData.meals || []);
      if (persistedData.dailyCalorieTarget) setDailyCalorieTarget(persistedData.dailyCalorieTarget);
      if (persistedData.safetyStatus) setSafetyStatus(persistedData.safetyStatus);
      if (persistedData.safetyMessage) setSafetyMessage(persistedData.safetyMessage);
    }
  }, [userId]);

  // Visibility-based revalidation — silent refresh keeps existing meals visible
  useEffect(() => {
    const handleVis = () => {
      if (document.visibilityState === 'visible' && userId) {
        if (Date.now() - lastFetchRef.current < 2000) return;
        loadMeals(true, 0, /* silent */ true);
      }
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => document.removeEventListener('visibilitychange', handleVis);
  }, [userId, selectedDate]);

  // Load cached diet analysis on date change
  useEffect(() => {
    if (!userId) return;
    const cached = AIPersistence.load(userId, `diet_analysis_${selectedDate}`);
    setDietAnalysis(cached || null);
  }, [selectedDate, userId]);

  // Fetch macro goals when profile changes
  useEffect(() => {
    if (contextProfile) {
      fetchMacroGoals();
    }
  }, [contextProfile?.ai_recommended_protein_g, contextProfile?.ai_recommended_carbs_g,
      contextProfile?.ai_recommended_fats_g, contextProfile?.ai_recommended_calories,
      contextProfile?.manual_nutrition_override]);

  // Subscribe to in-process cache change events (fed by useMealsRealtime at app level).
  // On any insert/update/delete for the selected date, reflect into local state.
  useEffect(() => {
    if (!userId) return;
    const unsubscribe = onMealsChange((evt) => {
      if (evt.userId !== userId) return;
      if (evt.date !== activeDateRef.current) return;
      const cached = nutritionCache.getMeals(userId, evt.date);
      if (cached) setMeals(cached as Meal[]);
    });
    return unsubscribe;
  }, [userId, setMeals]);

  // Profile realtime — kept for profile changes only (unchanged behavior, simplified)
  useEffect(() => {
    if (!userId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribeTimer = setTimeout(() => {
      channel = supabase
        .channel("profile-nutrition-updates")
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        }, () => { refreshProfile(); })
        .subscribe();
    }, 3000);

    return () => {
      clearTimeout(subscribeTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, refreshProfile]);

  // Fetch share stats
  const fetchShareStats = useCallback(async () => {
    if (!userId) return;

    const cached = localCache.get<{ totalMeals: number; streak: number }>(userId, "share_stats", 60 * 60 * 1000);
    if (cached) {
      setTotalMealsLogged(cached.totalMeals);
      setNutritionStreak(cached.streak);
      return;
    }

    try {
      const [countResult, datesResult] = await Promise.allSettled([
        supabase.from("nutrition_logs").select("*", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("nutrition_logs").select("date").eq("user_id", userId)
          .gte("date", format(subDays(new Date(), 90), "yyyy-MM-dd"))
          .order("date", { ascending: false })
          .limit(90),
      ]);

      const totalMeals = countResult.status === "fulfilled" ? countResult.value.count || 0 : 0;
      const dateRows = datesResult.status === "fulfilled" ? datesResult.value.data || [] : [];

      setTotalMealsLogged(totalMeals);

      const dates = [...new Set(dateRows.map((r: any) => r.date?.slice(0, 10)))].filter(Boolean).sort().reverse();
      let streak = 0;
      let cursor = new Date();
      for (let i = 0; i < dates.length + 1; i++) {
        const expected = format(cursor, "yyyy-MM-dd");
        if (dates.includes(expected)) {
          streak++;
        } else if (i > 0) {
          break;
        }
        cursor = subDays(cursor, 1);
      }
      setNutritionStreak(streak);

      localCache.set(userId, "share_stats", { totalMeals, streak });
    } catch {
      // silent
    }
  }, [userId]);

  const handleShareOpen = useCallback(() => {
    setShareOpen(true);
    fetchShareStats();
  }, [fetchShareStats]);

  return {
    loadMeals,
    fetchMacroGoals,
    calculateCalorieTarget,
    fetchingMacroGoals,
    mealsLoading,
    dietAnalysis, setDietAnalysis,
    dietAnalysisLoading, setDietAnalysisLoading,
    shareOpen, setShareOpen,
    nutritionStreak,
    totalMealsLogged,
    handleShareOpen,
    lastFetchRef,
  };
}

// Ref to track quick add sheet state for warmup effect
const isQuickAddSheetOpenRef = { current: false };
export function setQuickAddSheetOpenRef(val: boolean) {
  isQuickAddSheetOpenRef.current = val;
}
