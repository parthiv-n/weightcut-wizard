export interface MicronutrientData {
  name: string;
  percentRDA: number;
  amount: string;
  rdaTarget: string;
}

export interface NutrientGap {
  nutrient: string;
  percentRDA: number;
  severity: "low" | "moderate" | "critical";
  reason: string;
}

export interface FoodSuggestion {
  food: string;
  reason: string;
  nutrients: string[];
}

export interface MealNutrientBreakdown {
  mealType: string;
  mealName: string;
  keyNutrients: { name: string; amount: string }[];
}

export interface MealAdditionItem {
  /** Imperative phrase: "Add a handful of spinach" or "Swap the milk for kefir". */
  item: string;
  /** Plain-language explanation of what the addition unlocks for THIS meal. */
  benefit: string;
  /** Nutrients the addition specifically boosts. */
  nutrients: string[];
}

export interface MealAddition {
  mealType: string;
  mealName: string;
  additions: MealAdditionItem[];
}

export interface VitaminRounder {
  /** Single food / pairing that covers a wide spread of vitamins or minerals. */
  food: string;
  /** Vitamins / minerals this food rounds out at once. */
  vitamins: string[];
  /** Why this works as an all-rounder for the user's current pattern. */
  reason: string;
}

export interface DietAnalysisResult {
  summary: string;
  mealBreakdown?: MealNutrientBreakdown[];
  micronutrients: MicronutrientData[];
  gaps: NutrientGap[];
  suggestions: FoodSuggestion[];
  /** Per-meal, "what to add" suggestions tied back to the meals the user logged. */
  mealAdditions?: MealAddition[];
  /** Foods that broadly cover multiple vitamin/mineral gaps in one shot. */
  vitaminRounders?: VitaminRounder[];
}
