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
