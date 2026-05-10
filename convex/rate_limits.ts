/**
 * Per-user, per-function rate limiting.
 *
 * Internal-only — exposed to Phase 4 actions (edge function replacements)
 * that need to throttle Groq calls. The client never calls these directly.
 *
 * The bucket is per (userId, functionName) and resets after `windowMs` ms.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const consume = internalMutation({
  args: {
    userId: v.id("users"),
    functionName: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, { userId, functionName, limit, windowMs }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("rate_limits")
      .withIndex("by_user_function", (q) =>
        q.eq("userId", userId).eq("functionName", functionName),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("rate_limits", {
        userId,
        functionName,
        requestCount: 1,
        windowStart: now,
      });
      return { allowed: true, remaining: limit - 1 };
    }
    // If the window has rolled over, reset.
    if (now - existing.windowStart > windowMs) {
      await ctx.db.patch(existing._id, {
        requestCount: 1,
        windowStart: now,
      });
      return { allowed: true, remaining: limit - 1 };
    }
    if (existing.requestCount >= limit) {
      return { allowed: false, remaining: 0 };
    }
    await ctx.db.patch(existing._id, {
      requestCount: existing.requestCount + 1,
    });
    return {
      allowed: true,
      remaining: limit - existing.requestCount - 1,
    };
  },
});

export const peek = internalQuery({
  args: {
    userId: v.id("users"),
    functionName: v.string(),
  },
  handler: async (ctx, { userId, functionName }) => {
    return await ctx.db
      .query("rate_limits")
      .withIndex("by_user_function", (q) =>
        q.eq("userId", userId).eq("functionName", functionName),
      )
      .unique();
  },
});
