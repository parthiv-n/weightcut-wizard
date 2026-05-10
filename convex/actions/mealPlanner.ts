/** Meal planner — heavy reasoning, gem-gated, logs decision for reconcile. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import {
  loadAthleteSnapshot,
  logDecision,
  requireUserIdFromAction,
} from "./_helpers";
import { enforceGemGate } from "../_shared/subscriptionGuard";

export const run = action({
  args: {
    prompt: v.string(),
    action: v.optional(v.string()),
    userData: v.optional(v.any()),
  },
  handler: async (ctx, { prompt }) => {
    const userId = await requireUserIdFromAction(ctx);
    await enforceGemGate(ctx, userId);
    const snap = await loadAthleteSnapshot(ctx, userId);
    const profile = snap.profile;
    const currentWeight = profile?.current_weight_kg ?? 70;
    const goalWeight = profile?.goal_weight_kg ?? 65;
    const tdee = profile?.tdee ?? 2000;
    const daysToGoal = profile?.target_date
      ? Math.max(
          1,
          Math.ceil(
            (new Date(profile.target_date).getTime() - Date.now()) / 86400000,
          ),
        )
      : 60;

    const weeklyWeightLoss = (currentWeight - goalWeight) / (daysToGoal / 7);
    const safeWeeklyLoss = Math.min(weeklyWeightLoss, 1);
    const dailyDeficit = (safeWeeklyLoss * 7700) / 7;
    const defaultCalorieTarget = Math.max(tdee - dailyDeficit, tdee * 0.8);
    const weeklyLossPercent = (weeklyWeightLoss / currentWeight) * 100;
    let safetyIndicator = "green";
    let safetyMessage = "Safe and sustainable weight loss pace";
    if (weeklyLossPercent > 1.5 || weeklyWeightLoss > 1) {
      safetyIndicator = "red";
      safetyMessage = "WARNING: Weight loss rate exceeds safe limits.";
    } else if (weeklyLossPercent > 1 || weeklyWeightLoss > 0.75) {
      safetyIndicator = "yellow";
      safetyMessage = "CAUTION: Approaching max safe weight loss rate";
    }

    let dailyCalorieTarget: number;
    let targetProtein: number;
    let targetCarbs: number;
    let targetFats: number;
    if (profile?.manual_nutrition_override && profile?.ai_recommended_calories) {
      dailyCalorieTarget = profile.ai_recommended_calories;
      targetProtein =
        profile.ai_recommended_protein_g ?? Math.round((dailyCalorieTarget * 0.4) / 4);
      targetCarbs =
        profile.ai_recommended_carbs_g ?? Math.round((dailyCalorieTarget * 0.3) / 4);
      targetFats =
        profile.ai_recommended_fats_g ?? Math.round((dailyCalorieTarget * 0.3) / 9);
    } else {
      dailyCalorieTarget = defaultCalorieTarget;
      targetProtein = Math.round((dailyCalorieTarget * 0.4) / 4);
      targetCarbs = Math.round((dailyCalorieTarget * 0.3) / 4);
      targetFats = Math.round(
        (dailyCalorieTarget - targetProtein * 4 - targetCarbs * 4) / 9,
      );
    }

    const systemPrompt = `Nutrition AI for fighters. Output ONLY raw JSON.

Athlete: ${profile?.sex ?? "unspecified"}${profile?.age ? `, ${profile.age}y` : ""}
Target: ${Math.round(dailyCalorieTarget)} cal/day (${currentWeight}kg→${goalWeight}kg, ${daysToGoal} days)
Safety: ${safetyIndicator} - ${safetyMessage}

MACRO TARGETS: ${targetProtein}g protein, ${targetCarbs}g carbs, ${targetFats}g fat

CRITICAL MATH:
- Each meal cal = (P*4)+(C*4)+(F*9), within ±20
- Sum meal P/C/F equals daily targets
- AT LEAST 3 meals

{
  "meals": [{ "name": "...", "calories": n, "protein": n, "carbs": n, "fats": n, "portion": "...", "recipe": "...", "type": "breakfast|lunch|dinner|snack", "ingredients": [{ "name": "...", "grams": n }] }],
  "totalCalories": ${Math.round(dailyCalorieTarget)},
  "totalProtein": ${targetProtein},
  "totalCarbs": ${targetCarbs},
  "totalFats": ${targetFats},
  "safetyStatus": "${safetyIndicator}",
  "safetyMessage": "${safetyMessage}",
  "tips": "..."
}

${snap.block}`;

    const content = await callGroqText({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User Request: ${prompt}` },
      ],
      temperature: 0.3,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });
    const mealPlanData = parseJSON(content);

    // Server-side macro reconciliation
    if (Array.isArray(mealPlanData?.meals) && mealPlanData.meals.length > 0) {
      for (const meal of mealPlanData.meals) {
        const p = meal.protein || 0;
        const c = meal.carbs || 0;
        const f = meal.fats || 0;
        meal.calories = p * 4 + c * 4 + f * 9;
      }
      const totals = {
        p: mealPlanData.meals.reduce((s: number, m: any) => s + (m.protein || 0), 0),
        c: mealPlanData.meals.reduce((s: number, m: any) => s + (m.carbs || 0), 0),
        f: mealPlanData.meals.reduce((s: number, m: any) => s + (m.fats || 0), 0),
      };
      mealPlanData.totalProtein = totals.p;
      mealPlanData.totalCarbs = totals.c;
      mealPlanData.totalFats = totals.f;
      mealPlanData.totalCalories = totals.p * 4 + totals.c * 4 + totals.f * 9;
    }

    logDecision(ctx, {
      userId,
      feature: "meal-planner",
      inputSnapshot: { currentWeight, goalWeight, tdee, daysToGoal },
      outputJson: mealPlanData,
      predictionFacts: {
        predicted_kcal: Math.round(mealPlanData?.totalCalories ?? dailyCalorieTarget),
        predicted_protein_g: Math.round(mealPlanData?.totalProtein ?? targetProtein),
      },
      model: "openai/gpt-oss-120b",
    });

    return {
      mealPlan: mealPlanData,
      dailyCalorieTarget: Math.round(dailyCalorieTarget),
      safetyStatus: safetyIndicator,
      safetyMessage,
    };
  },
});
