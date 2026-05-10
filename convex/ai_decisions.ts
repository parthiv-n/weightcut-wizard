/**
 * AI decision audit log — every Groq call writes a row here so we can
 * (a) compute prediction-vs-actual deltas, (b) honour user rating/feedback,
 * (c) feed a future learning loop.
 *
 * Internal-only: Phase 4 actions own all writes. The client reads
 * `getRecentForUser` (a public query) for the "AI history" view.
 */
import { v } from "convex/values";
import {
  query,
  internalMutation,
} from "./_generated/server";
import { requireUserId } from "./lib/auth";

export const getRecentForUser = query({
  args: {
    feature: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { feature, limit }) => {
    const userId = await requireUserId(ctx);
    if (feature) {
      return await ctx.db
        .query("ai_decisions")
        .withIndex("by_user_feature_recent", (q) =>
          q.eq("userId", userId).eq("feature", feature),
        )
        .order("desc")
        .take(limit ?? 20);
    }
    return await ctx.db
      .query("ai_decisions")
      .withIndex("by_user_feature_recent", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit ?? 20);
  },
});

export const recordDecision = internalMutation({
  args: {
    userId: v.id("users"),
    feature: v.string(),
    inputSnapshot: v.any(),
    outputJson: v.any(),
    predictionFacts: v.optional(v.any()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("ai_decisions", args);
  },
});

export const recordOutcome = internalMutation({
  args: {
    id: v.id("ai_decisions"),
    actualOutcome: v.any(),
    errorPct: v.optional(v.number()),
  },
  handler: async (ctx, { id, actualOutcome, errorPct }) => {
    await ctx.db.patch(id, {
      actualOutcome,
      errorPct,
      outcomeLoggedAt: Date.now(),
    });
  },
});
