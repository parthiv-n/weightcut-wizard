/** Rehydration protocol — heavy reasoning, NOT gem-gated. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { callGroqWithRetry } from "../_shared/groq";
import { RehydrationPlanSchema } from "../_shared/aiSchemas";
import { RESEARCH_SUMMARY } from "../_shared/researchSummary";
import { reidRealeWaterCut } from "../_shared/math";
import { loadAthleteSnapshot, requireUserIdFromAction } from "./_helpers";

export const run = action({
  args: {
    weighInWeightKg: v.number(),
    fightWeightKg: v.optional(v.number()),
    hoursUntilFight: v.number(),
    sex: v.union(v.literal("male"), v.literal("female")),
    dehydrationPercent: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserIdFromAction(ctx);
    const snap = await loadAthleteSnapshot(ctx, userId);
    const waterCut = reidRealeWaterCut(args.weighInWeightKg);
    const dehydrationPct =
      args.dehydrationPercent ??
      (args.fightWeightKg
        ? Math.max(0, (args.fightWeightKg - args.weighInWeightKg) / args.fightWeightKg)
        : 0.03);

    const systemPrompt = `You are an evidence-based combat-sports nutritionist. Output ONLY valid JSON matching this schema:
{ "summary": "...", "phases": [{ "startHour": n, "endHour": n, "phase": "...", "fluidMLPerHour": n, "sodiumMgPerHour": n, "potassiumMgPerHour": n, "magnesiumMgPerHour": n, "carbsGPerHour": n, "drinkRecipe": "...", "notes": "...", "foods": ["..."] }], "carbRefuelPlan": { "strategy": "...", "meals": [{ "timing": "...", "carbsG": n, "foods": ["..."], "rationale": "..." }] }, "warnings": ["..."] }

Use the research evidence below for protocol shape (Reale 2018, ISSN 2025).

<research>
${RESEARCH_SUMMARY}
</research>

Deterministic numbers:
- Athlete weighed in at ${args.weighInWeightKg}kg, est dehydration ${(dehydrationPct * 100).toFixed(1)}%
- ${args.hoursUntilFight}h until fight
- Reid-Reale water-cut reference: day-2 ${waterCut.dayMinus2.fluidML}ml/${waterCut.dayMinus2.sodiumMg}mg, day-1 ${waterCut.dayMinus1.fluidML}ml/${waterCut.dayMinus1.sodiumMg}mg

${snap.block}`;

    const result = await callGroqWithRetry({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate a ${args.hoursUntilFight}-hour rehydration protocol. Phases must cover the full window. Replace 125-150% of fluid lost. Include sodium, potassium, magnesium, carbs per hour.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      schema: RehydrationPlanSchema,
    });
    return result;
  },
});
