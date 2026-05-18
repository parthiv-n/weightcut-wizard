/** Generate technique chains — Pro-only. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import { sanitizeUserText } from "../_shared/sanitizeUserText";
import { requireUserIdFromAction, SECOND_PERSON_DIRECTIVE } from "./_helpers";
import { enforceFeatureGate } from "../_shared/featureGates";

export const run = action({
  args: {
    sport: v.string(),
    startingTechnique: v.string(),
    skillLevel: v.optional(v.string()),
    desiredOutcome: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserIdFromAction(ctx);
    await enforceFeatureGate(ctx, userId, "AI_TECHNIQUE_CHAINS");
    const startSafe = sanitizeUserText(args.startingTechnique, {
      maxLength: 200,
      raw: true,
    });
    const desiredSafe = args.desiredOutcome
      ? sanitizeUserText(args.desiredOutcome, { maxLength: 200, raw: true })
      : "";
    const systemPrompt = `You are a JSON API. Return ONLY:
{ "chains": [{ "name": "string", "sequence": [{ "technique": "string", "rationale": "string" }] }] }

${SECOND_PERSON_DIRECTIVE}

Each chain is 3-5 techniques. Generate 3 distinct chains. Write every "rationale" string TO the user as a coach would: "When you land the jab, your opponent's hands come up - that's your opening for...".`;
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
