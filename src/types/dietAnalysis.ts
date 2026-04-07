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

export interface DietAnalysisResult {
  summary: string;
  mealBreakdown?: MealNutrientBreakdown[];
  micronutrients: MicronutrientData[];
  gaps: NutrientGap[];
  suggestions: FoodSuggestion[];
}
