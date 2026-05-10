/** Training summary — gem-gated, summarises a week of training. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import { requireUserIdFromAction } from "./_helpers";
import { enforceGemGate } from "../_shared/subscriptionGuard";

export const run = action({
  args: { weekStart: v.string() },
  handler: async (ctx, { weekStart }) => {
    const userId = await requireUserIdFromAction(ctx);
    await enforceGemGate(ctx, userId);
    const data = await ctx.runQuery(internal.actions_internal.fetchTrainingWeek, {
      userId,
      weekStart,
    });
    if (data.sessions.length === 0) {
      return { summary: "No training logged this week.", sessions: [], tips: [] };
    }
    const systemPrompt = `You are a JSON API. Return ONLY:
{ "summary": "string", "highlights": ["..."], "concerns": ["..."], "tips": ["..."] }
Use the real session data. <=200 total words.`;
    const userPrompt = `Week ${data.weekStart}-${data.weekEnd}, ${data.sessions.length} sessions:
${data.sessions.map((s: any) => `${s.date} ${s.session_type} ${s.duration_minutes}min RPE${s.rpe}${s.notes ? ` (${s.notes})` : ""}`).join("\n")}`;
    const content = await callGroqText({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });
    return parseJSON(content);
  },
});
