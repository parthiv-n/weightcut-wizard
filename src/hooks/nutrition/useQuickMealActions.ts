import { useState, useCallback, useEffect, useRef } from "react";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { localCache } from "@/lib/localCache";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { celebrateSuccess } from "@/lib/haptics";
import { logger } from "@/lib/logger";
import type { Meal, Ingredient, MealTemplate } from "@/pages/nutrition/types";

const FAVORITES_KEY = "meal_favorites";
const MAX_FAVORITES = 50;

interface UseQuickMealActionsParams {
  meals: Meal[];
  selectedDate: string;
  saveMealToDb: (mealData: {
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
  }) => Promise<void>;
}

export function useQuickMealActions({ meals, selectedDate, saveMealToDb }: UseQuickMealActionsParams) {
  const { userId } = useUser();
  const { toast } = useToast();

  // ── Favorites ──
  const [favorites, setFavorites] = useState<MealTemplate[]>(() => {
    if (!userId) return [];
    return localCache.get<MealTemplate[]>(userId, FAVORITES_KEY) || [];
  });

  // Reload favorites if userId changes
  const prevUserIdRef = useRef(userId);
  useEffect(() => {
    if (userId && userId !== prevUserIdRef.current) {
      prevUserIdRef.current = userId;
      setFavorites(localCache.get<MealTemplate[]>(userId, FAVORITES_KEY) || []);
    }
  }, [userId]);

  const persistFavorites = useCallback((updated: MealTemplate[]) => {
    setFavorites(updated);
    if (userId) localCache.set(userId, FAVORITES_KEY, updated);
  }, [userId]);

  const addFavorite = useCallback((meal: Meal) => {
    setFavorites((prev) => {
      // Dedupe by name + calories
      const exists = prev.findIndex((f) => f.meal_name === meal.meal_name && f.calories === meal.calories);
      const template: MealTemplate = {
        meal_name: meal.meal_name,
        calories: meal.calories,
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fats_g: meal.fats_g,
        meal_type: meal.meal_type,
        portion_size: meal.portion_size,
        recipe_notes: meal.recipe_notes,
        ingredients: meal.ingredients,
        savedAt: Date.now(),
      };
      let updated: MealTemplate[];
      if (exists >= 0) {
        // Update savedAt to bubble to top
        updated = [template, ...prev.filter((_, i) => i !== exists)];
      } else {
        updated = [template, ...prev].slice(0, MAX_FAVORITES);
      }
      if (userId) localCache.set(userId, FAVORITES_KEY, updated);
      return updated;
    });
    toast({ title: "Saved to favorites", description: meal.meal_name });
  }, [userId, toast]);

  const removeFavorite = useCallback((mealName: string) => {
    setFavorites((prev) => {
      const updated = prev.filter((f) => f.meal_name !== mealName);
      if (userId) localCache.set(userId, FAVORITES_KEY, updated);
      return updated;
    });
  }, [userId]);

  const isFavorited = useCallback((meal: Meal) => {
    return favorites.some((f) => f.meal_name === meal.meal_name && f.calories === meal.calories);
  }, [favorites]);

  const toggleFavorite = useCallback((meal: Meal) => {
    if (isFavorited(meal)) {
      removeFavorite(meal.meal_name);
      toast({ title: "Removed from favorites", description: meal.meal_name });
    } else {
      addFavorite(meal);
    }
  }, [isFavorited, removeFavorite, addFavorite, toast]);

  const logFavorite = useCallback(async (template: MealTemplate, mealType?: string) => {
    await saveMealToDb({
      meal_name: template.meal_name,
      calories: template.calories,
      protein_g: template.protein_g ?? null,
      carbs_g: template.carbs_g ?? null,
      fats_g: template.fats_g ?? null,
      meal_type: mealType || template.meal_type || "snack",
      portion_size: template.portion_size ?? null,
      recipe_notes: template.recipe_notes ?? null,
      ingredients: template.ingredients ?? null,
      is_ai_generated: false,
    });
    toast({ title: "Meal logged!", description: `${template.meal_name} · ${template.calories} kcal` });
  }, [saveMealToDb, toast]);

  // ── Copy Previous Day ──
  const [copyingPreviousDay, setCopyingPreviousDay] = useState(false);
  const [previousDayMealCount, setPreviousDayMealCount] = useState(0);

  useEffect(() => {
    if (!userId) { setPreviousDayMealCount(0); return; }
    const yesterday = format(subDays(new Date(selectedDate), 1), "yyyy-MM-dd");
    const cached = localCache.getForDate<Meal[]>(userId, "nutrition_logs", yesterday);
    setPreviousDayMealCount(cached?.length || 0);
  }, [userId, selectedDate]);

  const copyPreviousDay = useCallback(async () => {
    if (!userId || copyingPreviousDay) return;
    setCopyingPreviousDay(true);

    try {
      const yesterday = format(subDays(new Date(selectedDate), 1), "yyyy-MM-dd");
      let yesterdayMeals = localCache.getForDate<Meal[]>(userId, "nutrition_logs", yesterday);

      if (!yesterdayMeals || yesterdayMeals.length === 0) {
        const { data, error } = await withSupabaseTimeout(
          supabase
            .from("nutrition_logs")
            .select("meal_name, calories, protein_g, carbs_g, fats_g, meal_type, portion_size, recipe_notes, ingredients")
            .eq("user_id", userId)
            .eq("date", yesterday)
            .order("created_at", { ascending: true })
            .limit(50),
          undefined,
          "Copy previous day"
        );
        if (error) throw error;
        yesterdayMeals = (data || []) as Meal[];
      }

      if (yesterdayMeals.length === 0) {
        toast({ title: "Nothing to copy", description: "No meals logged yesterday" });
        return;
      }

      for (const meal of yesterdayMeals) {
        await saveMealToDb({
          meal_name: meal.meal_name,
          calories: meal.calories,
          protein_g: meal.protein_g ?? null,
          carbs_g: meal.carbs_g ?? null,
          fats_g: meal.fats_g ?? null,
          meal_type: meal.meal_type || "snack",
          portion_size: meal.portion_size ?? null,
          recipe_notes: meal.recipe_notes ?? null,
          ingredients: (meal.ingredients as Ingredient[]) ?? null,
          is_ai_generated: false,
        });
      }

      celebrateSuccess();
      toast({ title: "Day copied!", description: `${yesterdayMeals.length} meals added from yesterday` });
    } catch (error) {
      logger.error("Error copying previous day", error);
      toast({ title: "Error", description: "Failed to copy meals", variant: "destructive" });
    } finally {
      setCopyingPreviousDay(false);
    }
  }, [userId, selectedDate, saveMealToDb, copyingPreviousDay, toast]);

  // ── Repeat Last Meal ──
  const lastMeal: Meal | null = meals.length > 0 ? meals[meals.length - 1] : null;

  const repeatLastMeal = useCallback(async (mealType?: string) => {
    if (!lastMeal) return;
    await saveMealToDb({
      meal_name: lastMeal.meal_name,
      calories: lastMeal.calories,
      protein_g: lastMeal.protein_g ?? null,
      carbs_g: lastMeal.carbs_g ?? null,
      fats_g: lastMeal.fats_g ?? null,
      meal_type: mealType || lastMeal.meal_type || "snack",
      portion_size: lastMeal.portion_size ?? null,
      recipe_notes: lastMeal.recipe_notes ?? null,
      ingredients: lastMeal.ingredients ?? null,
      is_ai_generated: false,
    });
    celebrateSuccess();
    toast({ title: "Meal repeated!", description: `${lastMeal.meal_name} · ${lastMeal.calories} kcal` });
  }, [lastMeal, saveMealToDb, toast]);

  return {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorited,
    toggleFavorite,
    logFavorite,
    copyPreviousDay,
    copyingPreviousDay,
    previousDayMealCount,
    lastMeal,
    repeatLastMeal,
  };
}
