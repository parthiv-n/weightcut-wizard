"use node";

/**
 * Food name search via USDA FoodData Central.
 *
 * Action-level cache (`searchCache`) survives container warm reuse, matching
 * the Supabase Deno-isolate behaviour. Results are bulk-upserted into the
 * `foods` catalog so repeat searches read from our DB.
 *
 * Env: USDA_API_KEY — public-tier key works fine; 1k requests/hour limit.
 */
import { v } from "convex/values";
import { action } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";

interface USDANutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  value: number;
  unitName: string;
}

interface USDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  brandName?: string;
  foodNutrients: USDANutrient[];
}

function getNutrient(nutrients: USDANutrient[], num: string): number {
  return nutrients.find((n) => n.nutrientNumber === num)?.value ?? 0;
}

function normalizeFood(food: USDAFood) {
  const cal = getNutrient(food.foodNutrients, "208");
  const protein = getNutrient(food.foodNutrients, "203");
  const carbs = getNutrient(food.foodNutrients, "205");
  const fat = getNutrient(food.foodNutrients, "204");
  return {
    id: String(food.fdcId),
    name: food.description,
    brand: food.brandOwner || food.brandName || "",
    dataType: food.dataType,
    calories_per_100g: Math.round(cal),
    protein_per_100g: Math.round(protein * 10) / 10,
    carbs_per_100g: Math.round(carbs * 10) / 10,
    fats_per_100g: Math.round(fat * 10) / 10,
    serving_size: "100g",
  };
}

// In-memory cache shared across warm invocations of the same container.
const searchCache = new Map<string, { results: any[]; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export const run = action({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      throw new Error("Query is required (min 2 chars)");
    }

    const cacheKey = trimmed.toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return { results: cached.results };
    }

    const apiKey = process.env.USDA_API_KEY;
    if (!apiKey) {
      throw new Error("USDA_API_KEY is not configured");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let usdaResponse: Response;
    try {
      usdaResponse = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            dataType: ["Foundation", "SR Legacy", "Branded"],
            pageSize: 25,
          }),
          signal: controller.signal,
        },
      );
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new Error("USDA timeout");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!usdaResponse.ok) {
      throw new Error(`USDA API returned ${usdaResponse.status}`);
    }

    const usdaData = (await usdaResponse.json()) as { foods?: USDAFood[] };
    const foods = usdaData.foods ?? [];

    const normalised = foods
      .map(normalizeFood)
      .filter(
        (f) => f.calories_per_100g > 0 && f.name.trim().length > 0,
      );

    let results = normalised;
    if (normalised.length > 0) {
      try {
        const ids = (await ctx.runMutation(
          internal.foods.upsertManyFromExternal,
          {
            rows: normalised.map((f) => ({
              name: f.name,
              brand: f.brand || undefined,
              source: "usda",
              sourceRef: f.id,
              verified: true,
              caloriesPer100g: f.calories_per_100g,
              proteinPer100g: f.protein_per_100g,
              carbsPer100g: f.carbs_per_100g,
              fatsPer100g: f.fats_per_100g,
            })),
          },
        )) as string[];
        // Swap USDA fdcId for our catalog id so meal_items can FK to a stable
        // Convex `foods._id` instead of the external string ref.
        results = normalised.map((f, i) => ({ ...f, id: ids[i] ?? f.id }));
      } catch {
        // Upsert failure shouldn't break search — fall back to USDA payload
        // with the fdcId as a string id.
      }
    }

    searchCache.set(cacheKey, { results, ts: Date.now() });
    return { results };
  },
});
