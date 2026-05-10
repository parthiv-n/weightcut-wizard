/** Training insights — NOT gem-gated. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import { computeLoadMetrics, type SessionRow } from "../_shared/loadMetrics";
import { requireUserIdFromAction } from "./_helpers";

export const run = action({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserIdFromAction(ctx);
    const data = await ctx.runQuery(internal.actions_internal.fetchRecoveryData, {
      userId,
    });
    const sessions = data.sessions as SessionRow[];
    const metrics = computeLoadMetrics(sessions);
    const systemPrompt = `You are a JSON API. Return ONLY:
{ "summary": "string", "zone": "detraining|optimal|pushing|overreaching", "headline": "string", "insights": ["..."], "recommendations": ["..."] }
Reference real load metrics (acuteLoad, chronicLoad, ratio, zone, RPE).`;
    const userPrompt = `Athlete training load (last 28d):
- Acute (7d): ${Math.round(metrics.acuteLoad)}
- Chronic (28d daily avg): ${Math.round(metrics.chronicLoad)}
- Ratio: ${metrics.loadRatio.toFixed(2)} (${metrics.loadZone})
- Avg RPE last 7d: ${metrics.avgRpe7d?.toFixed(1) ?? "?"}
- Avg sleep 7d: ${metrics.avgSleep7d?.toFixed(1) ?? "?"}h
- Sessions last 7d: ${metrics.sessionsLast7d}

Recent sessions:
${metrics.recentSessions.map((s) => `${s.date} ${s.session_type} ${s.duration_minutes}min RPE${s.rpe}`).join("\n")}`;
    const content = await callGroqText({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 900,
      response_format: { type: "json_object" },
    });
    return parseJSON(content);
  },
});
