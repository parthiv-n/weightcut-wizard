/** Hydration insights — fast, Pro-only. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import { requireUserIdFromAction, SECOND_PERSON_DIRECTIVE } from "./_helpers";
import { enforceFeatureGate } from "../_shared/featureGates";

export const run = action({
  args: {
    last7Days: v.array(
      v.object({
        date: v.string(),
        amount_ml: v.number(),
        sodium_mg: v.optional(v.number()),
      }),
    ),
    bodyweight: v.optional(v.number()),
  },
  handler: async (ctx, { last7Days, bodyweight }) => {
    const userId = await requireUserIdFromAction(ctx);
    await enforceFeatureGate(ctx, userId, "AI_HYDRATION_INSIGHTS");
    const totalMl = last7Days.reduce((s, l) => s + l.amount_ml, 0);
    const days = last7Days.length || 1;
    const avgMl = Math.round(totalMl / days);
    const target = bodyweight ? Math.round(bodyweight * 35) : 2500;
    const systemPrompt = `You are a JSON API. Return ONLY this JSON:
{ "summary": "string", "status": "green|yellow|red", "tips": ["..."] }

${SECOND_PERSON_DIRECTIVE}

Rules:
- Compare YOUR athlete's avg intake (${avgMl}ml/day) against their target (${target}ml/day).
- green: >=95% target, yellow 75-95%, red <75%
- summary: address the user directly ("You're hitting ${avgMl}ml...").
- tips: 2-3 short tips written TO the user ("Add a pinch of salt to..."), prioritise sodium balance for combat athletes.`;
    const userPrompt = `Your last 7 days of hydration:
${last7Days.map((l) => `${l.date}: ${l.amount_ml}ml${l.sodium_mg ? `, ${l.sodium_mg}mg sodium` : ""}`).join("\n")}

Your bodyweight: ${bodyweight ?? "unknown"}kg.`;
    const content = await callGroqText({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: "json_object" },
    });
    return parseJSON(content);
  },
});
