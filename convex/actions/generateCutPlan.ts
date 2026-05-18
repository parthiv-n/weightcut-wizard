/** Generate cut plan — free for everyone, card-timeline shape. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { callGroqWithRetry } from "../_shared/groq";
import { CutPlanSchema, type WeekPhase } from "../_shared/aiSchemas";
import { mifflinStJeor, requiredDeficit, macroSplit } from "../_shared/math";
import { normaliseWeeklyPlan } from "../_shared/normalizeWeeklyPlan";
import { normalisePlanTopLevel } from "../_shared/normalizePlanTopLevel";
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
    // Free for everyone — see featureGates.ts for the policy reason.
    const snap = await loadAthleteSnapshot(ctx, userId);
    const primaryStruggle: string | undefined =
      typeof snap.profile?.primaryStruggle === "string"
        ? snap.profile.primaryStruggle
        : undefined;
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

    const systemPrompt = `You are an evidence-based combat-sports nutritionist building a card-based fight-camp plan. Output ONLY valid JSON matching the schema. Use the deterministic numbers below verbatim — never invent calories or macros that contradict them.

${SECOND_PERSON_DIRECTIVE}

USER STRUGGLE: ${primaryStruggle ?? "unspecified"}
You MUST address this struggle directly in \`personalNote\` (1-2 sentences, ≤280 chars) and weave one mitigating tactic into the relevant week's \`dailyFocus\` bullets.

Per week, return:
- \`phase\`: one of foundation | build | peak | final | fight_week (the LAST week MUST be fight_week)
- \`heroLine\`: ≤80 chars, ONE memorable sentence (e.g. "Week 3 is the grind — protein bumps to 2.0 g/kg")
- \`keyMetric\`: ≤24 chars headline (e.g. "−1.2 kg", "Sodium 4 g")
- \`dailyFocus\`: 3-5 bullets, each ≤60 chars, imperative voice ("Weigh in 7am pre-water"). NO PARAGRAPHS.
- \`risk\` / \`recovery\`: ≤80 chars each, optional

Also return:
- \`phases[]\`: 2-3 macro phases with name + label + weekStart + weekEnd + 1-line \`intent\` (≤120 chars)
- \`toughestWeek\`: { week, reason ≤120 chars }
- \`personalNote\`: 10-280 chars, references the struggle above
- \`summary\`: ≤500 chars, ONE paragraph max
- \`safetyNotes\`: ≤300 chars, optional
- \`keyPrinciples\`: 3-5 short rules, each ≤120 chars
- \`fightWeek\`: { lowCarb, sodium, waterLoading, nutrition } — each ≤240 chars

BANNED: paragraph-length focus strings, motivational fluff, repeating numbers already in \`calories\`/\`protein_g\`, generic advice that ignores the user struggle above, em-dashes (—) or en-dashes (–) anywhere in the output — use commas or periods instead.

DETERMINISTIC FACTS:
- BMR: ${bmr}, maintenance: ${maintenanceCal}, target: ${targetCal} kcal
- Macros: ${macros.protein_g}P / ${macros.carb_g}C / ${macros.fat_g}F
- Weeks: ${weekCount}, days remaining: ${days}
- Starting weight: ${args.currentWeight}kg, final target: ${finalTarget}kg

${snap.block}`;

    let aiResult: any = null;
    try {
      aiResult = await callGroqWithRetry({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate a ${weekCount}-week cut plan for an athlete cutting from ${args.currentWeight}kg to ${finalTarget}kg in ${days} days. Tapered weekly targets, 2-3 phase summary, structured per-week cards with heroLine + dailyFocus bullets, personalNote tied to the struggle, toughestWeek call-out, and a fightWeek protocol block.`,
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

    const fallbackPlan =
      aiResult ??
      buildDeterministicCutPlan({
        weekCount,
        startWeight: args.currentWeight,
        finalTarget,
        targetCal,
        deficitKcal: deficit.dailyDeficitKcal,
        macros,
        daysRemaining: days,
        primaryStruggle,
      });

    const weeklyPlan = normaliseWeeklyPlan({
      weeklyPlan: fallbackPlan.weeklyPlan,
      weekCount,
      startWeight: args.currentWeight,
      finalTarget,
      defaultCalories: targetCal,
      defaultProtein: macros.protein_g,
      defaultCarbs: macros.carb_g,
      defaultFats: macros.fat_g,
      flow: "cut",
    });

    const topLevel = normalisePlanTopLevel({
      raw: fallbackPlan,
      weeklyPlan,
      primaryStruggle,
    });

    const plan = {
      weeklyPlan,
      ...topLevel,
      maintenanceCalories: maintenanceCal,
      targetCalories: targetCal,
      deficit: deficit.dailyDeficitKcal,
      totalWeeks: weekCount,
      weeklyLossTarget: `${((args.currentWeight - finalTarget) / weekCount).toFixed(2)} kg/week`,
    };

    logDecision(ctx, {
      userId,
      feature: "generate-cut-plan",
      inputSnapshot: { ...args, bmr, maintenanceCal, targetCal, primaryStruggle },
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
 * Deterministic cut plan in the v2 card-timeline shape. Used when Groq
 * is rate-limited or returns a malformed plan. Math-driven, no AI.
 */
