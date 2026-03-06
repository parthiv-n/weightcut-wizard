import { useState, useRef } from "react";
import { format } from "date-fns";
import type { Meal, MacroGoals, ManualMealForm, ManualNutritionDialogState, EditingTargets, BarcodeBaseMacros, AiLineItem, INITIAL_MANUAL_MEAL, INITIAL_MANUAL_NUTRITION_DIALOG } from "@/pages/nutrition/types";

export function useNutritionState() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [mealPlanIdeas, setMealPlanIdeas] = useState<Meal[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState(2000);
  const [aiMacroGoals, setAiMacroGoals] = useState<MacroGoals | null>(null);
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
