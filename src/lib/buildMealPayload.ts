import type { Ingredient } from "@/pages/nutrition/types";
import { coerceMealName } from "@/lib/mealName";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export function isMealType(v: unknown): v is MealType {
  return typeof v === "string" && (MEAL_TYPES as string[]).includes(v);
}

export interface MealInput {
  meal_name: string;
  meal_type: MealType;
  calories: number;
  protein_g?: number | null;
  carbs_g?: number | null;
  fats_g?: number | null;
  portion_size?: string | null;
  recipe_notes?: string | null;
  ingredients?: Ingredient[] | null;
  is_ai_generated?: boolean;
}

export interface MealDbPayload {
  id: string;
  user_id: string;
  date: string;
  meal_name: string;
  meal_type: MealType;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  portion_size: string | null;
  recipe_notes: string | null;
  ingredients: Ingredient[] | null;
  is_ai_generated: boolean;
}

/**
 * Normalize a raw meal_name. Deprecated — prefer `coerceMealName(raw, mealType)`
 * from `@/lib/mealName` because it produces a meal-type-aware default
 * ("Breakfast" / "Lunch" / "Dinner" / "Snack") instead of a generic string.
 * Kept for backwards compatibility with call sites that lack a meal_type in scope.
 */
export function normalizeMealName(raw: string | null | undefined): string {
  return coerceMealName(raw, undefined);
}

/**
 * Resolve a candidate meal_type to a valid enum value. Unknown/empty → 'snack'.
 */
export function resolveMealType(raw: string | null | undefined): MealType {
  return isMealType(raw) ? raw : "snack";
}

export function buildMealPayload(args: {
  userId: string;
  date: string;
  input: MealInput;
  id?: string;
}): MealDbPayload {
  const { userId, date, input, id } = args;
  const mealType = resolveMealType(input.meal_type);
  return {
    id: id ?? crypto.randomUUID(),
    user_id: userId,
    date,
    meal_name: coerceMealName(input.meal_name, mealType),
    meal_type: mealType,
    calories: Math.max(0, Math.round(Number.isFinite(input.calories) ? (input.calories as number) : 0)),
    protein_g: input.protein_g ?? null,
    carbs_g: input.carbs_g ?? null,
    fats_g: input.fats_g ?? null,
    portion_size: input.portion_size ?? null,
    recipe_notes: input.recipe_notes ?? null,
    ingredients: input.ingredients ?? null,
    is_ai_generated: input.is_ai_generated ?? false,
  };
}
