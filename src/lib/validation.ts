import { z } from "zod";

// Nutrition validation schemas
export const nutritionLogSchema = z.object({
  meal_name: z.string().trim().min(1, "Meal name is required").max(200, "Meal name too long"),
  calories: z.number().int().positive("Calories must be positive").min(1).max(10000, "Calories must be less than 10,000"),
  protein_g: z.number().nonnegative("Protein cannot be negative").max(500, "Protein must be less than 500g").optional().nullable(),
  carbs_g: z.number().nonnegative("Carbs cannot be negative").max(1000, "Carbs must be less than 1000g").optional().nullable(),
  fats_g: z.number().nonnegative("Fats cannot be negative").max(500, "Fats must be less than 500g").optional().nullable(),
  meal_type: z.string().optional().nullable(),
  portion_size: z.string().max(100, "Portion size too long").optional().nullable(),
  recipe_notes: z.string().max(1000, "Recipe notes too long").optional().nullable(),
});

// Weight log validation schema
export const weightLogSchema = z.object({
  weight_kg: z.number().positive("Weight must be positive").min(30, "Weight must be at least 30kg").max(250, "Weight must be less than 250kg"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
});

// Fight week log validation schema
export const fightWeekLogSchema = z.object({
  weight_kg: z.number().positive("Weight must be positive").min(30).max(250).optional().nullable(),
  carbs_g: z.number().nonnegative("Carbs cannot be negative").max(1000).optional().nullable(),
  fluid_intake_ml: z.number().int().nonnegative("Fluid intake cannot be negative").max(20000, "Fluid intake too high").optional().nullable(),
  sweat_session_min: z.number().int().nonnegative("Minutes cannot be negative").max(480, "Session too long (max 8 hours)").optional().nullable(),
  notes: z.string().max(1000, "Notes too long").optional().nullable(),
  supplements: z.string().max(500, "Supplements text too long").optional().nullable(),
});

// Profile validation schema
export const profileSchema = z.object({
  age: z.number().int().positive("Age must be positive").min(13, "Must be at least 13 years old").max(120, "Invalid age"),
  height_cm: z.number().positive("Height must be positive").min(100, "Height too short").max(250, "Height too tall"),
  current_weight_kg: z.number().positive("Weight must be positive").min(30, "Weight must be at least 30kg").max(250, "Weight must be less than 250kg"),
  goal_weight_kg: z.number().positive("Goal weight must be positive").min(30).max(250),
  fight_week_target_kg: z.number().positive("Fight week target must be positive").min(30).max(250).optional().nullable(),
  training_frequency: z.number().int().nonnegative("Training frequency cannot be negative").max(21, "Training frequency too high").optional().nullable(),
});

// Hydration log validation schema
export const hydrationLogSchema = z.object({
  amount_ml: z.number().int().positive("Amount must be positive").min(1).max(20000, "Amount too high"),
  sodium_mg: z.number().int().nonnegative("Sodium cannot be negative").max(50000, "Sodium too high").optional().nullable(),
  sweat_loss_percent: z.number().nonnegative("Sweat loss cannot be negative").max(15, "Sweat loss too high").optional().nullable(),
  training_weight_pre: z.number().positive().min(30).max(250).optional().nullable(),
  training_weight_post: z.number().positive().min(30).max(250).optional().nullable(),
  notes: z.string().max(500, "Notes too long").optional().nullable(),
});
