/** Weight tracker analysis — full nutrition protocol with macros + meal timing. Gem-gated. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import { projectWeight } from "../_shared/math";
import { loadAthleteSnapshot, requireUserIdFromAction, SECOND_PERSON_DIRECTIVE } from "./_helpers";
import { enforceGemGate } from "../_shared/subscriptionGuard";

export const run = action({
  args: {
    weightHistory: v.array(
      v.object({ date: v.string(), weight_kg: v.union(v.number(), v.string()) }),
    ),
    goalWeight: v.number(),
    targetDate: v.string(),
    currentWeight: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserIdFromAction(ctx);
    await enforceGemGate(ctx, userId);
    const snap = await loadAthleteSnapshot(ctx, userId);

    // Numeric weight history for trend math.
    const numeric = args.weightHistory
      .map((l) => ({ date: l.date, weight: Number(l.weight_kg) }))
      .filter((l) => Number.isFinite(l.weight));

    const today = new Date();
    const target = new Date(args.targetDate);
    const daysRemaining = Math.max(
      1,
      Math.ceil((target.getTime() - today.getTime()) / 86400000),
    );
    const weeksRemaining = Math.max(1, daysRemaining / 7);

    const weightDifference = args.goalWeight - args.currentWeight;
    const isMaintenanceMode = args.currentWeight <= args.goalWeight;
    const weightToGain =
      isMaintenanceMode && weightDifference > 0 ? weightDifference : 0;
    const weightToLose =
      !isMaintenanceMode && weightDifference < 0 ? Math.abs(weightDifference) : 0;
    const requiredWeeklyLoss =
      weightToLose > 0 ? weightToLose / weeksRemaining : 0;
    const requiredWeeklyGain =
      weightToGain > 0 ? weightToGain / weeksRemaining : 0;

    // Body adaptation patterns from logged history.
    const patterns = (() => {
      if (numeric.length < 2) return null;
      const sorted = [...numeric].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const firstWeight = sorted[0].weight;
      const lastWeight = sorted[sorted.length - 1].weight;
      const daysDiff =
        (new Date(sorted[sorted.length - 1].date).getTime() -
          new Date(sorted[0].date).getTime()) /
        86400000;
      const weeksDiff = daysDiff / 7;
      const avgWeeklyLoss =
        weeksDiff > 0 ? (firstWeight - lastWeight) / weeksDiff : 0;

      let plateauDetected = false;
      if (sorted.length >= 7) {
        const recent = sorted.slice(-7);
        const weights = recent.map((w) => w.weight);
        if (Math.max(...weights) - Math.min(...weights) < 0.3)
          plateauDetected = true;
      }

      let trend: "stable" | "declining" | "increasing" = "stable";
      const recent = sorted.slice(-14);
      if (recent.length >= 2) {
        const change = recent[0].weight - recent[recent.length - 1].weight;
        if (change > 0.5) trend = "declining";
        else if (change < -0.5) trend = "increasing";
      }

      return {
        avgWeeklyLoss: avgWeeklyLoss.toFixed(2),
        plateauDetected,
        trend,
        dataPoints: sorted.length,
        weightRange: `${lastWeight.toFixed(1)}-${firstWeight.toFixed(1)}kg`,
      };
    })();

    const projected = projectWeight(numeric, daysRemaining);

    const systemPrompt = `You are a JSON API. Respond with ONLY the JSON object. NEVER use em dashes in any text, use commas, periods, or regular hyphens instead.
You are the FightCamp Wizard - evidence-based sports nutrition specialist for combat athletes. Every narrative string MUST address the user as "you" / "your".

${SECOND_PERSON_DIRECTIVE}

RULES:
- fightWeekTarget = diet-only target (fat loss). These are bodyweight numbers in kg.
- IF currentWeight <= fightWeekTarget: calorieDeficit MUST be 0, recommendedCalories = TDEE (maintenance)
- IF currentWeight > fightWeekTarget: deficit 500-750 kcal/d (safe) or 750-1000 (aggressive), NEVER >1000
- Minimum calories: Males 1500, Females 1200
- Weekly loss: GREEN <=1.0 kg/wk, YELLOW 1.0-1.5, RED >1.5
- Protein: 2.0-2.5 g/kg | Carbs: scale with training | Fats: 20-30% total kcal
- ALWAYS generate a full plan regardless of how aggressive the goal is
- If requiredWeeklyLoss > 1.5: set riskLevel="red" and include a strong medical warning inside strategicGuidance, but still provide complete calorie/macro recommendations

STYLE - be a sports nutritionist writing a personalised protocol. Be specific with numbers. No filler.
- reasoningExplanation: 3-4 sentences. Explain WHY these calorie and macro numbers were chosen for YOU. Derive YOUR deficit from YOUR TDEE and the required weekly loss rate. Justify protein in g/kg of YOUR bodyweight. Justify the carb/fat split relative to YOUR training demands. Connect the numbers to YOU reaching YOUR goal weight by the target date.
- strategicGuidance: 4-5 sentences. Explain calorie strategy with training-day vs rest-day cycling. Explain how to structure the deficit, when to refeed (every 7-10 days if deficit >500 kcal), and hydration target (e.g., 40ml/kg bodyweight minimum).
- mealTiming: distribute recommendedCalories and proteinGrams across 4-5 meal slots. Each slot MUST include name, time, caloriePercent (integer, all slots sum to 100), calories, proteinGrams, and focus (ONE sentence). Include a pre-training and post-training slot. mealTiming.notes = 1-2 sentences on overall distribution. DO NOT name specific foods.
- weeklyWorkflow: 3-4 steps for the weekly check-in process (when/how to weigh, comparing 3-day average to target, adjustments if stalled, diet break trigger). Each step 2-3 sentences with specific numbers.
- trainingConsiderations: 4-5 sentences. Prioritise preserving compound lift strength, reduce volume by 20-30%, drop accessory volume first, limit HIIT, schedule sparring on higher-calorie days, consider a deload week every 3-4 weeks during an extended cut.
- timeline: 3-4 sentences. Break the cut into named phases (Aggressive, Moderate, Maintenance/Peak Week) with specific target weights per phase and calorie levels.
- weeklyPlan: each week value 30-50 words with training-day and rest-day calorie targets, protein target, cardio, hydration, target weight for the end of that week.

DO NOT include specific food recommendations (no meal suggestions, no food names). Focus on calorie/macro numbers, training adjustments, hydration, and weekly monitoring.

OUTPUT (return ONLY this JSON):
{
  "riskLevel": "green|yellow|red",
  "requiredWeeklyLoss": 0.8,
  "recommendedCalories": 2200,
  "calorieDeficit": 500,
  "proteinGrams": 160,
  "carbsGrams": 200,
  "fatsGrams": 70,
  "reasoningExplanation": "string",
  "strategicGuidance": "string",
  "weeklyWorkflow": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "trainingConsiderations": "string",
  "timeline": "string",
  "weeklyPlan": { "week1": "string", "week2": "string", "ongoing": "string" },
  "mealTiming": {
    "distribution": [
      { "name": "Breakfast", "time": "7:30 AM", "caloriePercent": 25, "calories": 550, "proteinGrams": 40, "focus": "string" },
      { "name": "Pre-Training", "time": "45 min pre-session", "caloriePercent": 15, "calories": 330, "proteinGrams": 25, "focus": "string" },
      { "name": "Post-Training", "time": "within 30 min", "caloriePercent": 25, "calories": 550, "proteinGrams": 45, "focus": "string" },
      { "name": "Dinner", "time": "7:30 PM", "caloriePercent": 35, "calories": 770, "proteinGrams": 50, "focus": "string" }
    ],
    "notes": "string"
  }
}

${snap.block}`;

    const weightStatus =
      weightToGain > 0
        ? `GAIN ${weightToGain.toFixed(1)}kg (below target) | Required: +${requiredWeeklyGain.toFixed(2)} kg/wk`
        : weightToLose > 0
          ? `LOSE ${weightToLose.toFixed(1)}kg | Required: -${requiredWeeklyLoss.toFixed(2)} kg/wk`
          : `At target (maintenance)`;

    let userPrompt = `Weight strategy:
- Current: ${args.currentWeight}kg | Goal (fight week target): ${args.goalWeight}kg
- Status: ${weightStatus}
- Timeline: ${daysRemaining}d (${weeksRemaining.toFixed(1)} weeks)
- Required weekly loss: ${requiredWeeklyLoss.toFixed(2)} kg/wk`;

    if (patterns) {
      userPrompt += `\n\nWEIGHT PATTERNS (${patterns.dataPoints} entries):
- Avg weekly loss: ${patterns.avgWeeklyLoss} kg/wk | Trend: ${patterns.trend} | Range: ${patterns.weightRange}
- Plateau: ${patterns.plateauDetected ? "Yes (7+ days stable)" : "No"}`;
    }

    if (projected != null) {
      userPrompt += `\n\nDeterministic projection at target date (14d slope): ${projected.toFixed(1)}kg`;
    }

    if (isMaintenanceMode) {
      userPrompt += `\n\nMAINTENANCE MODE: At/below target. calorieDeficit=0, recommendedCalories=TDEE.${weightToGain > 0 ? ` Gain ${weightToGain.toFixed(1)}kg via maintenance calories, not surplus.` : ""}`;
    }

    const content = await callGroqText({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 2500,
      response_format: { type: "json_object" },
    });
    const parsed = parseJSON(content);

    // Backfill the deterministic requiredWeeklyLoss so the UI never sees NaN.
    if (typeof parsed.requiredWeeklyLoss !== "number") {
      parsed.requiredWeeklyLoss = requiredWeeklyLoss;
    }

    return parsed;
  },
});
