import type { Ingredient } from "@/pages/nutrition/types";

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

const EMPTY_NAME_FALLBACK = "Logged meal";

/**
 * Normalize a raw meal_name: trim, drop empty, fall back to 'Logged meal'.
 * Clients never write NULL meal_name; the DB column is NOT NULL post-migration.
 */
export function normalizeMealName(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return v.length > 0 ? v : EMPTY_NAME_FALLBACK;
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
  return {
    id: id ?? crypto.randomUUID(),
    user_id: userId,
    date,
    meal_name: normalizeMealName(input.meal_name),
    meal_type: resolveMealType(input.meal_type),
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
