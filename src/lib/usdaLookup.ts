import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
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
 * Look up per-100g nutrition for a single ingredient via the Convex
 * food-search action (backed by USDA FoodData Central).
 *
 * This is a one-shot helper called from non-React code paths (e.g. AI meal
 * post-processing). React components should use `useAction` instead — the
 * one-shot client below pays full auth-handshake cost on every call.
 */
export async function lookupUSDA(ingredientName: string): Promise<USDANutritionResult | null> {
  try {
    const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
    if (!url) return null;
    const client = new ConvexHttpClient(url);
    const data = (await client.action(api.actions.foodSearch.run, {
      query: ingredientName.trim(),
    })) as { results?: any[] };

    const results = data.results;
    if (!results || results.length === 0) return null;

    const best =
      results.find((r) => r.dataType === "Foundation" || r.dataType === "SR Legacy") ||
      results[0];
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
    logger.warn("USDA lookup failed", err);
    return null;
  }
}
