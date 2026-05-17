import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { CURRENT_CONFIG } from "../src/scoring/config";

export const fetchScoringInputs = internalQuery({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const end = new Date(date + "T00:00:00Z");
    const lookbackStart = new Date(end);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 28);
    const lookbackStartIso = lookbackStart.toISOString().slice(0, 10);

    const weights = await ctx.db
      .query("weight_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    const sleep = await ctx.db
      .query("sleep_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    const sessions = await ctx.db
      .query("gym_sessions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    // Mirrors the union used in `loggedTodayBundle` so the assumed-sleep
    // rescue (below) fires whether the user logged via the GymTracker
    // (gym_sessions) or the fight-camp calendar.
    const calendarEntries = await ctx.db
      .query("fight_camp_calendar")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    const wellness = await ctx.db
      .query("daily_wellness_checkins")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    const meals = await ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();

    // Aggregate meals by day (cal + protein from meal_items)
    const mealsByDay = new Map<string, { date: string; calories: number; proteinG: number }>();
    for (const m of meals) {
      const items = await ctx.db
        .query("meal_items")
        .withIndex("by_meal", (q) => q.eq("mealId", m._id))
        .collect();
      const cal = items.reduce((a, x) => a + (x.calories ?? 0), 0);
      const pro = items.reduce((a, x) => a + (x.proteinG ?? 0), 0);
      const cur = mealsByDay.get(m.date) ?? { date: m.date, calories: 0, proteinG: 0 };
      cur.calories += cal;
      cur.proteinG += pro;
      mealsByDay.set(m.date, cur);
    }

    // Prior raw scores for EMA (last 3 days before target)
    const priorEnd = new Date(end); priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
    const priorStart = new Date(priorEnd); priorStart.setUTCDate(priorStart.getUTCDate() - 2);
    const priorRaw = await ctx.db
      .query("fight_form_scores")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId)
         .gte("date", priorStart.toISOString().slice(0, 10))
         .lte("date", priorEnd.toISOString().slice(0, 10)),
      )
      .collect();

    // "Forgot to log sleep" rescue: if the user has no sleep_log for the
    // target date but logged a meaningful training session that day (≥ N
    // minutes, where N is tunable in ScoringConfig), inject a default
    // sleep entry so the score isn't penalised for a missing log. The
    // assumption is NOT written to `sleep_logs` — when the user later
    // enters their real hours, the standard upsert + scheduled recompute
    // (see convex/sleep_logs.ts) overrides the assumption cleanly.
    const minDuration = CURRENT_CONFIG.sleep.minTrainingDurationForAssumption;
    const hasSleepForTargetDate = sleep.some((s) => s.date === date);
    const meaningfulGym = sessions.some(
      (s) =>
        s.date === date &&
        s.status === "completed" &&
        (s.durationMinutes ?? 0) >= minDuration,
    );
    const meaningfulCalendar = calendarEntries.some(
      (c) =>
        c.date === date &&
        (c.sessionType ?? "").toLowerCase() !== "rest" &&
        (c.durationMinutes ?? 0) >= minDuration,
    );
    const trainedToday = meaningfulGym || meaningfulCalendar;
    const sleepLogsForScoring = sleep.map((s) => ({ date: s.date, hours: s.hours }));
    const assumedSleepDates: string[] = [];
    if (!hasSleepForTargetDate && trainedToday) {
      sleepLogsForScoring.push({ date, hours: CURRENT_CONFIG.sleep.defaultAssumedHours });
      assumedSleepDates.push(date);
    }

    return {
      date,
      profile,
      weights: weights.map((w) => ({ date: w.date, weightKg: w.weightKg })),
      sleepHours: sleepLogsForScoring,
      assumedSleepDates,
      // gym_sessions has no session-level `rpe`; use `perceivedFatigue` as proxy.
      sessions: sessions
        .filter((s) => s.durationMinutes != null && s.perceivedFatigue != null)
        .map((s) => ({ date: s.date, rpe: s.perceivedFatigue!, durationMinutes: s.durationMinutes! })),
      hooperByDate: wellness
        .filter((w) => w.hooperIndex != null)
        .map((w) => ({ date: w.date, hooper: w.hooperIndex! })),
      meals: Array.from(mealsByDay.values()),
      priorRawScores: priorRaw.map((p) => ({ date: p.date, rawScore: p.rawScore })),
    };
  },
});

export const upsertScore = internalMutation({
  args: {
    userId: v.id("users"),
    date: v.string(),
    campId: v.optional(v.id("fight_camps")),
    score: v.any(),
  },
  handler: async (ctx, { userId, date, campId, score }) => {
    const existing = await ctx.db
      .query("fight_form_scores")
      .withIndex("by_user_date_version", (q) =>
        q.eq("userId", userId).eq("date", date).eq("algorithmVersion", score.algorithmVersion),
      )
      .first();
    const row = {
      userId,
      date,
      campId,
      rawScore: score.rawScore,
      displayedScore: score.score,
      label: score.label,
      state: score.state,
      phase: score.phase ?? undefined,
      subScores: score.subScores,
      appliedCeiling: score.appliedCeiling ?? undefined,
      campAge: score.campAge ?? undefined,
      topDriver: score.topDriver,
      topLimiter: score.topLimiter,
      algorithmVersion: score.algorithmVersion,
      computedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("fight_form_scores", row);
  },
});

/**
 * Returns the userIds of every profile that has a target date set.
 * The fight camp is now derived from `profiles.targetDate` (the date the
 * user is walking towards) plus the earliest weight log, so anyone with a
 * profile is in scope. Previously this scanned the `fight_camps` table.
 */
export const listActiveCampUserIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Id<"users">>> => {
    const profiles = await ctx.db.query("profiles").collect();
    return profiles
      .filter((p) => typeof p.targetDate === "string" && p.targetDate.length > 0)
      .map((p) => p.userId);
  },
});
