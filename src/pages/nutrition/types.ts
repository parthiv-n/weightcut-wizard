export interface Ingredient {
  name: string;
  grams: number;
  calories_per_100g?: number;
  protein_per_100g?: number;
  carbs_per_100g?: number;
  fats_per_100g?: number;
  source?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  quantity?: string;
}

export interface AiLineItem {
  name: string;
  quantity: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
}

export interface Meal {
  id: string;
  meal_name: string;
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  meal_type?: string;
  portion_size?: string;
  recipe_notes?: string;
  is_ai_generated?: boolean;
  ingredients?: Ingredient[];
  date: string;
}

export interface TrainingFoodTip {
  preMeals: { name: string; description: string; timing: string; macros: string }[];
  postMeals: { name: string; description: string; timing: string; macros: string }[];
  tip: string;
}

export interface MacroGoals {
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;
  recommendedCalories: number;
}

export interface ManualMealForm {
  meal_name: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fats_g: string;
  meal_type: string;
  portion_size: string;
  recipe_notes: string;
  ingredients: Ingredient[];
}

export interface ManualNutritionDialogState {
  open: boolean;
  ingredientName: string;
  grams: number;
  calories_per_100g: string;
  protein_per_100g: string;
  carbs_per_100g: string;
  fats_per_100g: string;
}

export interface EditingTargets {
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
}

export interface MealTemplate {
  meal_name: string;
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  meal_type?: string;
  portion_size?: string;
  recipe_notes?: string;
  ingredients?: Ingredient[];
  savedAt: number;
}

export interface BarcodeBaseMacros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  serving_size: string;
  serving_weight_g: number;
}

export const INITIAL_MANUAL_MEAL: ManualMealForm = {
  meal_name: "",
  calories: "",
  protein_g: "",
  carbs_g: "",
  fats_g: "",
  meal_type: "breakfast",
  portion_size: "",
  recipe_notes: "",
  ingredients: [],
};

export const INITIAL_MANUAL_NUTRITION_DIALOG: ManualNutritionDialogState = {
  open: false,
  ingredientName: "",
  grams: 0,
  calories_per_100g: "",
  protein_per_100g: "",
  carbs_per_100g: "",
  fats_per_100g: "",
};
