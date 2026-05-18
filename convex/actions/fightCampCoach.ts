/** Fight-camp coach — Pro-only chat focused on fight-week prep. */
"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { callGroqText } from "../_shared/groq";
import {
  sanitizeUserText,
  PROMPT_INJECTION_GUARD_INSTRUCTION,
} from "../_shared/sanitizeUserText";
import { loadAthleteSnapshot, requireUserIdFromAction, SECOND_PERSON_DIRECTIVE } from "./_helpers";
import { enforceFeatureGate } from "../_shared/featureGates";

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
    await enforceFeatureGate(ctx, userId, "AI_FIGHT_CAMP_COACH");
    const fightWeek = await ctx.runQuery(
      internal.actions_internal.fetchFightWeekData,
      { userId },
    );
    const snap = await loadAthleteSnapshot(ctx, userId);

    const camp = fightWeek.upcomingCamp;
    const fightWeekStr = camp
      ? `Upcoming fight ${camp.fight_date} (${camp.name}). Starting weight ${camp.starting_weight_kg ?? "?"}kg. Weigh-in timing: ${camp.weigh_in_timing ?? "?"}.`
      : "No upcoming fight scheduled.";
    const logsStr = fightWeek.fightWeekLogs
      .slice(0, 7)
      .map(
        (l: any) =>
          `${l.log_date}: ${l.weight_kg ?? "?"}kg, fluid ${l.fluid_intake_ml ?? "?"}ml, carbs ${l.carbs_g ?? "?"}g, sweat ${l.sweat_session_min ?? 0}min`,
      )
      .join("\n");
    const athleteName = userName
      ? sanitizeUserText(userName, { maxLength: 80, raw: true })
      : null;

    const systemPrompt = `You are the "Fight Camp Coach" - an elite combat-sports cut + fight-week specialist.${athleteName ? ` Your athlete's name is "${athleteName}" - call them by name when it lands naturally.` : ""}

${SECOND_PERSON_DIRECTIVE}

${PROMPT_INJECTION_GUARD_INSTRUCTION}

${fightWeekStr}

Your recent fight-week logs:
${logsStr || "(none)"}

${snap.block}

Be practical, evidence-based, and reference your athlete's real numbers ("your weight on Tuesday was..."). Markdown output, 150-300 words.`;

    const capped = messages.slice(-16);
    const safe = capped.map((m) =>
      m.role === "user"
        ? { ...m, content: sanitizeUserText(m.content, { maxLength: 2000, raw: true }) }
        : m,
    );
    const content = await callGroqText({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "system", content: systemPrompt }, ...safe],
      temperature: 0.5,
      max_tokens: 1500,
    });
    return { choices: [{ message: { content, role: "assistant" } }] };
  },
});
