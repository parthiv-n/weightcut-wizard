/**
 * Sleep log queries + mutations. Upsert by (userId, date).
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./lib/auth";
import type { Doc } from "./_generated/dataModel";

function toClient(row: Doc<"sleep_logs">) {
  return {
    id: row._id,
    user_id: row.userId,
    date: row.date,
    hours: row.hours,
    created_at: new Date(row._creationTime).toISOString(),
  };
}

export const listForUser = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("sleep_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit ?? 90);
    return rows.map(toClient);
  },
});

export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("sleep_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    return row ? toClient(row) : null;
  },
});

export const logSleep = mutation({
  args: { date: v.string(), hours: v.number() },
  handler: async (ctx, { date, hours }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("sleep_logs")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", date),
      )
      .unique();
    let resultId;
    if (existing) {
      await ctx.db.patch(existing._id, { hours });
      resultId = existing._id;
    } else {
      resultId = await ctx.db.insert("sleep_logs", { userId, date, hours });
    }
    await ctx.scheduler.runAfter(5_000, internal.fightFormScore.recomputeForUserDate, {
      userId,
      date,
    });
    return resultId;
  },
});

export const deleteLog = mutation({
  args: { id: v.id("sleep_logs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) return;
    if (row.userId !== userId) throw new Error("Not authorized");
    await ctx.db.delete(id);
  },
});
