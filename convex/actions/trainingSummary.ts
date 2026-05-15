/** Training summary — gem-gated, summarises a week of training. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { callGroqText } from "../_shared/groq";
import { parseJSON } from "../_shared/parseResponse";
import { requireUserIdFromAction, SECOND_PERSON_DIRECTIVE } from "./_helpers";
import { enforceGemGate } from "../_shared/subscriptionGuard";
import {
  sanitizeUserText,
  PROMPT_INJECTION_GUARD_INSTRUCTION,
} from "../_shared/sanitizeUserText";

export const run = action({
  args: { weekStart: v.string() },
  handler: async (ctx, { weekStart }) => {
    const userId = await requireUserIdFromAction(ctx);
    await enforceGemGate(ctx, userId);
    const data = await ctx.runQuery(internal.actions_internal.fetchTrainingWeek, {
      userId,
      weekStart,
    });

    // Only sessions with non-empty notes are useful for technique analysis.
    const sessionsWithNotes = (data.sessions ?? []).filter(
      (s: any) => typeof s?.notes === "string" && s.notes.trim().length > 0,
    );

    if (sessionsWithNotes.length === 0) {
      return {
        sportSections: [],
        weekOverview: "No training logged this week.",
      };
    }

    const sessionsText = sessionsWithNotes
      .map((s: any) => {
        const cleanNotes = sanitizeUserText(s.notes, { maxLength: 800, raw: true });
        return `${s.date} | ${s.session_type} | ${s.duration_minutes}min | Notes: <user_input>${cleanNotes}</user_input>`;
      })
      .join("\n");

    const systemPrompt = `You are a combat sports training analyst. Organize the user's weekly session notes by sport. Speak directly to them in every string field.

${SECOND_PERSON_DIRECTIVE}

${PROMPT_INJECTION_GUARD_INSTRUCTION}

For each technique/problem in YOUR notes:
- 3-5 step execution guide written to you ("Step into the angle...", "Drop your hips...")
- 1 sparring tip ("In sparring, look for...")
- "drillFlow": ALWAYS include a 3-4 step improvement progression from solo/bag → partner/positional → live sparring

Group by the EXACT session_type provided in the data. Valid types: BJJ, Muay Thai, Boxing, Wrestling, Sparring, Strength, Conditioning, Run.
IMPORTANT: Keep each sport SEPARATE. Boxing is NOT Muay Thai — do not merge or remap combat sports. Use the session_type value exactly as given.

Return ONLY valid JSON in this EXACT shape:
{
  "sportSections": [
    {
      "sport": "BJJ",
      "sessions_count": 2,
      "techniques": [
        {
          "name": "Kimura from Side Control",
          "steps": ["Step 1", "Step 2", "Step 3"],
          "sparringTip": "Set up from failed americana...",
          "drillFlow": ["Solo: hip escape reps 3x10", "Partner: positional start from side control", "Live: 3min rounds from side control only"]
        }
      ]
    }
  ],
  "weekOverview": "1-2 sentence summary"
}`;

    const userPrompt = `Here are my training sessions from this week. Organize the techniques and drills I worked on:\n\n${sessionsText}`;

    const content = await callGroqText({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });

    const parsed = parseJSON(content) as {
      sportSections?: unknown;
      weekOverview?: unknown;
    };

    // Defense-in-depth: surface a clear error to the frontend toast instead of
    // silently saving a malformed payload that renders blank in the UI.
    if (!Array.isArray(parsed?.sportSections) || typeof parsed?.weekOverview !== "string") {
      throw new Error("AI returned malformed summary - please retry");
    }

    return {
      sportSections: parsed.sportSections,
      weekOverview: parsed.weekOverview,
    };
  },
});
