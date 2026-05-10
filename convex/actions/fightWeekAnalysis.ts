/** Fight-week analysis — gem-gated, deterministic + AI commentary. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import { requireUserIdFromAction } from "./_helpers";
import { enforceGemGate } from "../_shared/subscriptionGuard";

export const run = action({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserIdFromAction(ctx);
    await enforceGemGate(ctx, userId);
    const data = await ctx.runQuery(internal.actions_internal.fetchFightWeekData, {
      userId,
    });
    const camp = data.upcomingCamp;
    if (!camp) {
      return {
        ok: false,
        reason: "No upcoming fight scheduled.",
      };
    }
    const daysOut = Math.ceil(
      (new Date(camp.fight_date).getTime() - Date.now()) / 86400000,
    );
    const startWeight =
      camp.starting_weight_kg ?? data.profile?.current_weight_kg ?? null;
    const currentWeight =
      data.weight14d[0]?.weight_kg ?? data.profile?.current_weight_kg ?? null;
    const goalWeight = data.profile?.goal_weight_kg ?? null;
    const targetWeighIn = data.profile?.fight_week_target_kg ?? goalWeight;
    const kgToCut =
      currentWeight != null && targetWeighIn != null
        ? Math.max(0, currentWeight - targetWeighIn)
        : null;

    const systemPrompt = `You are a JSON API. Return ONLY:
{ "summary": "string", "trafficLight": "green|orange|red", "kgToCut": number, "daysOut": number, "advice": "string", "watchOuts": ["..."] }
Reference actual numbers, no em dashes.`;
    const userPrompt = `Camp: ${camp.name}, fight ${camp.fight_date} (${daysOut} days out).
Start ${startWeight ?? "?"}kg, current ${currentWeight ?? "?"}kg, target weigh-in ${targetWeighIn ?? "?"}kg.
Kg still to cut: ${kgToCut ?? "?"}.

Recent fight-week logs (most recent first):
${data.fightWeekLogs.map((l: any) => `${l.log_date}: ${l.weight_kg ?? "?"}kg, fluid ${l.fluid_intake_ml ?? "?"}ml, carbs ${l.carbs_g ?? "?"}g`).join("\n")}

Recent weight logs:
${data.weight14d.slice(0, 7).map((w: any) => `${w.date}: ${w.weight_kg}kg`).join("\n")}`;
    const content = await callGroqText({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });
    const parsed = parseJSON(content);
    parsed.kgToCut = kgToCut ?? parsed.kgToCut;
    parsed.daysOut = daysOut;
    return parsed;
  },
});
