import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { AIPersistence } from "@/lib/aiPersistence";
import { localCache } from "@/lib/localCache";
import { nutritionCache } from "@/lib/nutritionCache";
import { syncQueue } from "@/lib/syncQueue";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { celebrateSuccess } from "@/lib/haptics";
import { logger } from "@/lib/logger";
import { resolveMealType } from "@/lib/buildMealPayload";
import { coerceMealName } from "@/lib/mealName";
import {
  buildCreateMealRpcArgs,
  ingredientsToRpcItems,
  type CreateMealRpcArgs,
} from "@/lib/buildMealRpcArgs";
import type { Meal, Ingredient } from "@/pages/nutrition/types";

// Re-export the helper so the tester's gate can pull it from this module.
export { buildCreateMealRpcArgs } from "@/lib/buildMealRpcArgs";

interface UseMealOperationsParams {
  meals: Meal[];
  setMeals: React.Dispatch<React.SetStateAction<Meal[]>>;
  mealPlanIdeas: Meal[];
  setMealPlanIdeas: React.Dispatch<React.SetStateAction<Meal[]>>;
  selectedDate: string;
  loadMeals: (skipCache?: boolean) => Promise<void>;
}

/** Internal: build the full optimistic Meal row that matches meals_with_totals shape. */
function buildOptimisticMeal(args: {
  id: string;
  date: string;
  args: CreateMealRpcArgs;
  ingredients?: Ingredient[] | null;
  portion_size?: string | null;
  recipe_notes?: string | null;
}): Meal {
  const { id, date, args: rpcArgs, ingredients, portion_size, recipe_notes } = args;
  const totals = rpcArgs.p_items.reduce(
    (acc, it) => ({
      calories: acc.calories + it.calories,
      protein_g: acc.protein_g + it.protein_g,
      carbs_g: acc.carbs_g + it.carbs_g,
      fats_g: acc.fats_g + it.fats_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0 }
  );
  return {
    id,
    meal_name: rpcArgs.p_meal_name,
    meal_type: rpcArgs.p_meal_type,
    calories: Math.round(totals.calories),
    protein_g: totals.protein_g,
    carbs_g: totals.carbs_g,
    fats_g: totals.fats_g,
    portion_size: portion_size ?? undefined,
    recipe_notes: recipe_notes ?? undefined,
    ingredients: ingredients ?? undefined,
    is_ai_generated: rpcArgs.p_is_ai_generated,
    notes: rpcArgs.p_notes,
    item_count: rpcArgs.p_items.length,
    date,
  };
}

export function useMealOperations(params: UseMealOperationsParams) {
  const { setMeals, setMealPlanIdeas, selectedDate, loadMeals } = params;
  const { userId } = useUser();
  const { toast } = useToast();
  const { isMounted: _isMounted } = useSafeAsync();
  const [loggingMeal, setLoggingMeal] = useState<string | null>(null);
  const [savingAllMeals, setSavingAllMeals] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mealToDelete, setMealToDelete] = useState<Meal | null>(null);

  /**
   * Single point-of-truth for every insert path. Builds RPC args, fires an
   * optimistic cache row, queues the op for offline replay, then calls
   * `create_meal_with_items`. The pre-generated UUID is written to the meal
   * row on success via an update so optimistic keys stay stable.
   *
   * Note: the RPC generates its own meal/item UUIDs server-side. We only use
   * the `optimisticId` for local React keys + sync queue dedupe until the
   * realtime subscription surfaces the canonical row (at which point the
   * cache merges the real `id` by `date`).
   */
  const runInsertFlow = useCallback(async (opts: {
    args: CreateMealRpcArgs;
    ingredients?: Ingredient[] | null;
    portion_size?: string | null;
    recipe_notes?: string | null;
    successToast?: { title: string; description?: string };
  }) => {
    if (!userId) throw new Error("Not authenticated");
    const optimisticId = crypto.randomUUID();

    const optimisticMeal = buildOptimisticMeal({
      id: optimisticId,
      date: selectedDate,
      args: opts.args,
      ingredients: opts.ingredients,
      portion_size: opts.portion_size,
      recipe_notes: opts.recipe_notes,
    });

    setMeals((prev) => {
      const updated = [...prev, optimisticMeal];
      localCache.setForDate(userId, "nutrition_logs", selectedDate, updated);
      nutritionCache.setMeals(userId, selectedDate, updated);
      localCache.remove(userId, "gamification_data");
      return updated;
    });

    // Queue for offline replay — replay path calls RPC with the same payload.
    syncQueue.enqueue(userId, {
      table: "meals",
      action: "insert",
      payload: opts.args as unknown as Record<string, unknown>,
      recordId: optimisticId,
      timestamp: Date.now(),
      persistOnFailure: true,
    });

    try {
      const { data, error } = await withSupabaseTimeout(
        supabase.rpc("create_meal_with_items", opts.args),
        undefined,
        "create_meal_with_items"
      );
      if (error) throw error;

      // Swap the optimistic id for the canonical one returned by the RPC so
      // realtime INSERT events don't produce duplicate rows in cache.
      const canonical = Array.isArray(data) && data.length > 0 ? data[0] : null;
      const canonicalId = canonical?.meal_id ?? optimisticId;
      if (canonicalId && canonicalId !== optimisticId) {
        setMeals((prev) => {
          const updated = prev.map((m) => (m.id === optimisticId ? { ...m, id: canonicalId } : m));
          localCache.setForDate(userId, "nutrition_logs", selectedDate, updated);
          nutritionCache.setMeals(userId, selectedDate, updated);
          return updated;
        });
      }

      celebrateSuccess();
      if (opts.successToast) toast(opts.successToast);
      syncQueue.dequeueByRecordId(userId, optimisticId);
      return canonicalId;
    } catch (err) {
      logger.error("create_meal_with_items failed (queued for sync)", err);
      celebrateSuccess();
      toast({ title: "Saved offline", description: "Will sync when connected." });
      return optimisticId;
    }
  }, [userId, selectedDate, setMeals, toast]);

  // ── Insert path 1: manual submit ──
  const saveMealToDb = useCallback(async (mealData: {
    meal_name: string;
    calories: number;
    protein_g: number | null;
    carbs_g: number | null;
    fats_g: number | null;
    meal_type: string;
    portion_size: string | null;
    recipe_notes: string | null;
    ingredients: Ingredient[] | null;
    is_ai_generated: boolean;
  }) => {
    if (!userId) throw new Error("Not authenticated");

    const items = ingredientsToRpcItems(mealData.ingredients);
    const args = buildCreateMealRpcArgs({
      header: {
        meal_name: mealData.meal_name,
        meal_type: mealData.meal_type,
        date: selectedDate,
        notes: mealData.recipe_notes,
        is_ai_generated: mealData.is_ai_generated,
      },
      items,
      fallbackTotals: {
        calories: mealData.calories,
        protein_g: mealData.protein_g,
        carbs_g: mealData.carbs_g,
        fats_g: mealData.fats_g,
        name: coerceMealName(mealData.meal_name, mealData.meal_type),
      },
    });

    await runInsertFlow({
      args,
      ingredients: mealData.ingredients,
      portion_size: mealData.portion_size,
      recipe_notes: mealData.recipe_notes,
    });
  }, [userId, selectedDate, runInsertFlow]);

  // ── Insert path 2: log a meal-plan idea ──
  const handleLogMealIdea = useCallback(async (mealIdea: Meal, mealTypeOverride?: string) => {
    setLoggingMeal(mealIdea.id);
    try {
      if (!userId) throw new Error("Not authenticated");

      const mealType = resolveMealType(mealTypeOverride ?? mealIdea.meal_type);
      const consistentCalories =
        (mealIdea.protein_g || 0) * 4 + (mealIdea.carbs_g || 0) * 4 + (mealIdea.fats_g || 0) * 9;

      const items = ingredientsToRpcItems(mealIdea.ingredients);
      const args = buildCreateMealRpcArgs({
        header: {
          meal_name: mealIdea.meal_name,
          meal_type: mealType,
          date: selectedDate,
          notes: mealIdea.recipe_notes ?? null,
          is_ai_generated: true,
        },
        items,
        fallbackTotals: {
          calories: consistentCalories || mealIdea.calories,
          protein_g: mealIdea.protein_g ?? null,
          carbs_g: mealIdea.carbs_g ?? null,
          fats_g: mealIdea.fats_g ?? null,
          name: coerceMealName(mealIdea.meal_name, mealType),
        },
      });

      await runInsertFlow({
        args,
        ingredients: mealIdea.ingredients,
        portion_size: mealIdea.portion_size,
        recipe_notes: mealIdea.recipe_notes,
        successToast: { title: "Meal logged!", description: `${mealIdea.meal_name} added to your day` },
      });
    } catch (error) {
      logger.error("Error logging meal", error);
      toast({ title: "Error", description: "Failed to log meal", variant: "destructive" });
    } finally {
      setLoggingMeal(null);
    }
  }, [userId, selectedDate, runInsertFlow, toast]);

  // ── Insert path 3: save all meal-plan ideas as real meals ──
  const saveMealIdeasToDatabase = async (mealIdeas: Meal[]) => {
    if (mealIdeas.length === 0 || savingAllMeals) return;
    setSavingAllMeals(true);
    try {
      if (!userId) throw new Error("Not authenticated");

      for (const meal of mealIdeas) {
        const recalcCal = (meal.protein_g || 0) * 4 + (meal.carbs_g || 0) * 4 + (meal.fats_g || 0) * 9;
        const mealType = resolveMealType(meal.meal_type);
        const items = ingredientsToRpcItems((meal.ingredients as Ingredient[] | null | undefined));
        const args = buildCreateMealRpcArgs({
          header: {
            meal_name: meal.meal_name,
            meal_type: mealType,
            date: selectedDate,
            notes: meal.recipe_notes ?? null,
            is_ai_generated: true,
          },
          items,
          fallbackTotals: {
            calories: recalcCal || meal.calories,
            protein_g: meal.protein_g ?? null,
            carbs_g: meal.carbs_g ?? null,
            fats_g: meal.fats_g ?? null,
            name: coerceMealName(meal.meal_name, mealType),
          },
        });
        await runInsertFlow({
          args,
          ingredients: meal.ingredients,
          portion_size: meal.portion_size,
          recipe_notes: meal.recipe_notes,
        });
      }

      setMealPlanIdeas([]);
      AIPersistence.remove(userId, "meal_plans");
      toast({ title: "All meals saved!", description: `${mealIdeas.length} meals added to your day` });
    } catch (error: any) {
      logger.error("Error saving meal ideas", error);
      toast({ title: "Error saving meals", description: error.message || "Failed to save meals", variant: "destructive" });
    } finally {
      setSavingAllMeals(false);
    }
  };

  const clearMealIdeas = async () => {
    setMealPlanIdeas([]);
    try {
      if (userId) AIPersistence.remove(userId, "meal_plans");
    } catch (e) {
      logger.warn("Failed to clear persisted meal plans", { error: String(e) });
    }
  };

  // ── Delete: cascade removes items. ──
  const initiateDeleteMeal = useCallback((meal: Meal) => {
    setMealToDelete(meal);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteMeal = useCallback(async () => {
    if (!mealToDelete || !userId) return;
    const deletedId = mealToDelete.id;

    setMeals((prev) => {
      const updated = prev.filter((m) => m.id !== deletedId);
      localCache.setForDate(userId, "nutrition_logs", selectedDate, updated);
      nutritionCache.setMeals(userId, selectedDate, updated);
      return updated;
    });
    setDeleteDialogOpen(false);
    setMealToDelete(null);

    syncQueue.enqueue(userId, {
      table: "meals",
      action: "delete",
      payload: {},
      recordId: deletedId,
      timestamp: Date.now(),
      persistOnFailure: true,
    });

    try {
      const { error } = await withSupabaseTimeout(
        supabase.from("meals").delete().eq("id", deletedId),
        undefined,
        "Delete meal"
      );
      if (error) throw error;
      await loadMeals(true);
      syncQueue.dequeueByRecordId(userId, deletedId);
    } catch (error) {
      logger.error("Error deleting meal (queued for sync)", error);
      toast({ title: "Deleted offline", description: "Will sync when connected." });
    }
  }, [mealToDelete, userId, setMeals, selectedDate, loadMeals, toast]);

  // ── Insert path 4: food-search select ──
  const handleFoodSearchSelected = useCallback(async (food: {
    meal_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    serving_size: string;
    portion_size: string;
    food_id?: string | null;
    grams?: number | null;
  }, foodSearchMealType: string) => {
    if (!userId) return;
    const mealType = resolveMealType(foodSearchMealType);
    const args = buildCreateMealRpcArgs({
      header: {
        meal_name: food.meal_name,
        meal_type: mealType,
        date: selectedDate,
        notes: null,
        is_ai_generated: false,
      },
      items: [{
        name: food.meal_name,
        grams: food.grams ?? null,
        calories: food.calories,
        protein_g: food.protein_g,
        carbs_g: food.carbs_g,
        fats_g: food.fats_g,
        food_id: food.food_id ?? null,
      }],
    });

    await runInsertFlow({
      args,
      portion_size: food.portion_size,
      successToast: { title: "Food logged!", description: `${food.meal_name} · ${food.calories} kcal` },
    });
  }, [userId, selectedDate, runInsertFlow]);

  return {
    loggingMeal,
    savingAllMeals,
    deleteDialogOpen, setDeleteDialogOpen,
    mealToDelete,
    saveMealToDb,
    handleLogMealIdea,
    saveMealIdeasToDatabase,
    clearMealIdeas,
    initiateDeleteMeal,
    handleDeleteMeal,
    handleFoodSearchSelected,
  };
}
