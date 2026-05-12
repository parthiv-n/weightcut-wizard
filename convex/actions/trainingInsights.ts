/** Training insights — premium-only per-discipline coaching for the dashboard. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import { requireUserIdFromAction } from "./_helpers";
import {
  sanitizeUserText,
  PROMPT_INJECTION_GUARD_INSTRUCTION,
} from "../_shared/sanitizeUserText";

export const run = action({
  args: {
    session_type: v.string(),
    fingerprint: v.optional(v.string()),
    session_id: v.optional(v.union(v.string(), v.null())),
    session_date: v.optional(v.union(v.string(), v.null())),
    sessions: v.array(
      v.object({
        date: v.optional(v.string()),
        notes: v.optional(v.union(v.string(), v.null())),
        rpe: v.optional(v.union(v.number(), v.null())),
        intensity: v.optional(v.union(v.string(), v.null())),
        duration_minutes: v.optional(v.union(v.number(), v.null())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserIdFromAction(ctx);

    // Hard premium gate — this widget is premium-only, gems do not unlock it.
    const profile = await ctx.runQuery(internal.profiles_internal.getByUserId, {
      userId,
    });
    const isPremium = !!(
      profile?.subscriptionTier &&
      profile.subscriptionTier !== "free" &&
      (!profile.subscriptionExpiresAt || profile.subscriptionExpiresAt > Date.now())
    );
    if (!isPremium) {
      throw new Error("Premium required - upgrade to access training insights");
    }

    const sessionType = sanitizeUserText(args.session_type, {
      maxLength: 60,
      raw: true,
    });
    if (!sessionType) {
      throw new Error("session_type is required");
    }
    if (args.sessions.length === 0) {
      throw new Error("sessions cannot be empty");
    }

    // Cap to the 3 most-recent sessions; sanitise each notes field.
    const sessions = args.sessions.slice(0, 3).map((s) => ({
      date: typeof s.date === "string" ? s.date.slice(0, 10) : "",
      notes: sanitizeUserText(s.notes ?? "", { maxLength: 600, raw: true }),
      rpe: typeof s.rpe === "number" ? s.rpe : null,
      intensity: typeof s.intensity === "string" ? s.intensity.slice(0, 20) : null,
      duration_minutes:
        typeof s.duration_minutes === "number" ? s.duration_minutes : null,
    }));

    const systemPrompt = `You are a JSON API. Your FIRST output character MUST be "{". No preamble, markdown, or explanation — only the raw JSON object.
You are an expert combat-sports coach. You receive ONE training discipline and a small list of the athlete's most-recent logged sessions in that discipline (latest first). Produce a tightly-scoped, actionable next-focus block that quotes specific details the athlete logged.

${PROMPT_INJECTION_GUARD_INSTRUCTION}

Rules:
- Only comment on the supplied discipline. Never invent sessions or details not present in the input.
- "what_you_did": 1-2 sentences recapping the LATEST session, paraphrasing or directly referencing the athlete's notes.
- "next_focus": 1-2 sentences with SPECIFIC drills or corrections that build on what they logged. If they mentioned a combo, position, or mistake, weave it in by name. Avoid generic advice ("train harder", "improve cardio").
- If the latest notes are empty or trivial, still produce a focused suggestion based on RPE/intensity trend, but flag low information density implicitly through generality.
- Keep total output under 90 words.

Output schema (return ONLY this JSON object):
{
  "session_type": "string (echo input)",
  "last_logged": "YYYY-MM-DD (date of latest session)",
  "what_you_did": "string",
  "next_focus": "string"
}`;

    const userText = `Discipline: <user_input>${sessionType}</user_input>

Recent sessions (latest first):
${sessions
  .map(
    (s, i) =>
      `[${i + 1}] date=${s.date} rpe=${s.rpe ?? "n/a"} intensity=${s.intensity ?? "n/a"} duration_min=${s.duration_minutes ?? "n/a"}
notes: <user_input>${s.notes || "(none)"}</user_input>`,
  )
  .join("\n\n")}

Return ONLY the JSON object described in the schema. First character must be "{".`;

    const content = await callGroqText({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.2,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const insight = parseJSON(content);
    return { insight, library_entry_id: null };
  },
});
