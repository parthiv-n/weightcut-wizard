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

export interface AIAnalysis {
  riskLevel: "green" | "yellow" | "red";
  requiredWeeklyLoss: number;
  recommendedCalories: number;
  calorieDeficit: number;
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;
  riskExplanation: string;
  strategicGuidance: string;
  weeklyWorkflow: string[];
  trainingConsiderations: string;
  timeline: string;
  weeklyPlan: {
    week1: string;
    week2: string;
    ongoing: string;
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
