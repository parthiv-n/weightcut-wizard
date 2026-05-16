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
    // Try Groq first. If every retry fails (busy / timeout / schema /
    // anything), fall back to a deterministic plan built from the
    // numbers we've already calculated — better to give the user a
    // working plan they can refine later than to throw and strand them
    // on the retry card. Any AI-only fields (summary, focus copy,
    // mealIdeas) get reasonable defaults.
    let aiResult: any = null;
    try {
      aiResult = await callGroqWithRetry({
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
    } catch (err) {
      // Log + continue to deterministic fallback. Surfaced via
      // logDecision below so we can spot upstream Groq outages.
      console.warn(
        `[generateWeightPlan] Groq failed, using deterministic fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const fallbackPlan = aiResult ?? buildDeterministicWeightPlan({
      weekCount,
      startWeight: args.currentWeight,
      finalTarget: args.goalWeight,
      goalIsLoss,
      targetCal,
      maintenanceCal,
      deficitKcal: deficit.dailyDeficitKcal,
      macros,
    });

    const normalised = normaliseWeeklyPlan({
      weeklyPlan: fallbackPlan.weeklyPlan,
      weekCount,
      startWeight: args.currentWeight,
      finalTarget: args.goalWeight,
      defaultCalories: targetCal,
      defaultProtein: macros.protein_g,
      defaultCarbs: macros.carb_g,
      defaultFats: macros.fat_g,
    });
    const plan = {
      ...fallbackPlan,
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
      model: aiResult ? "openai/gpt-oss-120b" : "deterministic-fallback",
    });
    return plan;
  },
});

/**
 * Deterministic plan builder used when Groq is rate-limited or
 * unavailable. Returns a CutPlan-shaped object with realistic numbers
 * and second-person copy so the user can still finish onboarding and
 * start tracking. The InlinePlanDisplay can't tell the difference —
 * same shape, same fields. Numbers are derived from the same math the
 * AI is given as a hint.
 */
function buildDeterministicWeightPlan(opts: {
  weekCount: number;
  startWeight: number;
  finalTarget: number;
  goalIsLoss: boolean;
  targetCal: number;
  maintenanceCal: number;
  deficitKcal: number;
  macros: { protein_g: number; carb_g: number; fat_g: number };
}): {
  weeklyPlan: any[];
  summary: string;
  totalWeeks: number;
  weeklyLossTarget: string;
  safetyNotes: string;
  keyPrinciples: string[];
} {
  const { weekCount, startWeight, finalTarget, goalIsLoss, targetCal, deficitKcal, macros } = opts;
  const totalChangeKg = +(startWeight - finalTarget).toFixed(2);
  const perWeekKg = +(totalChangeKg / weekCount).toFixed(2);
  const direction = goalIsLoss ? "loss" : "gain";

  // Linear interpolation between current → target across weekCount.
  // Each week is its own row so the existing InlinePlanDisplay /
  // weeklyPlan reader has the full ladder.
  const weeklyPlan = Array.from({ length: weekCount }, (_, i) => {
    const week = i + 1;
    const t = (i + 1) / weekCount;
    const targetWeight = +(startWeight - totalChangeKg * t).toFixed(1);
    return {
      week,
      targetWeight,
      calories: targetCal,
      protein_g: macros.protein_g,
      carbs_g: macros.carb_g,
      fats_g: macros.fat_g,
      focus:
        week === 1
          ? "Hit your calorie target every day this week. Weigh in each morning, same conditions."
          : week === weekCount
            ? "Final stretch — keep the routine, prioritise sleep, no last-minute changes."
            : `Stay the course. Aim for ${perWeekKg.toFixed(2)} kg ${direction} this week.`,
    };
  });

  return {
    weeklyPlan,
    summary:
      goalIsLoss
        ? `Your plan: ${targetCal} kcal/day to drop about ${perWeekKg.toFixed(2)} kg per week, hitting ${finalTarget} kg in ${weekCount} weeks. Track every day, weigh in mornings, and trust the process.`
        : `Your plan: ${targetCal} kcal/day with a small surplus to gain about ${Math.abs(perWeekKg).toFixed(2)} kg per week, reaching ${finalTarget} kg in ${weekCount} weeks. Eat consistently, lift consistently.`,
    totalWeeks: weekCount,
    weeklyLossTarget: `${perWeekKg.toFixed(2)} kg/week`,
    safetyNotes:
      "If you feel persistently tired, dizzy, or your weight stalls for two+ weeks, ease the deficit by 100-200 kcal and reassess. Don't drop below 1200 kcal for women / 1500 for men.",
    keyPrinciples: [
      `${macros.protein_g}g protein every day — protect lean mass.`,
      "Weigh in daily, same conditions; track the 7-day average, not the daily noise.",
      `Stay within ${Math.round(deficitKcal)} kcal of your target on training days.`,
      "Sleep 7-9 hours; under-recovery wrecks adherence faster than under-eating.",
    ],
  };
}
