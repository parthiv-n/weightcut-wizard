/**
 * Wellness, baselines, insights and chat messages.
 *
 * Combined into one file because all four tables share the same access
 * pattern (auth-scoped by userId).
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./lib/auth";

// ───────────────────────────────────────────────────────────────────────
// daily_wellness_checkins
// ───────────────────────────────────────────────────────────────────────

export const listCheckins = query({
  args: {
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { from, to, limit }) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("daily_wellness_checkins")
      .withIndex("by_user_date", (q) => {
        const base = q.eq("userId", userId);
        if (from && to) return base.gte("date", from).lte("date", to);
        if (from) return base.gte("date", from);
        if (to) return base.lte("date", to);
        return base;
      })
      .order("desc")
      .take(limit ?? 90);
    return rows;
  },
});

export const upsertCheckin = mutation({
  args: {
    date: v.string(),
    sleepQuality: v.number(),
    fatigueLevel: v.number(),
    sorenessLevel: v.number(),
    stressLevel: v.number(),
    sleepHours: v.optional(v.number()),
    energyLevel: v.optional(v.number()),
    motivationLevel: v.optional(v.number()),
    appetiteLevel: v.optional(v.number()),
    hydrationFeeling: v.optional(v.number()),
    hooperIndex: v.optional(v.number()),
    readinessScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("daily_wellness_checkins")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", args.date),
      )
      .unique();
    let resultId;
    if (existing) {
      const patch: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(args)) {
        if (val !== undefined && k !== "date") patch[k] = val;
      }
      await ctx.db.patch(existing._id, patch as any);
      resultId = existing._id;
    } else {
      resultId = await ctx.db.insert("daily_wellness_checkins", {
        userId,
        ...args,
      });
    }
    await ctx.scheduler.runAfter(5_000, internal.fightFormScore.recomputeForUserDate, {
      userId,
      date: args.date,
    });
    return resultId;
  },
});

// ───────────────────────────────────────────────────────────────────────
// personal_baselines
// ───────────────────────────────────────────────────────────────────────

export const getLatestBaseline = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("personal_baselines")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
  },
});

export const upsertBaseline = mutation({
  args: {
    baselineDate: v.string(),
    data: v.any(),
  },
  handler: async (ctx, { baselineDate, data }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("personal_baselines")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("baselineDate", baselineDate),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...data,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("personal_baselines", {
      userId,
      baselineDate,
      ...data,
      updatedAt: Date.now(),
    });
  },
});

// ───────────────────────────────────────────────────────────────────────
// user_insights
// ───────────────────────────────────────────────────────────────────────

export const listInsights = query({
  args: { insightType: v.optional(v.string()) },
  handler: async (ctx, { insightType }) => {
    const userId = await requireUserId(ctx);
    if (insightType) {
      return await ctx.db
        .query("user_insights")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", userId).eq("insightType", insightType),
        )
        .collect();
    }
    return await ctx.db
      .query("user_insights")
      .withIndex("by_user_type", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const upsertInsight = mutation({
  args: {
    insightType: v.string(),
    insightData: v.any(),
    confidenceScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("user_insights")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", userId).eq("insightType", args.insightType),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        insightData: args.insightData,
        confidenceScore: args.confidenceScore,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("user_insights", {
      userId,
      ...args,
      updatedAt: Date.now(),
    });
  },
});

// ───────────────────────────────────────────────────────────────────────
// chat_messages
// ───────────────────────────────────────────────────────────────────────

export const listMessages = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("chat_messages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit ?? 50);
    return rows.reverse();
  },
});

export const appendMessage = mutation({
  args: { role: v.string(), content: v.string() },
  handler: async (ctx, { role, content }) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("chat_messages", { userId, role, content });
  },
});

export const clearMessages = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const all = await ctx.db
      .query("chat_messages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const m of all) await ctx.db.delete(m._id);
  },
});