function buildDeterministicCutPlan(opts: {
  weekCount: number;
  startWeight: number;
  finalTarget: number;
  targetCal: number;
  deficitKcal: number;
  macros: { protein_g: number; carb_g: number; fat_g: number };
  daysRemaining: number;
  primaryStruggle?: string;
}) {
  const {
    weekCount,
    startWeight,
    finalTarget,
    targetCal,
    deficitKcal,
    macros,
    daysRemaining,
  } = opts;
  const totalKg = +(startWeight - finalTarget).toFixed(2);
  const perWeekKg = +(totalKg / weekCount).toFixed(2);

  const phaseFor = (i: number): WeekPhase => {
    if (i === weekCount - 1) return "fight_week";
    if (weekCount <= 2) return "build";
    const pct = i / (weekCount - 1);
    if (pct <= 0.2) return "foundation";
    if (pct <= 0.6) return "build";
    return "peak";
  };

  const weeklyPlan = Array.from({ length: weekCount }, (_, i) => {
    const week = i + 1;
    const t = (i + 1) / weekCount;
    const targetWeight = +(startWeight - totalKg * t).toFixed(1);
    const phase = phaseFor(i);
    const kgRemaining = +(targetWeight - finalTarget).toFixed(1);
    const heroLine =
      phase === "fight_week"
        ? "Fight week — cut carbs, load water, drop salt."
        : phase === "foundation"
          ? "Lock the routine — same wake, same weigh-in."
          : phase === "peak"
            ? `Peak intensity — ${kgRemaining.toFixed(1)} kg to fight weight.`
            : `Week ${week} — hold pace at ${perWeekKg.toFixed(2)} kg/week.`;
    const keyMetric = phase === "fight_week" ? "Water + salt" : `−${perWeekKg.toFixed(1)} kg`;
    const dailyFocus =
      phase === "fight_week"
        ? [
            "Carbs ≤1 g/kg days -7 to -3",
            "Sodium 4-5 g, then <500 mg from day -2",
            "Water 8L → 4L → 1L → nothing",
            "Sip electrolytes post-weigh-in",
          ]
        : phase === "foundation"
          ? [
              "Weigh in 7am pre-water",
              `Hit ${macros.protein_g}g protein every day`,
              "Sleep 8h+, no screens after 10pm",
              "Log every meal as you eat it",
            ]
          : phase === "peak"
            ? [
                "Sparring + intensity stay on schedule",
                `Carbs around training, fats on rest days`,
                "Track 7-day weight trend, not daily",
                "One flexible meal per week max",
              ]
            : [
                `${targetCal} kcal target, deficit ${Math.round(deficitKcal)} kcal`,
                `${macros.protein_g}g protein split across 4 meals`,
                "Recovery day every 3rd session",
              ];
    const risk =
      phase === "peak"
        ? "Hard sparring days — fuel pre-session with 60g carbs"
        : undefined;
    const recovery =
      phase === "peak"
        ? "Contrast shower + 8h sleep after intense sessions"
        : undefined;
    return {
      week,
      targetWeight,
      calories: targetCal,
      protein_g: macros.protein_g,
      carbs_g: macros.carb_g,
      fats_g: macros.fat_g,
      phase,
      heroLine,
      keyMetric,
      dailyFocus,
      risk,
      recovery,
    };
  });

  // Derive phases array
  const phaseGroups: { name: WeekPhase; weekStart: number; weekEnd: number }[] = [];
  for (const row of weeklyPlan) {
    const last = phaseGroups[phaseGroups.length - 1];
    if (last && last.name === row.phase) last.weekEnd = row.week;
    else
      phaseGroups.push({ name: row.phase, weekStart: row.week, weekEnd: row.week });
  }
  const phaseLabel: Record<WeekPhase, string> = {
    foundation: "Foundation",
    build: "Build",
    peak: "Peak",
    final: "Final Week",
    fight_week: "Fight Week",
  };
  const phaseIntent: Record<WeekPhase, string> = {
    foundation: "Lock in the rhythm. Same wake, same weigh-in, same meals.",
    build: "Steady deficit. Weeks 3-4 may stall — that's rebalancing, not failure.",
    peak: "Drive weight down hard. Toughest sessions land here.",
    final: "Hold the deficit, protect lean mass, finish strong.",
    fight_week: "Carbs → water → salt → weigh-in. Then refuel.",
  };
  const phases = phaseGroups.map((g) => ({
    name: g.name,
    label: phaseLabel[g.name],
    weekStart: g.weekStart,
    weekEnd: g.weekEnd,
    intent: phaseIntent[g.name],
  }));

  return {
    weeklyPlan,
    phases,
    personalNote: "Built around your numbers and your timeline — repeat the daily reps and the math handles the rest.",
    toughestWeek: {
      week: Math.max(1, Math.ceil(weekCount * 0.6)),
      reason: "Deepest deficit + hardest sessions stack here. Sleep is non-negotiable.",
    },
    summary: `${targetCal} kcal/day to drop ~${perWeekKg.toFixed(2)} kg/week, hitting ${finalTarget} kg by fight day in ${daysRemaining} days. Trust the daily reps; the math handles the rest.`,
    totalWeeks: weekCount,
    weeklyLossTarget: `${perWeekKg.toFixed(2)} kg/week`,
    safetyNotes:
      "Stop and reassess if you feel persistently dizzy or sparring drops noticeably. Two-week stalls = ease the deficit by 100-200 kcal.",
    keyPrinciples: [
      `Hit ${macros.protein_g}g protein every day — protect lean mass through the cut.`,
      `Stay within ${Math.round(deficitKcal)} kcal of target. Training days closer to maintenance, rest days deeper.`,
      "Weigh in mornings, post-bathroom, before water. Track the 7-day average.",
      "Sleep 8+ hours. Under-recovery wrecks the cut faster than under-eating.",
    ],
    fightWeek: {
      lowCarb:
        "Days -7 to -3: cut carbs to ~1 g/kg bodyweight. Keeps glycogen low so the water-load drops weight cleanly later.",
      sodium:
        "Days -7 to -3: sodium 4-5 g/day, then drop to <500 mg from day -2. The body sheds water on the drop.",
      waterLoading:
        "Days -5 to -3: 8 L/day. Day -2: 4 L. Day -1: 1 L sips. Morning of weigh-in: nothing.",
      nutrition:
        "Post weigh-in: electrolytes (Na 1500 mg, K 400 mg per 500 mL) + 0.5 g/kg carbs/hour. White rice, banana. 12 hr to fight: real meals.",
    },
  };
}
