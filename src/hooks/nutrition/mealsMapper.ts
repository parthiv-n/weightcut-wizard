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

// Coalesce per-card fetchMealItems calls within a 50ms window into a single
// `.in("meal_id", [...])` round-trip. With 6+ cards expanded near-simultaneously
// (e.g. on initial scroll or when "expand all" is tapped), this collapses
// N queries into 1 — saves ~30ms × N round-trips.
const MEAL_ITEM_BATCH_WINDOW_MS = 50;
const cache = new Map<string, MealItem[]>();
let pendingIds: Set<string> | null = null;
let pendingResolvers: Array<{ id: string; resolve: (items: MealItem[]) => void }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushBatch() {
  flushTimer = null;
  const ids = pendingIds ? Array.from(pendingIds) : [];
  const resolvers = pendingResolvers;
  pendingIds = null;
  pendingResolvers = [];
  if (ids.length === 0) return;

  try {
    const result = await withSupabaseTimeout(
      supabase
        .from("meal_items")
        .select("id, meal_id, food_id, name, grams, calories, protein_g, carbs_g, fats_g, position")
        .in("meal_id", ids)
        .order("position", { ascending: true }),
      undefined,
      "Load meal items (batched)"
    );
    if (result.error) {
      logger.warn("fetchMealItems batch failed", { ids, error: result.error });
      for (const r of resolvers) r.resolve([]);
      return;
    }
    // Group by meal_id
    const grouped = new Map<string, MealItem[]>();
    for (const row of (result.data ?? []) as MealItem[]) {
      const arr = grouped.get(row.meal_id) ?? [];
      arr.push(row);
      grouped.set(row.meal_id, arr);
    }
    for (const id of ids) cache.set(id, grouped.get(id) ?? []);
    for (const r of resolvers) r.resolve(cache.get(r.id) ?? []);
  } catch (err) {
    logger.warn("fetchMealItems batch threw", { ids, error: err });
    for (const r of resolvers) r.resolve([]);
  }
}

/**
 * Lazily fetch `meal_items` for a single meal row. Calls within a 50ms window
 * are coalesced into a single batched query.
 */
export async function fetchMealItems(mealId: string): Promise<MealItem[]> {
  const cached = cache.get(mealId);
  if (cached) return cached;

  return new Promise<MealItem[]>((resolve) => {
    if (!pendingIds) pendingIds = new Set();
    pendingIds.add(mealId);
    pendingResolvers.push({ id: mealId, resolve });
    if (!flushTimer) flushTimer = setTimeout(flushBatch, MEAL_ITEM_BATCH_WINDOW_MS);
  });
}

/** Clear the in-memory items cache — call after a meal mutation. */
export function invalidateMealItemsCache(mealId?: string) {
  if (mealId) cache.delete(mealId);
  else cache.clear();
}
