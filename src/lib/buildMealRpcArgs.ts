/**
 * Pure helper — assembles arguments for `meals.createMealWithItems`.
 *
 * Design contract:
 *  - Always emits a non-empty `p_meal_name` via `coerceMealName`.
 *  - Always emits a valid meal_type via `resolveMealType` ("snack" fallback).
 *  - Items default to a single catch-all line item when callers don't
 *    supply one — preserves UX where a typed "Manual meal" (calories only,
 *    no ingredients) still produces a row with correct totals.
 *  - `position` is auto-assigned from item order.
 *  - Numeric fields are coerced to finite non-negative values.
 *
 * Originally produced Postgres RPC args; under Convex the same shape is fed
 * into `api.meals.createMealWithItems` via the rpcItems → camelCase mapper
 * in `useMealOperations.ts`. The pure-data nature of this helper means it
 * stayed put through the migration.
 */
import { coerceMealName } from "@/lib/mealName";
import { resolveMealType, type MealType } from "@/lib/buildMealPayload";
import type { Ingredient } from "@/pages/nutrition/types";

export interface BuildMealRpcArgsInput {
  header: {
    meal_name: string | null | undefined;
    meal_type: string | null | undefined;
    date: string;
    notes?: string | null;
    is_ai_generated?: boolean;
  };
  items?: RpcItemInput[];
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
  return v > 0 ? v : DEFAULT_ITEM_GRAMS;
}

function normalizeName(raw: string | null | undefined, fallback: string): string {
  const t = (raw ?? "").trim();
  return t.length > 0 ? t : fallback;
}

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
