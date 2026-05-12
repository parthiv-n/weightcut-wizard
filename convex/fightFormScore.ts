import { v } from "convex/values";
import { query, internalAction, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { optionalUserId, requireUserId } from "./lib/auth";
import { computeFightFormScore } from "../src/scoring/compose";
import { CURRENT_CONFIG } from "../src/scoring/config";

function todayInUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const getToday = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, { date }) => {
    const userId = await optionalUserId(ctx);
    if (!userId) return null;
    const targetDate = date ?? todayInUtc();
    const row = await ctx.db
      .query("fight_form_scores")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", targetDate))
      .order("desc")
      .first();
    if (row) return row;

    // Synthesize calibrating fallback (no row written).
    return {
      date: targetDate,
      displayedScore: 0,
      rawScore: 0,
      label: "off_pace" as const,
      state: "calibrating" as const,
      phase: null,
      campAge: null,
      subScores: null,
      appliedCeiling: null,
      topDriver: null,
      topLimiter: null,
      algorithmVersion: "1.0.0",
    };
  },
});

/**
 * Returns four booleans for whether the authenticated user has logged each
 * core daily input today (or for the supplied `date`). Used by the new
 * dashboard `TodayPanel` to render its adherence dots without firing four
 * separate `useQuery` hooks. Returns `null` when unauthenticated so callers
 * can fall back to optimistic state.
 */
export const loggedTodayBundle = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, { date }) => {
    const userId = await optionalUserId(ctx);
    if (!userId) return null;
    const targetDate = date ?? todayInUtc();

    const weight = await ctx.db
      .query("weight_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", targetDate))
      .first();
    const sleep = await ctx.db
      .query("sleep_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", targetDate))
      .first();
    const wellnessCheckin = await ctx.db
      .query("daily_wellness_checkins")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", targetDate))
      .first();
    // Training counts as "done" when there's any gym_session on the date with
    // status "completed" — matches the literal used by `gym_sessions.complete`
    // and the cleanup query in gym_sessions.ts.
    const sessions = await ctx.db
      .query("gym_sessions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", targetDate))
      .collect();
    const training = sessions.some((s) => s.status === "completed");

    return {
      weight: weight != null,
      sleep: sleep != null,
      training,
      wellnessCheckin: wellnessCheckin != null,
    };
  },
});

export const getHistory = query({
  args: { campId: v.id("fight_camps"), limit: v.optional(v.number()) },
  handler: async (ctx, { campId, limit }) => {
    const userId = await optionalUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("fight_form_scores")
      .withIndex("by_user_camp", (q) => q.eq("userId", userId).eq("campId", campId))
      .order("desc")
      .take(limit ?? 60);
    return rows;
  },
});

export const recomputeForUserDate = internalAction({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    const inputs = await ctx.runQuery(internal.fightFormScore_internal.fetchScoringInputs, { userId, date });

    // The fight camp is derived from the user's profile rather than a
    // separate fight_camps row: `profile.targetDate` is the fight date,
    // `profile.goalWeightKg` is the goal, and the earliest weight log is
    // both the starting weight and the camp start date. When the user
    // edits their target date in the Goals page, the next debounced
    // recompute picks it up automatically (Convex queries are reactive).
    const sortedWeights = [...inputs.weights].sort((a, b) => a.date.localeCompare(b.date));
    const earliestWeight = sortedWeights[0] ?? null;
    const latestWeight = sortedWeights[sortedWeights.length - 1] ?? null;

    const fightDate = inputs.profile?.targetDate ?? null;
    const goalWeightKg = inputs.profile?.goalWeightKg ?? null;
    const startingWeightKg = earliestWeight?.weightKg ?? inputs.profile?.currentWeightKg ?? null;
    // Camp starts at the first logged weight. If the user hasn't logged a
    // weight yet, treat today as the camp start so we don't block scoring
    // on the very first day.
    const campStartDate = earliestWeight?.date ?? date;
    const currentWeightKg = latestWeight?.weightKg ?? inputs.profile?.currentWeightKg ?? null;

    const scoringInputs = {
      date,
      fightDate,
      campStartDate,
      startingWeightKg,
      goalWeightKg,
      currentWeightKg,
      isCampPaused: false,
      isCampCompleted: false,
      sessions: inputs.sessions,
      sleepHours: inputs.sleepHours,
      weights: inputs.weights,
      hooperByDate: inputs.hooperByDate,
      meals: inputs.meals,
      targets: {
        calories: inputs.profile?.aiRecommendedCalories ?? null,
        proteinG: inputs.profile?.aiRecommendedProteinG ?? null,
      },
      priorRawScores: inputs.priorRawScores,
    };
    const score = computeFightFormScore(scoringInputs, CURRENT_CONFIG);
    await ctx.runMutation(internal.fightFormScore_internal.upsertScore, {
      userId,
      date,
      campId: undefined,
      score,
    });
    return score;
  },
});

export const recomputeNow = mutation({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const target = date ?? new Date().toISOString().slice(0, 10);
    await ctx.scheduler.runAfter(0, internal.fightFormScore.recomputeForUserDate, {
      userId,
      date: target,
    });
  },
});

export const scheduleDailyRecomputeAcrossUsers = internalAction({
  args: {},
  handler: async (ctx) => {
    // Hourly fan-out: v1 simplification, only actually run at UTC 04:00.
    // A proper timezone-aware fan-out is a follow-up.
    const nowUtcHour = new Date().getUTCHours();
    if (nowUtcHour !== 4) return;
    const userIds = await ctx.runQuery(internal.fightFormScore_internal.listActiveCampUserIds, {});
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const date = yesterday.toISOString().slice(0, 10);
    for (const userId of userIds) {
      await ctx.runAction(internal.fightFormScore.recomputeForUserDate, { userId, date });
    }
  },
});

export const backfillLast30Days = internalAction({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, { userId }) => {
    const ids: any[] = userId
      ? [userId]
      : await ctx.runQuery(internal.fightFormScore_internal.listActiveCampUserIds, {});
    for (const id of ids) {
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        const date = d.toISOString().slice(0, 10);
        await ctx.runAction(internal.fightFormScore.recomputeForUserDate, { userId: id, date });
      }
    }
  },
});
