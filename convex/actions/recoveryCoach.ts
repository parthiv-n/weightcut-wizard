/** Recovery coach — Groq `llama-3.1-8b-instant`. Gem-gated. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { callGroqText } from "../_shared/groq";
import { computeLoadMetrics, type SessionRow } from "../_shared/loadMetrics";
import { buildRecoveryContext } from "../_shared/recoveryContext";
import { loadAthleteSnapshot, requireUserIdFromAction } from "./_helpers";
import { enforceGemGate } from "../_shared/subscriptionGuard";
import {
  sanitizeUserText,
  PROMPT_INJECTION_GUARD_INSTRUCTION,
} from "../_shared/sanitizeUserText";

const TONE_RULE = `CRITICAL TONE RULE: You must write in full, natural, conversational English. Use complete sentences with proper grammar. Never write in shorthand. Never use slash-separated alternatives.`;

export const run = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      }),
    ),
    userName: v.optional(v.string()),
  },
  handler: async (ctx, { messages, userName }) => {
    const userId = await requireUserIdFromAction(ctx);
    await enforceGemGate(ctx, userId);

    const recovery = await ctx.runQuery(
      internal.actions_internal.fetchRecoveryData,
      { userId },
    );
    const sessions = recovery.sessions as SessionRow[];
    const loadMetrics = computeLoadMetrics(sessions);

    const profileForRecovery = recovery.todayWellness
      ? null
      : null; // recoveryContext expects profile shape – we pull it from snapshot data instead
    void profileForRecovery;

    // We need profile fields recoveryContext expects; reuse snapshot for that.
    const snap = await loadAthleteSnapshot(ctx, userId);
    const dataContext = buildRecoveryContext({
      profile: snap.profile
        ? {
            athlete_type: snap.profile.athlete_type,
            experience_level: snap.profile.experience_level,
            training_frequency: snap.profile.training_frequency,
            tdee: snap.profile.tdee,
            current_weight_kg: snap.profile.current_weight_kg,
            goal_weight_kg: snap.profile.goal_weight_kg,
            sex: snap.profile.sex,
            age: snap.profile.age,
          }
        : null,
      loadMetrics,
      wellness7d: recovery.wellness7d,
      todayWellness: recovery.todayWellness,
      baseline: recovery.baseline,
      upcomingCamp: recovery.upcomingCamp,
    });

    const capped = messages.slice(-16);
    const safeMessages = capped.map((m) =>
      m.role === "user"
        ? { ...m, content: sanitizeUserText(m.content, { maxLength: 2000, raw: true }) }
        : m,
    );

    const athleteName = userName
      ? sanitizeUserText(userName, { maxLength: 80, raw: true })
      : null;

    let systemPrompt = `You are the "Recovery Coach" - an elite combat sports recovery and training-load specialist.${
      athleteName ? ` The athlete's name is "${athleteName}".` : ""
    }

You have this athlete's real training load, wellness, and recovery data.

<athlete_data>
${dataContext}
</athlete_data>

Behavior rules:
- Reference the athlete's actual loadRatio, zone, readiness, Hooper, soreness, recent sessions.
- Red flags (sharp pain, syncope, concussion, etc.) - recommend professional consultation and do NOT prescribe training.
- When recommending a session, emit:
  **Suggested session**
  - Type: <sparring | technique | strength | conditioning | active recovery | mobility | rest | other>
  - Duration: <N> minutes
  - Intensity: <low | moderate | high>
  - Focus: <one short sentence>
- Markdown output. 120-300 words.

${TONE_RULE}

${snap.block}`;

    const content = await callGroqText({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: `${systemPrompt}\n\n${PROMPT_INJECTION_GUARD_INSTRUCTION}` },
        ...safeMessages,
      ],
      temperature: 0.6,
      max_tokens: 900,
    });

    return {
      choices: [{ message: { content, role: "assistant" } }],
    };
  },
});
