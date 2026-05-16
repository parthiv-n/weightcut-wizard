/** Generate cut plan — heavy reasoning, gem-gated, logs decision. */
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
import { enforceGemGate } from "../_shared/subscriptionGuard";

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
    await enforceGemGate(ctx, userId);
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

    // Try Groq first; fall back to a deterministic plan if every retry
    // fails (rate limit, timeout, schema). Better to ship a numerically
    // sound plan the user can refine than to strand them on the retry
    // card during a Groq outage.
    let aiResult: any = null;
    try {
      aiResult = await callGroqWithRetry({
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
    } catch (err) {
      console.warn(
        `[generateCutPlan] Groq failed, using deterministic fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const fallbackPlan = aiResult ?? buildDeterministicCutPlan({
      weekCount,
      startWeight: args.currentWeight,
      finalTarget,
      targetCal,
      deficitKcal: deficit.dailyDeficitKcal,
      macros,
      daysRemaining: days,
    });

    const normalised = normaliseWeeklyPlan({
      weeklyPlan: fallbackPlan.weeklyPlan,
      weekCount,
      startWeight: args.currentWeight,
      finalTarget,
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
      feature: "generate-cut-plan",
      inputSnapshot: { ...args, bmr, maintenanceCal, targetCal },
      outputJson: plan,
      predictionFacts: {
        predicted_kcal: targetCal,
        predicted_loss_per_week_kg: parseFloat(
          ((args.currentWeight - finalTarget) / weekCount).toFixed(2),
        ),
      },
      model: aiResult ? "openai/gpt-oss-120b" : "deterministic-fallback",
    });
    return plan;
  },
});

/**
 * Deterministic cut plan builder used when Groq is rate-limited.
 * Produces a CutPlan-shaped object (passes Zod) with reasonable
 * weekly tapered targets + a fightWeek block. Math-driven, no AI.
 */
function buildDeterministicCutPlan(opts: {
  weekCount: number;
  startWeight: number;
  finalTarget: number;
  targetCal: number;
  deficitKcal: number;
  macros: { protein_g: number; carb_g: number; fat_g: number };
  daysRemaining: number;
}): {
  weeklyPlan: any[];
  summary: string;
  totalWeeks: number;
  weeklyLossTarget: string;
  safetyNotes: string;
  keyPrinciples: string[];
  fightWeek: { lowCarb: string; sodium: string; waterLoading: string; nutrition: string };
} {
  const { weekCount, startWeight, finalTarget, targetCal, deficitKcal, macros, daysRemaining } = opts;
  const totalKg = +(startWeight - finalTarget).toFixed(2);
  const perWeekKg = +(totalKg / weekCount).toFixed(2);

  const weeklyPlan = Array.from({ length: weekCount }, (_, i) => {
    const week = i + 1;
    const t = (i + 1) / weekCount;
    const targetWeight = +(startWeight - totalKg * t).toFixed(1);
    return {
      week,
      targetWeight,
      calories: targetCal,
      protein_g: macros.protein_g,
      carbs_g: macros.carb_g,
      fats_g: macros.fat_g,
      focus:
        week === 1
          ? "Lock in the pattern. Same wake time, same weigh-in, same routine every day."
          : week === weekCount
            ? "Fight week — manage water, sodium, and carbs per the protocol below."
            : `Hold pace at ${perWeekKg.toFixed(2)} kg/week. Sparring + intensity sessions stay on schedule.`,
    };
  });

  return {
    weeklyPlan,
    summary: `Your cut: ${targetCal} kcal/day to drop ~${perWeekKg.toFixed(2)} kg/week, hitting ${finalTarget} kg by fight day in ${daysRemaining} days. Trust the daily reps; the math handles the rest.`,
    totalWeeks: weekCount,
    weeklyLossTarget: `${perWeekKg.toFixed(2)} kg/week`,
    safetyNotes:
      "Stop the cut and reassess if you feel persistently dizzy, can't sleep, or sparring drops noticeably. Two-week stalls = ease the deficit by 100-200 kcal.",
    keyPrinciples: [
      `Hit ${macros.protein_g}g protein every day — protect lean mass through the cut.`,
      `Stay within ${Math.round(deficitKcal)} kcal of target. Training days closer to maintenance, rest days deeper.`,
      "Weigh in mornings, post-bathroom, before water. Track the 7-day average.",
      "Sleep 8+ hours through cut weeks; under-recovery wrecks the cut faster than under-eating.",
    ],
    fightWeek: {
      lowCarb:
        "Days -7 to -3: cut carbs to ~1 g/kg bodyweight. Keeps glycogen low so the water-load drops weight cleanly later.",
      sodium:
        "Days -7 to -3: bump sodium to 4-5 g/day, then drop to <500 mg from day -2 onward. The body sheds extra water on the drop.",
      waterLoading:
        "Days -5 to -3: drink 8 L/day. Day -2: cut to 4 L. Day -1: 1 L sips. Morning of weigh-in: nothing.",
      nutrition:
        "Post weigh-in: sip electrolytes (Na 1500 mg, K 400 mg per 500 mL) + 0.5 g/kg carbs/hour with low-fibre starches (white rice, banana). 12 hr to fight: real meals, normal portions.",
    },
  };
}
