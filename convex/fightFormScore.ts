import { v } from "convex/values";
import { query } from "./_generated/server";

function todayInUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const getToday = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, { date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject as any;
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

export const getHistory = query({
  args: { campId: v.id("fight_camps"), limit: v.optional(v.number()) },
  handler: async (ctx, { campId, limit }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject as any;
    const rows = await ctx.db
      .query("fight_form_scores")
      .withIndex("by_user_camp", (q) => q.eq("userId", userId).eq("campId", campId))
      .order("desc")
      .take(limit ?? 60);
    return rows;
  },
});

import { internalAction, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { computeFightFormScore } from "../src/scoring/compose";
import { CURRENT_CONFIG } from "../src/scoring/config";

export const recomputeForUserDate = internalAction({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    const inputs = await ctx.runQuery(internal.fightFormScore_internal.fetchScoringInputs, { userId, date });
    const scoringInputs = {
      date,
      fightDate: inputs.camp?.fightDate ?? null,
      campStartDate: inputs.camp?._creationTime
        ? new Date(inputs.camp._creationTime).toISOString().slice(0, 10)
        : null,
      startingWeightKg: inputs.camp?.startingWeightKg ?? null,
      goalWeightKg: inputs.camp?.endWeightKg ?? inputs.profile?.goalWeightKg ?? null,
      currentWeightKg:
        inputs.weights.length > 0 ? inputs.weights[inputs.weights.length - 1].weightKg : null,
      isCampPaused: false,
      isCampCompleted: inputs.camp?.isCompleted ?? false,
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
      campId: inputs.camp?._id,
      score,
    });
    return score;
  },
});

export const recomputeNow = mutation({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, { date }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("unauthenticated");
    const userId = identity.subject as any;
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
    // Hourly fan-out: v1 simplification — only actually run at UTC 04:00.
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
