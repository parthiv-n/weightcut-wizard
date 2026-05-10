/** Weight tracker analysis — trend + projection. Gem-gated. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import { projectWeight } from "../_shared/math";
import { loadAthleteSnapshot, requireUserIdFromAction } from "./_helpers";
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

    const numeric = args.weightHistory
      .map((l) => ({ date: l.date, weight: Number(l.weight_kg) }))
      .filter((l) => Number.isFinite(l.weight));
    const daysToTarget = Math.max(
      1,
      Math.ceil(
        (new Date(args.targetDate).getTime() - Date.now()) / 86400000,
      ),
    );
    const projected = projectWeight(numeric, daysToTarget);

    const systemPrompt = `You are a JSON API. Return ONLY this exact JSON:
{ "summary": "string", "trend": "losing|gaining|stable", "weeklyRate": number, "projection": { "atTarget": number, "achievable": boolean }, "advice": "string", "riskLevel": "green|orange|red" }
Reference real numbers. <=12 words per field unless noted.

${snap.block}`;
    const userPrompt = `Weight logs (most recent first):
${args.weightHistory.slice(-14).reverse().map((l) => `${l.date}: ${l.weight_kg}kg`).join("\n")}

Current: ${args.currentWeight}kg, goal: ${args.goalWeight}kg by ${args.targetDate} (${daysToTarget} days).
Deterministic projection at target date (14d slope): ${projected ?? "insufficient data"}.`;
    const content = await callGroqText({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });
    const parsed = parseJSON(content);
    if (projected != null && parsed.projection) {
      parsed.projection.atTarget = projected;
    }
    return parsed;
  },
});
