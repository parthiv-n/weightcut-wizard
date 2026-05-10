/** Generate technique chains — gem-gated. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import { sanitizeUserText } from "../_shared/sanitizeUserText";
import { requireUserIdFromAction } from "./_helpers";
import { enforceGemGate } from "../_shared/subscriptionGuard";

export const run = action({
  args: {
    sport: v.string(),
    startingTechnique: v.string(),
    skillLevel: v.optional(v.string()),
    desiredOutcome: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserIdFromAction(ctx);
    await enforceGemGate(ctx, userId);
    const startSafe = sanitizeUserText(args.startingTechnique, {
      maxLength: 200,
      raw: true,
    });
    const desiredSafe = args.desiredOutcome
      ? sanitizeUserText(args.desiredOutcome, { maxLength: 200, raw: true })
      : "";
    const systemPrompt = `You are a JSON API. Return ONLY:
{ "chains": [{ "name": "string", "sequence": [{ "technique": "string", "rationale": "string" }] }] }
Each chain is 3-5 techniques. Generate 3 distinct chains.`;
    const userPrompt = `Sport: ${args.sport}. Starting from <user_input>${startSafe}</user_input>. Skill: ${args.skillLevel ?? "intermediate"}. Goal: <user_input>${desiredSafe || "score a finish"}</user_input>.`;
    const content = await callGroqText({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });
    return parseJSON(content);
  },
});
