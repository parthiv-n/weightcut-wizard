/**
 * Pure helper — assembles RPC arguments for `create_meal_with_items`.
 *
 * Design contract:
 *  - Always emits a non-empty `p_meal_name` via `coerceMealName`.
 *  - Always emits a valid meal_type via `resolveMealType` ("snack" fallback).
 *  - Items default to a single catch-all line item when callers don't
 *    supply one — this preserves existing UX where a typed "Manual meal"
 *    (calories only, no ingredients) still produces a row in meals_with_totals
 *    with correct totals. The fallback item is named after the meal header
 *    so legacy lists still read sensibly.
 *  - `position` is auto-assigned from item order so callers don't need to.
 *  - Numeric fields are coerced to finite non-negative values.
 *
 * The helper is exported for the tester's gate — do not rename or restructure
 * without coordinating.
 */
import { coerceMealName } from "@/lib/mealName";
import { resolveMealType, type MealType } from "@/lib/buildMealPayload";
import type { Ingredient } from "@/pages/nutrition/types";

export interface BuildMealRpcArgsInput {
  /** Form-like header values. meal_name + meal_type drive the coercion. */
  header: {
    meal_name: string | null | undefined;
    meal_type: string | null | undefined;
    date: string; // yyyy-mm-dd
    notes?: string | null;
    is_ai_generated?: boolean;
  };
  /** Optional items. When omitted, a single catch-all item is emitted so
   *  the aggregated view returns the correct totals. */
  items?: RpcItemInput[];
  /**
   * When `items` is omitted and a fallback item must be synthesised,
   * use these totals for the catch-all line. Callers typically pass the
   * manual-meal form's top-level macros here.
   */
  fallbackTotals?: {
    calories: number;
    protein_g?: number | null;
    carbs_g?: number | null;
    fats_g?: number | null;
    grams?: number | null;
    name?: string | null;
  };
}

export interface RpcItemInput {
  name: string | null | undefined;
  grams: number | null | undefined;
  calories: number | null | undefined;
  protein_g?: number | null;
  carbs_g?: number | null;
  fats_g?: number | null;
  food_id?: string | null;
  /** Optional explicit position — overrides the array-index default. */
  position?: number | null;
}

export interface CreateMealRpcArgs {
  p_date: string;
  p_meal_type: MealType;
  p_meal_name: string;
  p_notes: string | null;
  p_is_ai_generated: boolean;
  p_items: RpcItemPayload[];
}

export interface RpcItemPayload {
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  food_id: string | null;
  position: number;
}

const DEFAULT_ITEM_GRAMS = 100;

function nonNeg(n: number | null | undefined, fallback = 0): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return v < 0 ? 0 : v;
}

function positiveGrams(n: number | null | undefined): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  // grams has a CHECK (grams > 0) in DB — force a sentinel positive value
  return v > 0 ? v : DEFAULT_ITEM_GRAMS;
}

function normalizeName(raw: string | null | undefined, fallback: string): string {
  const t = (raw ?? "").trim();
  return t.length > 0 ? t : fallback;
}

/**
 * Build the arg object for `supabase.rpc('create_meal_with_items', args)`.
 *
 * The RPC takes the meal header columns individually plus a JSON array of
 * items. This helper centralises the shape so every writer (manual,
 * food-search, barcode, AI analysis, quick-add, batch, demo seeder) emits
 * identical payloads.
 */
export function buildCreateMealRpcArgs(input: BuildMealRpcArgsInput): CreateMealRpcArgs {
  const mealType = resolveMealType(input.header.meal_type);
  const mealName = coerceMealName(input.header.meal_name, mealType);

  const rawItems = input.items && input.items.length > 0 ? input.items : null;

  let items: RpcItemPayload[];
  if (rawItems) {
    items = rawItems.map((it, idx) => ({
      name: normalizeName(it.name, mealName),
      grams: positiveGrams(it.grams),
      calories: nonNeg(it.calories),
      protein_g: nonNeg(it.protein_g),
      carbs_g: nonNeg(it.carbs_g),
      fats_g: nonNeg(it.fats_g),
      food_id: it.food_id ?? null,
      position: typeof it.position === "number" && Number.isFinite(it.position) ? it.position : idx,
    }));
  } else {
    // Synthesise one catch-all item so totals match header-level macros.
    const ft = input.fallbackTotals;
    items = [{
      name: normalizeName(ft?.name ?? mealName, mealName),
      grams: positiveGrams(ft?.grams ?? null),
      calories: nonNeg(ft?.calories),
      protein_g: nonNeg(ft?.protein_g),
      carbs_g: nonNeg(ft?.carbs_g),
      fats_g: nonNeg(ft?.fats_g),
      food_id: null,
      position: 0,
    }];
  }

  return {
    p_date: input.header.date,
    p_meal_type: mealType,
    p_meal_name: mealName,
    p_notes: input.header.notes?.trim() ? input.header.notes : null,
    p_is_ai_generated: !!input.header.is_ai_generated,
    p_items: items,
  };
}

/**
 * Convenience: derive item inputs from the legacy `ingredients` array used by
 * manual-meal forms and AI analysis payloads. Each ingredient becomes an item
 * with grams + per-item macros. Missing per-item macros fall through to 0.
 */
export function ingredientsToRpcItems(
  ingredients: Ingredient[] | null | undefined,
  defaults?: { food_id?: string | null }
): RpcItemInput[] {
  if (!ingredients || ingredients.length === 0) return [];
  return ingredients.map((ing) => ({
    name: ing.name,
    grams: typeof ing.grams === "number" ? ing.grams : null,
    calories: typeof ing.calories === "number" ? ing.calories : 0,
    protein_g: ing.protein_g ?? null,
    carbs_g: ing.carbs_g ?? null,
    fats_g: ing.fats_g ?? null,
    food_id: defaults?.food_id ?? null,
  }));
}
