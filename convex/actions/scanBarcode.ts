"use node";

/**
 * Barcode lookup via OpenFoodFacts.
 *
 * Auth required: the action is hit from the barcode scanner dialog while the
 * user is signed in. After a successful lookup the result is upserted into
 * the `foods` catalog so subsequent scans of the same barcode hit our DB and
 * `meal_items.foodId` can stably reference the food.
 */
import { v } from "convex/values";
import { action } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";

const BARCODE_RE = /^\d{8,14}$/;

export const run = action({
  args: { barcode: v.string() },
  handler: async (
    ctx,
    { barcode },
  ): Promise<
    | { found: false }
    | {
        found: true;
        food_id: string | null;
        productName: string;
        brand: string | null;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fats_g: number;
        serving_size: string;
        source: string;
      }
  > => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (!BARCODE_RE.test(barcode)) {
      throw new Error("Invalid barcode format. Expected 8-14 digits.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let resp: Response;
    try {
      resp = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(
          barcode,
        )}.json`,
        { signal: controller.signal },
      );
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new Error("OpenFoodFacts timed out");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const data = (await resp.json()) as any;
    if (data.status === 0 || !data.product) {
      return { found: false as const };
    }

    const product = data.product;
    const nutriments = product.nutriments || {};

    const calories = Math.round(
      Number(nutriments["energy-kcal_100g"] ?? nutriments["energy-kcal"] ?? 0),
    );
    const proteinRaw = parseFloat(
      String(nutriments["proteins_100g"] ?? nutriments["proteins"] ?? 0),
    );
    const carbsRaw = parseFloat(
      String(
        nutriments["carbohydrates_100g"] ?? nutriments["carbohydrates"] ?? 0,
      ),
    );
    const fatsRaw = parseFloat(
      String(nutriments["fat_100g"] ?? nutriments["fat"] ?? 0),
    );

    const productName: string =
      product.product_name || product.product_name_en || "Unknown Product";
    const brandName: string | undefined =
      (product.brands || "").split(",")[0]?.trim() || undefined;

    const protein = Math.round(proteinRaw * 10) / 10;
    const carbs = Math.round(carbsRaw * 10) / 10;
    const fats = Math.round(fatsRaw * 10) / 10;

    let foodId: string | null = null;
    if (calories > 0 && productName.trim().length > 0) {
      foodId = await ctx.runMutation(internal.foods.upsertFromExternal, {
        name: productName,
        brand: brandName,
        barcode,
        source: "openfoodfacts",
        sourceRef: barcode,
        verified: true,
        caloriesPer100g: calories,
        proteinPer100g: protein,
        carbsPer100g: carbs,
        fatsPer100g: fats,
      });
    }

    return {
      found: true as const,
      food_id: foodId,
      productName,
      brand: brandName ?? null,
      calories,
      protein_g: protein,
      carbs_g: carbs,
      fats_g: fats,
      serving_size: product.serving_size || "100g",
      source: "openfoodfacts",
    };
  },
});
