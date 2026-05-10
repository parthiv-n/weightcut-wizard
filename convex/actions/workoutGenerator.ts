/** Workout generator — fast Groq, NOT gem-gated. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import { sanitizeUserText } from "../_shared/sanitizeUserText";
import { requireUserIdFromAction, loadAthleteSnapshot } from "./_helpers";

export const run = action({
  args: {
    goal: v.string(),
    duration: v.optional(v.number()),
    equipment: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserIdFromAction(ctx);
    const snap = await loadAthleteSnapshot(ctx, userId);
    const cleanNotes = args.notes
      ? sanitizeUserText(args.notes, { maxLength: 400, raw: true })
      : "";
    const systemPrompt = `You are a JSON API. Return ONLY:
{ "name": "string", "duration_minutes": number, "warmup": ["..."], "blocks": [{ "name": "string", "exercises": [{ "name": "string", "sets": number, "reps": "string", "notes": "string" }] }], "cooldown": ["..."], "tips": ["..."] }
Use realistic structure for ${args.goal}. Cap blocks at 5.

${snap.block}`;
    const userPrompt = `Generate a workout. Goal: ${args.goal}. Duration: ${args.duration ?? 45} min. Equipment: ${(args.equipment ?? []).join(", ") || "bodyweight"}. Notes: <user_input>${cleanNotes || "(none)"}</user_input>.`;
    const content = await callGroqText({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });
    return parseJSON(content);
  },
});
