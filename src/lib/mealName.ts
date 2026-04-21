import { logger } from "./logger";

/**
 * Central meal-name coercion. Ensures every boundary that builds a meal
 * payload emits a human-readable, non-empty name regardless of input path
 * (manual, search, barcode, AI photo, AI plan, quick-add).
 *
 * Contract:
 *   - trim raw; if non-empty, return as-is
 *   - otherwise fall back to defaultNameFor(mealType)
 *   - emit a Sentry breadcrumb on every fallback so prod can detect any
 *     remaining upstream gaps
 */
export function coerceMealName(
  raw: string | null | undefined,
  mealType: string | null | undefined
): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length > 0) return trimmed;

  const fallback = defaultNameFor(mealType);
  logger.warn("coerceMealName fallback fired", { raw, mealType, fallback });
  return fallback;
}

/**
 * Default display name keyed off meal_type.
 * Spec (docs/superpowers/specs/2026-04-19-nutrition-overhaul-design.md §1.3):
 *   breakfast → "Breakfast"
 *   lunch     → "Lunch"
 *   dinner    → "Dinner"
 *   snack     → "Snack"
 *   anything else (unknown, empty, null, undefined) → "Logged meal"
 *
 * Note: meal_type matching is case-sensitive against the lowercase enum.
 * "Breakfast" (capitalised) is NOT a known type per the DB enum and falls
 * through to "Logged meal". Kept consistent with
 * supabase/functions/analyze-meal/index.ts defaultNameFor and the
 * `nutrition_logs` column default from migration 20260418000000.
 */
export function defaultNameFor(mealType: string | null | undefined): string {
  if (typeof mealType !== "string") return "Logged meal";
  switch (mealType) {
    case "breakfast":
      return "Breakfast";
    case "lunch":
      return "Lunch";
    case "dinner":
      return "Dinner";
    case "snack":
      return "Snack";
    default:
      return "Logged meal";
  }
}
