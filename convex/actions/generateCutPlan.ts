/** Generate cut plan — heavy reasoning, NOT gem-gated, logs decision. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { callGroqWithRetry } from "../_shared/groq";
import { CutPlanSchema } from "../_shared/aiSchemas";
import { mifflinStJeor, requiredDeficit, macroSplit } from "../_shared/math";
import { normaliseWeeklyPlan } from "../_shared/normalizeWeeklyPlan";
import {
  loadAthleteSnapshot,
  logDecision,
  requireUserIdFromAction,
  SECOND_PERSON_DIRECTIVE,
} from "./_helpers";

export const run = action({
  args: {
    currentWeight: v.number(),
    goalWeight: v.number(),
    fightWeekTargetKg: v.optional(v.number()),
    targetDate: v.string(),
    heightCm: v.number(),
    age: v.number(),
    sex: v.union(v.literal("male"), v.literal("female")),
    activityLevel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserIdFromAction(ctx);
    const snap = await loadAthleteSnapshot(ctx, userId);
    const days = Math.max(
      1,
      Math.ceil((new Date(args.targetDate).getTime() - Date.now()) / 86400000),
    );
    const weekCount = Math.max(1, Math.min(20, Math.ceil(days / 7)));
    const bmr = mifflinStJeor({
      weightKg: args.currentWeight,
      heightCm: args.heightCm,
      ageYears: args.age,
      sex: args.sex,
    });
    const maintenanceCal = Math.round(bmr * 1.55);
    const finalTarget = args.fightWeekTargetKg ?? args.goalWeight;
    const deficit = requiredDeficit({
      currentKg: args.currentWeight,
      targetKg: finalTarget,
      daysRemaining: days,
      tdee: maintenanceCal,
    });
    const targetCal = Math.max(1200, maintenanceCal - deficit.dailyDeficitKcal);
    const macros = macroSplit(targetCal, args.currentWeight, "cut");

    const systemPrompt = `You are an evidence-based combat-sports nutritionist. Output ONLY valid JSON matching this schema:
{ "weeklyPlan": [{ "week": n, "targetWeight": n, "calories": n, "protein_g": n, "carbs_g": n, "fats_g": n, "focus": "..." }], "summary": "...", "totalWeeks": n, "weeklyLossTarget": "...", "maintenanceCalories": n, "deficit": n, "targetCalories": n, "safetyNotes": "...", "keyPrinciples": ["..."], "fightWeek": { "lowCarb": "...", "sodium": "...", "waterLoading": "...", "nutrition": "..." } }

${SECOND_PERSON_DIRECTIVE}

Every narrative string (summary, focus, safetyNotes, keyPrinciples, fightWeek.*) MUST address the user as "you" / "your" - this is YOUR cut plan being handed to YOU. Use the deterministic numbers below. Never invent calories or macros that contradict them.

DETERMINISTIC FACTS:
- BMR: ${bmr}, maintenance: ${maintenanceCal}, target: ${targetCal} kcal
- Macros: ${macros.protein_g}P / ${macros.carb_g}C / ${macros.fat_g}F
- Weeks: ${weekCount}, days remaining: ${days}
- Starting weight: ${args.currentWeight}kg, final target: ${finalTarget}kg

${snap.block}`;

    const result = await callGroqWithRetry({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate a ${weekCount}-week cut plan for an athlete cutting from ${args.currentWeight}kg to ${finalTarget}kg in ${days} days. Include weekly tapered targets and a fightWeek protocol block.`,
        },
      ],
      temperature: 0.4,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      schema: CutPlanSchema,
    });

    const normalised = normaliseWeeklyPlan({
      weeklyPlan: result.weeklyPlan,
      weekCount,
      startWeight: args.currentWeight,
      finalTarget,
      defaultCalories: targetCal,
      defaultProtein: macros.protein_g,
      defaultCarbs: macros.carb_g,
      defaultFats: macros.fat_g,
    });
    const plan = {
      ...result,
      weeklyPlan: normalised,
      maintenanceCalories: maintenanceCal,
      targetCalories: targetCal,
      deficit: deficit.dailyDeficitKcal,
    };

    logDecision(ctx, {
      userId,
      feature: "generate-cut-plan",
      inputSnapshot: { ...args, bmr, maintenanceCal, targetCal },
      outputJson: plan,
      predictionFacts: {
        predicted_kcal: targetCal,
        predicted_loss_per_week_kg: parseFloat(
          ((args.currentWeight - finalTarget) / weekCount).toFixed(2),
        ),
      },
      model: "openai/gpt-oss-120b",
    });
    return plan;
  },
});
