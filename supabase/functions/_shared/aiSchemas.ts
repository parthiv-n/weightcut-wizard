/**
 * Zod schemas for plan-generating AI outputs.
 *
 * Use these with `aiCallWithValidation` (see aiCallWithRetry.ts) so any field
 * Groq invents that violates a bound or the schema triggers an automatic
 * retry with the validation error appended to the prompt.
 *
 * Deno-compatible (zod imported from deno.land/x).
 */
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ─── Cut plan / weight plan ────────────────────────────────────────────────
//
// Both `generate-cut-plan` and `generate-weight-plan` return roughly the same
// envelope. The schema below covers both — fields that are specific to one
// (e.g. `fightWeek`, `mealIdeas`) are optional.

const WeeklyEntrySchema = z.object({
  week: z.number().int().min(1).max(52),
  targetWeight: z.number().min(30).max(300),
  calories: z.number().int().min(800).max(5000),
  protein_g: z.number().min(40).max(400),
  carbs_g: z.number().min(0).max(700),
  fats_g: z.number().min(15).max(250),
  focus: z.string().max(500).optional().default(""),
});

export const CutPlanSchema = z.object({
  weeklyPlan: z.array(WeeklyEntrySchema).min(1).max(20),
  summary: z.string().min(10).max(2000),
  totalWeeks: z.number().int().min(1).max(20).optional(),
  weeklyLossTarget: z.string().max(50).optional(),
  maintenanceCalories: z.number().int().min(1000).max(6000).optional(),
  deficit: z.number().int().min(0).max(1500).optional(),
  targetCalories: z.number().int().min(800).max(5000).optional(),
  safetyNotes: z.string().max(1000).optional().default(""),
  keyPrinciples: z.array(z.string().max(500)).min(1).max(10).optional(),
  // generate-cut-plan only
  fightWeek: z
    .object({
      lowCarb: z.string().max(2000),
      sodium: z.string().max(2000),
      waterLoading: z.string().max(2000),
      nutrition: z.string().max(2000),
    })
    .optional(),
  // generate-weight-plan only
  mealIdeas: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(500),
        approxCalories: z.number().int().min(50).max(2000),
      }),
    )
    .max(20)
    .optional(),
  weeklyChecklist: z.array(z.string().max(300)).max(10).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type CutPlan = z.infer<typeof CutPlanSchema>;

// ─── Meal plan (kept here for the parallel agent / future wiring) ──────────
//
// NOTE: meal-planner is being edited in parallel by another agent. We define
// the schema but DO NOT wire it in here. Schema can be imported later.

const MealSchema = z.object({
  name: z.string().min(1).max(150),
  kcal: z.number().int().min(50).max(3000),
  protein_g: z.number().min(0).max(300),
  carb_g: z.number().min(0).max(500),
  fat_g: z.number().min(0).max(200),
  ingredients: z.array(z.string().max(200)).max(40).optional(),
  description: z.string().max(1000).optional(),
});

export const MealPlanSchema = z.object({
  meals: z.array(MealSchema).min(1).max(10),
  total_kcal: z.number().int().min(800).max(6000),
  total_protein_g: z.number().min(40).max(500),
  total_carb_g: z.number().min(0).max(800),
  total_fat_g: z.number().min(15).max(300),
  notes: z.string().max(2000).optional(),
});

export type MealPlan = z.infer<typeof MealPlanSchema>;

// ─── Rehydration protocol ──────────────────────────────────────────────────
//
// Mirrors what `rehydration-protocol` already returns. We validate only the
// LLM-authored narrative pieces; the deterministic `totals` are attached
// post-hoc by the edge function and aren't routed through the LLM.

const HourlyStepSchema = z.object({
  hour: z.number().int().min(1).max(48),
  phase: z.string().max(80),
  fluidML: z.number().min(0).max(2000),
  sodiumMg: z.number().min(0).max(5000),
  potassiumMg: z.number().min(0).max(2000),
  magnesiumMg: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(150),
  drinkRecipe: z.string().max(500).optional().default(""),
  notes: z.string().max(500).optional().default(""),
  foods: z.array(z.string().max(200)).max(20).optional().default([]),
});

const PhaseSchema = z.object({
  startHour: z.number().int().min(1).max(48),
  endHour: z.number().int().min(1).max(48),
  phase: z.string().max(80),
  fluidMLPerHour: z.number().min(0).max(2000),
  sodiumMgPerHour: z.number().min(0).max(5000),
  potassiumMgPerHour: z.number().min(0).max(2000),
  magnesiumMgPerHour: z.number().min(0).max(1000),
  carbsGPerHour: z.number().min(0).max(150),
  drinkRecipe: z.string().max(500).optional().default(""),
  notes: z.string().max(500).optional().default(""),
  foods: z.array(z.string().max(200)).max(20).optional().default([]),
});

export const RehydrationPlanSchema = z.object({
  summary: z.string().min(5).max(1000),
  // Either a `phases` array (preferred) or pre-expanded `hourlyProtocol`.
  phases: z.array(PhaseSchema).min(1).max(12).optional(),
  hourlyProtocol: z.array(HourlyStepSchema).min(1).max(48).optional(),
  carbRefuelPlan: z
    .object({
      strategy: z.string().max(500),
      meals: z
        .array(
          z.object({
            timing: z.string().max(120),
            carbsG: z.number().min(0).max(400),
            foods: z.array(z.string().max(200)).max(20),
            rationale: z.string().max(500).optional().default(""),
          }),
        )
        .max(6),
    })
    .optional(),
  warnings: z.array(z.string().max(500)).min(1).max(6),
}).refine(
  (v) => Array.isArray(v.phases) || Array.isArray(v.hourlyProtocol),
  { message: "Either phases or hourlyProtocol must be present" },
);

export type RehydrationPlan = z.infer<typeof RehydrationPlanSchema>;
