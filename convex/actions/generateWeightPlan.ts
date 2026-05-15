/** Generate weight plan — same envelope as cut plan but for general weight goals. */
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
    targetDate: v.string(),
    heightCm: v.number(),
    age: v.number(),
    sex: v.union(v.literal("male"), v.literal("female")),
    activityLevel: v.optional(v.string()),
    goalType: v.optional(v.string()),
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
    const deficit = requiredDeficit({
      currentKg: args.currentWeight,
      targetKg: args.goalWeight,
      daysRemaining: days,
      tdee: maintenanceCal,
    });
    const goalIsLoss = args.currentWeight > args.goalWeight;
    const targetCal = goalIsLoss
      ? Math.max(1200, maintenanceCal - deficit.dailyDeficitKcal)
      : maintenanceCal + 300;
    const macros = macroSplit(
      targetCal,
      args.currentWeight,
      goalIsLoss ? "cut" : "maintain",
    );

    const systemPrompt = `You are a nutritionist. Output ONLY valid JSON matching the CutPlanSchema envelope (weeklyPlan, summary, etc.) but adapted for a general weight goal.

${SECOND_PERSON_DIRECTIVE}

Every narrative string (summary, weekly focus, safetyNotes, keyPrinciples) MUST address the user as "you" / "your" - this is YOUR plan being handed to YOU.

DETERMINISTIC:
- BMR ${bmr}, maintenance ${maintenanceCal}, target ${targetCal} kcal/day
- Macros: ${macros.protein_g}P / ${macros.carb_g}C / ${macros.fat_g}F
- ${weekCount} weeks, ${days} days remaining
- Start ${args.currentWeight}kg -> goal ${args.goalWeight}kg

${snap.block}`;
    const result = await callGroqWithRetry({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate a ${weekCount}-week ${goalIsLoss ? "weight-loss" : "weight-gain"} plan. Optionally include up to 6 mealIdeas.`,
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
      finalTarget: args.goalWeight,
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
      feature: "generate-weight-plan",
      inputSnapshot: { ...args, bmr, maintenanceCal, targetCal },
      outputJson: plan,
      predictionFacts: {
        predicted_kcal: targetCal,
        predicted_loss_per_week_kg: parseFloat(
          ((args.currentWeight - args.goalWeight) / weekCount).toFixed(2),
        ),
      },
      model: "openai/gpt-oss-120b",
    });
    return plan;
  },
});
