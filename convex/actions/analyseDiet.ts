/** Analyse diet — micronutrient gaps. NOT gem-gated. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import { loadAthleteSnapshot, requireUserIdFromAction } from "./_helpers";

export const run = action({
  args: {
    meals: v.array(v.any()),
    profile: v.optional(v.any()),
    macroGoals: v.optional(v.any()),
    date: v.string(),
  },
  handler: async (ctx, { meals, profile, macroGoals, date }) => {
    const userId = await requireUserIdFromAction(ctx);
    if (!Array.isArray(meals) || meals.length === 0) {
      throw new Error("At least one meal is required");
    }
    const snap = await loadAthleteSnapshot(ctx, userId);
    const systemPrompt = `You are a JSON API. Respond with ONLY the JSON object. NEVER use em dashes.
You are a professional combat sports nutritionist. Analyse the athlete's full day of eating and estimate micronutrient intake.

Return JSON:
{ "summary": "...", "mealBreakdown": [...], "micronutrients": [...], "gaps": [...], "suggestions": [...] }

Rules:
- mealBreakdown: one entry per meal, top 3-4 micronutrients (highest amounts).
- Estimate from USDA food composition data
- RDA targets adjusted for an active combat sport athlete (${profile?.sex === "female" ? "female" : "male"}, ${profile?.age || 25} years)
- Only include gaps where percentRDA < 70
- Severity: critical < 30%, moderate 30-50%, low 50-70%
- percentRDA integers, capped at 100

${snap.block}`;

    const mealSummary = meals
      .map(
        (m: any) =>
          `${m.meal_type || "meal"}: ${m.meal_name} (${m.calories} kcal, ${m.protein_g}g P, ${m.carbs_g}g C, ${m.fats_g}g F)${
            m.ingredients?.length
              ? ` - ingredients: ${m.ingredients.map((i: any) => `${i.name} ${i.grams}g`).join(", ")}`
              : ""
          }`,
      )
      .join("\n");
    const userPrompt = `Analyse this athlete's full day of eating for ${date}:

${mealSummary}

Daily totals: ${meals.reduce((s, m: any) => s + (m.calories || 0), 0)} kcal, ${meals.reduce((s, m: any) => s + (m.protein_g || 0), 0)}g protein, ${meals.reduce((s, m: any) => s + (m.carbs_g || 0), 0)}g carbs, ${meals.reduce((s, m: any) => s + (m.fats_g || 0), 0)}g fats

Macro targets: ${macroGoals?.calorieTarget || "not set"} kcal, ${macroGoals?.proteinGrams || "?"} P, ${macroGoals?.carbsGrams || "?"} C, ${macroGoals?.fatsGrams || "?"} F

Athlete profile: ${profile?.age || "?"} years, ${profile?.sex || "?"}, ${profile?.current_weight_kg || "?"}kg, training ${profile?.training_frequency || "?"}/week`;

    const content = await callGroqText({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 2500,
      response_format: { type: "json_object" },
    });
    const analysisData = parseJSON(content);
    return { analysisData };
  },
});
