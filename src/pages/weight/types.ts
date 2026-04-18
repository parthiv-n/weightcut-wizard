export interface WeightLog {
  id: string;
  date: string;
  weight_kg: number;
}

export interface Profile {
  current_weight_kg: number;
  goal_weight_kg: number;
  fight_week_target_kg: number | null;
  target_date: string;
  activity_level: string;
  age: number;
  sex: string;
  height_cm: number;
  tdee: number;
}

export interface MealTimingSlot {
  name: string;
  time: string;
  caloriePercent: number;
  calories: number;
  proteinGrams: number;
  focus: string;
}

export interface AIAnalysis {
  riskLevel: "green" | "yellow" | "red";
  requiredWeeklyLoss: number;
  recommendedCalories: number;
  calorieDeficit: number;
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;
  reasoningExplanation: string;
  strategicGuidance: string;
  weeklyWorkflow: string[];
  trainingConsiderations: string;
  timeline: string;
  weeklyPlan: {
    week1: string;
    week2: string;
    ongoing: string;
  };
  mealTiming?: {
    distribution: MealTimingSlot[];
    notes: string;
  };
}

export interface DebugData {
  requestPayload: any;
  rawResponse: any;
  parsedResponse: any;
  currentWeightSource: string;
  currentWeightValue: number | null;
  latestWeightLog: any;
  profileData: any;
}
