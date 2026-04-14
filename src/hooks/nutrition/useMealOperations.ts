import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { AIPersistence } from "@/lib/aiPersistence";
import { localCache } from "@/lib/localCache";
import { nutritionCache } from "@/lib/nutritionCache";
import { syncQueue } from "@/lib/syncQueue";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { celebrateSuccess, confirmDelete } from "@/lib/haptics";
import { logger } from "@/lib/logger";
import type { Meal, Ingredient } from "@/pages/nutrition/types";


interface UseMealOperationsParams {
  meals: Meal[];
  setMeals: React.Dispatch<React.SetStateAction<Meal[]>>;
  mealPlanIdeas: Meal[];
  setMealPlanIdeas: React.Dispatch<React.SetStateAction<Meal[]>>;
  selectedDate: string;
  loadMeals: (skipCache?: boolean) => Promise<void>;
}

export function useMealOperations(params: UseMealOperationsParams) {
  const { meals, setMeals, mealPlanIdeas, setMealPlanIdeas, selectedDate, loadMeals } = params;
  const { userId } = useUser();
  const { toast } = useToast();
  const { isMounted } = useSafeAsync();
  const [loggingMeal, setLoggingMeal] = useState<string | null>(null);
  const [savingAllMeals, setSavingAllMeals] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mealToDelete, setMealToDelete] = useState<Meal | null>(null);

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

    const mealId = crypto.randomUUID();

    const optimisticMeal: Meal = {
      id: mealId,
      meal_name: mealData.meal_name,
      calories: mealData.calories,
      protein_g: mealData.protein_g ?? undefined,
      carbs_g: mealData.carbs_g ?? undefined,
      fats_g: mealData.fats_g ?? undefined,
      meal_type: mealData.meal_type,
      portion_size: mealData.portion_size ?? undefined,
      recipe_notes: mealData.recipe_notes ?? undefined,
      ingredients: mealData.ingredients ?? undefined,
      is_ai_generated: mealData.is_ai_generated,
      date: selectedDate,
    };

    setMeals(prev => {
      const updatedMeals = [...prev, optimisticMeal];
      localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);
      nutritionCache.setMeals(userId, selectedDate, updatedMeals);
      localCache.remove(userId, 'gamification_data');
      return updatedMeals;
    });

    const dbPayload = {
      id: mealId,
      user_id: userId,
      date: selectedDate,
      ...mealData,
    };
    syncQueue.enqueue(userId, {
      table: "nutrition_logs",
      action: "insert",
      payload: dbPayload,
      recordId: mealId,
      timestamp: Date.now(),
    });

    try {
      const { error } = await withSupabaseTimeout(
        supabase.from("nutrition_logs").insert(dbPayload as any),
        undefined,
        "Add manual meal"
      );

      if (error) throw error;

      celebrateSuccess();
      syncQueue.dequeueByRecordId(userId, mealId);
    } catch (error) {
      logger.error("Error adding meal (queued for sync)", error);
      celebrateSuccess();
      toast({ title: "Saved offline", description: "Will sync when connected." });
    }
  }, [userId, selectedDate, setMeals, loadMeals, toast]);

  const handleLogMealIdea = useCallback(async (mealIdea: Meal, mealTypeOverride?: string) => {
    setLoggingMeal(mealIdea.id);
    try {
      if (!userId) throw new Error("Not authenticated");

      const mealId = crypto.randomUUID();
      const consistentCalories = (mealIdea.protein_g || 0) * 4 + (mealIdea.carbs_g || 0) * 4 + (mealIdea.fats_g || 0) * 9;

      const optimisticMeal: Meal = {
        id: mealId,
        meal_name: mealIdea.meal_name,
        calories: consistentCalories || mealIdea.calories,
        protein_g: mealIdea.protein_g,
        carbs_g: mealIdea.carbs_g,
        fats_g: mealIdea.fats_g,
        meal_type: mealTypeOverride || mealIdea.meal_type,
        portion_size: mealIdea.portion_size,
        recipe_notes: mealIdea.recipe_notes,
        ingredients: mealIdea.ingredients,
        is_ai_generated: true,
        date: selectedDate,
      };

      setMeals(prev => {
        const updatedMeals = [...prev, optimisticMeal];
        localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);
        nutritionCache.setMeals(userId, selectedDate, updatedMeals);
        localCache.remove(userId, 'gamification_data');
        return updatedMeals;
      });

      const dbPayload = {
        id: mealId,
        user_id: userId,
        date: selectedDate,
        meal_name: mealIdea.meal_name,
        calories: consistentCalories || mealIdea.calories,
        protein_g: mealIdea.protein_g,
        carbs_g: mealIdea.carbs_g,
        fats_g: mealIdea.fats_g,
        meal_type: mealTypeOverride || mealIdea.meal_type,
        portion_size: mealIdea.portion_size,
        recipe_notes: mealIdea.recipe_notes,
        ingredients: mealIdea.ingredients,
        is_ai_generated: true,
      };
      syncQueue.enqueue(userId, {
        table: "nutrition_logs",
        action: "insert",
        payload: dbPayload,
        recordId: mealId,
        timestamp: Date.now(),
      });

      try {
        const { error } = await withSupabaseTimeout(
          supabase.from("nutrition_logs").insert({ ...dbPayload } as any),
          undefined,
          "Log meal"
        );

        if (error) throw error;

        celebrateSuccess();
        toast({
          title: "Meal logged!",
          description: `${mealIdea.meal_name} added to your day`,
        });
        syncQueue.dequeueByRecordId(userId, mealId);
        } catch (error) {
        logger.error("Error logging meal (queued for sync)", error);
        celebrateSuccess();
        toast({ title: "Saved offline", description: "Will sync when connected." });
        }
    } catch (error) {
      logger.error("Error logging meal", error);
      toast({
        title: "Error",
        description: "Failed to log meal",
        variant: "destructive",
      });
    } finally {
      setLoggingMeal(null);
    }
  }, [userId, selectedDate, setMeals, loadMeals, toast]);

  const saveMealIdeasToDatabase = async (mealIdeas: Meal[]) => {
    if (mealIdeas.length === 0 || savingAllMeals) return;

    setSavingAllMeals(true);
    try {
      if (!userId) throw new Error("Not authenticated");

      const mealIds: string[] = [];
      const optimisticMeals: Meal[] = [];
      const dbPayloads: Record<string, unknown>[] = [];

      for (const meal of mealIdeas) {
        const mealId = crypto.randomUUID();
        mealIds.push(mealId);

        const recalcCal = (meal.protein_g || 0) * 4 + (meal.carbs_g || 0) * 4 + (meal.fats_g || 0) * 9;

        optimisticMeals.push({
          id: mealId,
          meal_name: meal.meal_name,
          calories: recalcCal || meal.calories,
          protein_g: meal.protein_g,
          carbs_g: meal.carbs_g,
          fats_g: meal.fats_g,
          meal_type: meal.meal_type,
          portion_size: meal.portion_size,
          recipe_notes: meal.recipe_notes,
          ingredients: meal.ingredients,
          is_ai_generated: true,
          date: selectedDate,
        });

        const dbPayload = {
          id: mealId,
          user_id: userId,
          date: selectedDate,
          meal_name: meal.meal_name,
          calories: recalcCal || meal.calories,
          protein_g: meal.protein_g,
          carbs_g: meal.carbs_g,
          fats_g: meal.fats_g,
          meal_type: meal.meal_type,
          portion_size: meal.portion_size,
          recipe_notes: meal.recipe_notes,
          ingredients: meal.ingredients as any,
          is_ai_generated: true,
        };
        dbPayloads.push(dbPayload);

        syncQueue.enqueue(userId, {
          table: "nutrition_logs",
          action: "insert",
          payload: dbPayload,
          recordId: mealId,
          timestamp: Date.now(),
        });
      }

      setMeals(prev => {
        const updatedMeals = [...prev, ...optimisticMeals];
        localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);
        nutritionCache.setMeals(userId, selectedDate, updatedMeals);
        localCache.remove(userId, 'gamification_data');
        return updatedMeals;
      });
      setMealPlanIdeas([]);
      AIPersistence.remove(userId, 'meal_plans');

      try {
        const { error } = await withSupabaseTimeout(
          supabase.from("nutrition_logs").insert(dbPayloads as any),
          undefined,
          "Bulk log meals"
        );

        if (error) throw error;

        celebrateSuccess();
        toast({
          title: "All meals saved!",
          description: `${mealIdeas.length} meals added to your day`,
        });
        for (const mealId of mealIds) {
          syncQueue.dequeueByRecordId(userId, mealId);
        }
        } catch (error) {
        logger.error("Error saving meals (queued for sync)", error);
        celebrateSuccess();
        toast({ title: "Saved offline", description: "Will sync when connected." });
        }
    } catch (error: any) {
      logger.error("Error saving meal ideas", error);
      toast({
        title: "Error saving meals",
        description: error.message || "Failed to save meals",
        variant: "destructive",
      });
    } finally {
      setSavingAllMeals(false);
    }
  };

  const clearMealIdeas = async () => {
    setMealPlanIdeas([]);
    try {
      if (userId) AIPersistence.remove(userId, 'meal_plans');
    } catch (e) {
      logger.warn("Failed to clear persisted meal plans", { error: String(e) });
    }
  };

  const initiateDeleteMeal = useCallback((meal: Meal) => {
    setMealToDelete(meal);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteMeal = useCallback(async () => {
    if (!mealToDelete || !userId) return;

    const deletedId = mealToDelete.id;

    setMeals(prev => {
      const updatedMeals = prev.filter(m => m.id !== deletedId);
      localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);
      nutritionCache.setMeals(userId, selectedDate, updatedMeals);
      return updatedMeals;
    });
    setDeleteDialogOpen(false);
    setMealToDelete(null);

    syncQueue.enqueue(userId, {
      table: "nutrition_logs",
      action: "delete",
      payload: {},
      recordId: deletedId,
      timestamp: Date.now(),
    });

    try {
      const { error } = await withSupabaseTimeout(
        supabase
          .from("nutrition_logs")
          .delete()
          .eq("id", deletedId),
        undefined,
        "Delete meal"
      );

      if (error) throw error;

      confirmDelete();
      await loadMeals(true);
      syncQueue.dequeueByRecordId(userId, deletedId);
    } catch (error) {
      logger.error("Error deleting meal (queued for sync)", error);
      toast({ title: "Deleted offline", description: "Will sync when connected." });
    }
  }, [mealToDelete, userId, setMeals, selectedDate, loadMeals, toast]);

  const handleFoodSearchSelected = useCallback(async (food: {
    meal_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    serving_size: string;
    portion_size: string;
  }, foodSearchMealType: string) => {
    if (!userId) return;

    const mealId = crypto.randomUUID();

    const optimisticMeal: Meal = {
      id: mealId,
      meal_name: food.meal_name,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fats_g: food.fats_g,
      meal_type: foodSearchMealType,
      portion_size: food.portion_size,
      date: selectedDate,
      is_ai_generated: false,
    };

    setMeals(prev => {
      const updatedMeals = [...prev, optimisticMeal];
      localCache.setForDate(userId, "nutrition_logs", selectedDate, updatedMeals);
      nutritionCache.setMeals(userId, selectedDate, updatedMeals);
      return updatedMeals;
    });

    const dbPayload = {
      id: mealId,
      user_id: userId,
      date: selectedDate,
      meal_name: food.meal_name,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fats_g: food.fats_g,
      meal_type: foodSearchMealType,
      portion_size: food.portion_size,
      recipe_notes: null,
      ingredients: null,
      is_ai_generated: false,
    };
    syncQueue.enqueue(userId, {
      table: "nutrition_logs",
      action: "insert",
      payload: dbPayload,
      recordId: mealId,
      timestamp: Date.now(),
    });

    try {
      const { error } = await withSupabaseTimeout(
        supabase.from("nutrition_logs").insert(dbPayload as any),
        undefined,
        "Log food"
      );

      if (error) throw error;

      celebrateSuccess();
      toast({ title: "Food logged!", description: `${food.meal_name} · ${food.calories} kcal` });
      syncQueue.dequeueByRecordId(userId, mealId);
    } catch (error) {
      logger.error("Error logging food (queued for sync)", error);
      celebrateSuccess();
      toast({ title: "Saved offline", description: "Will sync when connected." });
    }
  }, [userId, selectedDate, setMeals, loadMeals, toast]);

  // handleSaveAllMeals is just saveMealIdeasToDatabase — not wrapped separately
  // since it captures mealPlanIdeas which changes frequently

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
