import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { AIPersistence } from "@/lib/aiPersistence";
import { nutritionCache, onMealsChange, sanitizeMealRows } from "@/lib/nutritionCache";
import { localCache } from "@/lib/localCache";
import { syncQueue } from "@/lib/syncQueue";
import { preloadAdjacentDates } from "@/lib/backgroundSync";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { calculateCalorieTarget as calculateCalorieTargetUtil } from "@/lib/calorieCalculation";
import { logger } from "@/lib/logger";
import { coerceMealName } from "@/lib/mealName";
import { mapMealsWithTotalsToMeal } from "./mealsMapper";
import type { Meal, MacroGoals, MealWithTotals } from "@/pages/nutrition/types";
import type { DietAnalysisResult } from "@/types/dietAnalysis";

// Re-export so NutritionPage / MealCard can import the lazy item fetcher
// from the same entry point they already use for the data hook.
export { fetchMealItems } from "./mealsMapper";

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

  const calculateCalorieTarget = (profileData: any) => {
    const target = calculateCalorieTargetUtil(profileData);
    // Never reset the ring's calorie target to 0/falsy mid-session — a
    // transient profile refetch with incomplete data would otherwise blank
    // the progress arc. Keep the last-known-good value when the new target
    // isn't a positive number.
    if (Number.isFinite(target) && target > 0) {
      setDailyCalorieTarget(target);
    }
    setSafetyStatus("green");
    setSafetyMessage("");
  };

  const fetchMacroGoals = async () => {
    if (!profile) return;

    // Resilience: do NOT null out aiMacroGoals on transient misses — that
    // blanks the progress ring mid-session. Only OVERWRITE with fresh good
    // values; leave last-known-good values in place otherwise.
    safeAsync(setFetchingMacroGoals)(true);
    try {
      if (!userId) {
        safeAsync(setFetchingMacroGoals)(false);
        return;
      }

      // Check localStorage first for cold-start instant render
      const persistedMacros = localCache.get<any>(userId, 'macro_goals', 60 * 60 * 1000);
      if (persistedMacros?.macroGoals) {
        safeAsync(setAiMacroGoals)(persistedMacros.macroGoals);
        if (persistedMacros.dailyCalorieTarget && persistedMacros.dailyCalorieTarget > 0) {
          safeAsync(setDailyCalorieTarget)(persistedMacros.dailyCalorieTarget);
        }
        safeAsync(setFetchingMacroGoals)(false);
      }

      const cachedMacroGoals = nutritionCache.getMacroGoals(userId);
      if (cachedMacroGoals) {
        if (cachedMacroGoals.macroGoals) {
          safeAsync(setAiMacroGoals)(cachedMacroGoals.macroGoals);
        }
        if (cachedMacroGoals.dailyCalorieTarget && cachedMacroGoals.dailyCalorieTarget > 0) {
          safeAsync(setDailyCalorieTarget)(cachedMacroGoals.dailyCalorieTarget);
        }
        if (cachedMacroGoals.profileUpdate && profile && profile.manual_nutrition_override !== cachedMacroGoals.profileUpdate.manual_nutrition_override) {
          refreshProfile();
        }
        safeAsync(setFetchingMacroGoals)(false);
        return;
      }

      const profileData = contextProfile;

      if (profileData?.ai_recommended_calories) {
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
      }
      // else: profile has no AI recommendation yet — leave last-known-good
      // aiMacroGoals alone. The effectiveMacroGoals memo in NutritionPage
      // falls back to a derived split of dailyCalorieTarget when aiMacroGoals
      // is null, so the ring still renders.
    } catch (error) {
      logger.warn("fetchMacroGoals failed, keeping last-known-good values", { error: String(error) });
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
        setMeals(sanitizeMealRows<Meal>(cachedMeals));
        safeAsync(setMealsLoading)(false);
        return;
      }
    }

    // Try localStorage with 2hr TTL — serve from cache, then continue to DB for background revalidation
    let servedFromLocal = false;
    if (!skipCache) {
      const localMeals = localCache.getForDate<Meal[]>(userId, "nutrition_logs", fetchDate, LOCAL_CACHE_TTL_MS);
      const cleanLocal = sanitizeMealRows<Meal>(localMeals);
      if (cleanLocal.length > 0) {
        // Normalize meal_name to prevent "Untitled" display from stale cache
        const normalized = cleanLocal.map(m => ({ ...m, meal_name: coerceMealName(m.meal_name, m.meal_type) }));
        setMeals(normalized);
        nutritionCache.setMeals(userId, fetchDate, cleanLocal);
        safeAsync(setMealsLoading)(false);
        servedFromLocal = true;
        // Don't return — continue to DB so stale cache gets corrected
      }
    }

    // SWR: never show skeleton if we have anything to display
    const hasVisibleMeals = mealsRef.current.length > 0;
    const hasLocalCache = !!localCache.getForDate(userId, "nutrition_logs", fetchDate);
    if (!silent && !servedFromLocal && !hasVisibleMeals && !hasLocalCache) {
      safeAsync(setMealsLoading)(true);
    }

    let data: MealWithTotals[] | null = null;
    try {
      // 12s timeout — covers cold-start latency and contention with concurrent
      // auth refreshes (e.g. Food Search dialog calls supabase.auth.refreshSession
      // which can briefly queue other supabase-js requests). 6s was too aggressive
      // and caused spurious "Load meals timed out" errors while searching food.
      const result = await withSupabaseTimeout(
        supabase
          .from("meals_with_totals")
          .select("id, user_id, date, meal_type, meal_name, notes, is_ai_generated, total_calories, total_protein_g, total_carbs_g, total_fats_g, item_count, created_at")
          .eq("user_id", userId)
          .eq("date", fetchDate)
          .order("created_at", { ascending: true })
          .limit(100),
        12000,
        "Load meals"
      );
      if (result.error) throw result.error;
      data = (result.data ?? []) as MealWithTotals[];
    } catch (err) {
      if (!isMounted()) return;
      logger.error("Error loading meals", err);
      // A timeout here means the Supabase client is wedged — cycle the
      // realtime socket + force a bounded token refresh so downstream
      // consumers (food-search, weight logs, macro fetch) don't inherit
      // the stuck auth mutex. Debounced inside recoverSupabaseConnection.
      const msg = (err as { message?: string })?.message ?? "";
      if (msg.includes("timed out")) {
        const { recoverSupabaseConnection } = await import("@/lib/connectionRecovery");
        recoverSupabaseConnection("load-meals-timeout").catch(() => {});
      }
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

    const typedMeals: Meal[] = (data || []).map(mapMealsWithTotalsToMeal);

    const pendingOps = syncQueue.peek(userId);
    const dbIds = new Set(typedMeals.map(m => m.id));

    // Accept queue entries targeting the new `meals` table as well as any
    // legacy `nutrition_logs` entries that may still be in localStorage
    // (they'll be dropped on the next boot-drain).
    const isMealsQueueEntry = (t: string) => t === "meals" || t === "nutrition_logs";

    const pendingDeleteIds = new Set(
      pendingOps
        .filter(op => isMealsQueueEntry(op.table) && op.action === "delete")
        .map(op => op.recordId)
    );
    const mergedMeals: Meal[] = typedMeals.filter(m => !pendingDeleteIds.has(m.id));

    // Only merge ops that haven't permanently failed.
    interface QueuedRpcPayload {
      p_date?: string;
      p_meal_name?: string;
      p_meal_type?: string;
      p_notes?: string | null;
      p_is_ai_generated?: boolean;
      p_items?: Array<{ calories?: number; protein_g?: number; carbs_g?: number; fats_g?: number }>;
    }
    const pendingInserts = pendingOps.filter(
      op =>
        isMealsQueueEntry(op.table) &&
        op.action === "insert" &&
        !op.failed &&
        (op.payload as QueuedRpcPayload).p_date === fetchDate &&
        !dbIds.has(op.recordId)
    );
    for (const op of pendingInserts) {
      const p = op.payload as QueuedRpcPayload;
      const items = Array.isArray(p.p_items) ? p.p_items : [];
      const totals = items.reduce((acc, it) => ({
        calories: acc.calories + (Number(it.calories) || 0),
        protein_g: acc.protein_g + (Number(it.protein_g) || 0),
        carbs_g: acc.carbs_g + (Number(it.carbs_g) || 0),
        fats_g: acc.fats_g + (Number(it.fats_g) || 0),
      }), { calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0 });

      // Ghost guard: require BOTH a valid meal_type AND real calorie content.
      // An items array full of zero-calorie rows doesn't count — those surface
      // as phantom "snack · 0 kcal" entries when p_meal_type is missing and
      // the items were a fallback catch-all with no macros. The queue retry
      // will still run; if the payload is real, it'll appear on server ack.
      const hasValidType = typeof p.p_meal_type === "string" &&
        ["breakfast", "lunch", "dinner", "snack"].includes(p.p_meal_type);
      const hasRealContent = totals.calories > 0 ||
        items.some(it => Number(it.calories) > 0);
      if (!hasValidType || !hasRealContent) {
        continue;
      }

      mergedMeals.push({
        id: op.recordId,
        meal_name: coerceMealName(p.p_meal_name, p.p_meal_type),
        meal_type: p.p_meal_type || "snack",
        calories: Math.round(totals.calories),
        protein_g: totals.protein_g,
        carbs_g: totals.carbs_g,
        fats_g: totals.fats_g,
        is_ai_generated: !!p.p_is_ai_generated,
        notes: p.p_notes ?? null,
        item_count: items.length,
        date: p.p_date ?? fetchDate,
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
    // Reconciliation: drop any localCache rows that aren't in DB and aren't
    // in the pending queue. Prevents "ghost" meals from re-surfacing forever.
    const pendingRecordIds = new Set(
      pendingOps
        .filter(op => isMealsQueueEntry(op.table) && op.action === "insert" && !op.failed)
        .map(op => op.recordId)
    );
    // Scoped to fetchDate only — never pull IDs from the live `mealsRef`
    // because that may still hold a different date's meals when the user
    // navigates rapidly. Mixing them would write cross-date rows into the
    // per-date localCache.
    const keepIds = new Set<string>([
      ...typedMeals.map(m => m.id),
      ...pendingRecordIds,
      ...mergedMeals.map(m => m.id),
    ]);
    const priorLocal = localCache.getForDate<Meal[]>(userId, "nutrition_logs", fetchDate) ?? [];
    const reconciledLocal = priorLocal.filter(m => keepIds.has(m.id));
    // Only write back if we actually dropped something (avoids pointless writes)
    if (reconciledLocal.length !== priorLocal.length) {
      localCache.setForDate(userId, "nutrition_logs", fetchDate, reconciledLocal);
    }
    nutritionCache.setMeals(userId, fetchDate, mergedMeals as Meal[]);
    localCache.setForDate(userId, "nutrition_logs", fetchDate, mergedMeals);
  };

  useEffect(() => {
    activeDateRef.current = selectedDate;

    // Immediately switch the view to this date's cached meals (or empty) so
    // the previous date's meals never linger in the UI while the DB fetch is
    // in flight. Without this, today's meals remain visible when navigating
    // to a historical date because SWR keeps the stale list displayed.
    if (userId) {
      const cached =
        nutritionCache.getMeals(userId, selectedDate)
        ?? localCache.getForDate<Meal[]>(userId, "nutrition_logs", selectedDate, LOCAL_CACHE_TTL_MS);
      setMeals(sanitizeMealRows<Meal>(cached));
    } else {
      setMeals([]);
    }

    // SWR: do not flip mealsLoading here; loadMeals decides based on cache availability.
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
        // Also try to drain any pending meal ops
        syncQueue.process(userId).catch(() => { });
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
      // For DELETE: cache was patched in-place — sync state from cache.
      if (evt.type === "delete") {
        const cached = nutritionCache.getMeals(userId, evt.date);
        if (cached) setMeals(sanitizeMealRows<Meal>(cached));
        return;
      }
      // For INSERT/UPDATE: realtime invalidated the cache slot rather than
      // pushing a (lossy) raw row. Re-fetch from `meals_with_totals` so we
      // get the canonical mapped shape with aggregations.
      loadMeals(/* skipCache */ true, 0, /* silent */ true);
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

  return {
    loadMeals,
    fetchMacroGoals,
    calculateCalorieTarget,
    fetchingMacroGoals,
    mealsLoading,
    dietAnalysis, setDietAnalysis,
    dietAnalysisLoading, setDietAnalysisLoading,
    lastFetchRef,
  };
}

// Ref to track quick add sheet state for warmup effect
const isQuickAddSheetOpenRef = { current: false };
export function setQuickAddSheetOpenRef(val: boolean) {
  isQuickAddSheetOpenRef.current = val;
}
