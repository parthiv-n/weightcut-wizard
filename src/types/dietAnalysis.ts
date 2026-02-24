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

export interface DietAnalysisResult {
  summary: string;
  micronutrients: MicronutrientData[];
  gaps: NutrientGap[];
  suggestions: FoodSuggestion[];
}
