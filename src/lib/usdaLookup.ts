import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export interface USDANutritionResult {
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
  source: string;
  matched_name?: string;
}

/**
 * Look up per-100g nutrition for a single ingredient via the USDA food-search
 * edge function. This is FREE (no AI gems) and unlimited.
 * Returns the best match, or null if nothing found.
 */
export async function lookupUSDA(ingredientName: string): Promise<USDANutritionResult | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/food-search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ query: ingredientName.trim() }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    const results = data.results;

    if (!results || results.length === 0) return null;

    // Prefer Foundation/SR Legacy data over Branded for accuracy
    const best = results.find((r: any) => r.dataType === "Foundation" || r.dataType === "SR Legacy") || results[0];

    if (!best.calories_per_100g && best.calories_per_100g !== 0) return null;

    return {
      calories_per_100g: best.calories_per_100g,
      protein_per_100g: best.protein_per_100g,
      carbs_per_100g: best.carbs_per_100g,
      fats_per_100g: best.fats_per_100g,
      source: "USDA FoodData Central",
      matched_name: best.name,
    };
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      logger.warn("USDA lookup failed", err);
    }
    return null;
  }
}
