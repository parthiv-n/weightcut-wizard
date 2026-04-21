import { supabase } from "@/integrations/supabase/client";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { logger } from "@/lib/logger";
import type { Meal, MealItem, MealWithTotals } from "@/pages/nutrition/types";

/**
 * Map a row from the `meals_with_totals` view onto the flat `Meal` shape
 * consumed by `NutritionHero` / `MealSections`. Totals become the top-level
 * macro fields so no downstream component needs to change.
 */
export function mapMealsWithTotalsToMeal(row: MealWithTotals): Meal {
  return {
    id: (row.id ?? "") as string,
    meal_name: (row.meal_name ?? "") as string,
    meal_type: (row.meal_type ?? "snack") as string,
    calories: Math.round(Number(row.total_calories ?? 0)),
    protein_g: Number(row.total_protein_g ?? 0),
    carbs_g: Number(row.total_carbs_g ?? 0),
    fats_g: Number(row.total_fats_g ?? 0),
    is_ai_generated: !!row.is_ai_generated,
    notes: row.notes ?? null,
    item_count: row.item_count ?? null,
    date: (row.date ?? "") as string,
  };
}

/**
 * Lazily fetch `meal_items` for a single meal row. Exposed so MealCard can
 * expand into the ingredient list without the base list paying the cost.
 */
export async function fetchMealItems(mealId: string): Promise<MealItem[]> {
  const result = await withSupabaseTimeout(
    supabase
      .from("meal_items")
      .select("id, meal_id, food_id, name, grams, calories, protein_g, carbs_g, fats_g, position")
      .eq("meal_id", mealId)
      .order("position", { ascending: true }),
    undefined,
    "Load meal items"
  );
  if (result.error) {
    logger.warn("fetchMealItems failed", { mealId, error: result.error });
    return [];
  }
  return (result.data ?? []) as MealItem[];
}
