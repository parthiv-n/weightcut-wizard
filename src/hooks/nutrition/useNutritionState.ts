import { useState, useRef } from "react";
import { format } from "date-fns";
import { nutritionCache } from "@/lib/nutritionCache";
import { localCache } from "@/lib/localCache";
import { useUser } from "@/contexts/UserContext";
import type { Meal, MacroGoals, ManualMealForm, ManualNutritionDialogState, EditingTargets, BarcodeBaseMacros, AiLineItem, INITIAL_MANUAL_MEAL, INITIAL_MANUAL_NUTRITION_DIALOG } from "@/pages/nutrition/types";

interface PersistedMacroGoals {
  macroGoals?: MacroGoals;
  dailyCalorieTarget?: number;
}

export function useNutritionState() {
  const { userId } = useUser();
  const today = format(new Date(), "yyyy-MM-dd");
  // Initialize meals from cache to prevent empty→loaded flicker on navigation
  const [meals, setMeals] = useState<Meal[]>(() => {
    if (!userId) return [];
    return nutritionCache.getMeals(userId, today)
      || localCache.getForDate<Meal[]>(userId, "nutrition_logs", today)
      || [];
  });
  const [mealPlanIdeas, setMealPlanIdeas] = useState<Meal[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  // Seed from last-known-good macro goals cached in localStorage so the ring
  // always has a non-zero target on cold-start and survives mid-session state
  // resets (e.g. a profile refetch returning briefly empty).
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState<number>(() => {
    if (!userId) return 2000;
    const persisted = localCache.get<PersistedMacroGoals>(userId, "macro_goals");
    return persisted?.dailyCalorieTarget && persisted.dailyCalorieTarget > 0
      ? persisted.dailyCalorieTarget
      : 2000;
  });
  const [aiMacroGoals, setAiMacroGoals] = useState<MacroGoals | null>(() => {
    if (!userId) return null;
    const persisted = localCache.get<PersistedMacroGoals>(userId, "macro_goals");
    return persisted?.macroGoals ?? null;
  });
  const [safetyStatus, setSafetyStatus] = useState<"green" | "yellow" | "red">("green");
  const [safetyMessage, setSafetyMessage] = useState("");

  // Derived totals
  const totalCalories = meals.reduce((sum, meal) => sum + meal.calories, 0);
  const totalProtein = meals.reduce((sum, meal) => sum + (meal.protein_g || 0), 0);
  const totalCarbs = meals.reduce((sum, meal) => sum + (meal.carbs_g || 0), 0);
  const totalFats = meals.reduce((sum, meal) => sum + (meal.fats_g || 0), 0);

  return {
    meals, setMeals,
    mealPlanIdeas, setMealPlanIdeas,
    selectedDate, setSelectedDate,
    dailyCalorieTarget, setDailyCalorieTarget,
    aiMacroGoals, setAiMacroGoals,
    safetyStatus, setSafetyStatus,
    safetyMessage, setSafetyMessage,
    totalCalories, totalProtein, totalCarbs, totalFats,
  };
}
