/**
 * Weight log queries + mutations.
 *
 * `logWeight` is an upsert keyed by (userId, date) — replaces the
 * Supabase pattern of "check + update OR insert" from `useWeightData.ts`.
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import type { Doc } from "./_generated/dataModel";

function toClient(row: Doc<"weight_logs">) {
  return {
    id: row._id,
    user_id: row.userId,
    date: row.date,
    weight_kg: row.weightKg,
    created_at: new Date(row._creationTime).toISOString(),
  };
}

export const listForUser = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("weight_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("asc")
      .take(limit ?? 365);
    return rows.map(toClient);
  },
});

export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query("weight_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    return row ? toClient(row) : null;
  },
});

/** Upsert by (userId, date). Same-date logs overwrite the prior value
 *  instead of creating a duplicate row — matches the Postgres unique
 *  constraint on (user_id, date). */
export const logWeight = mutation({
  args: { date: v.string(), weightKg: v.number() },
  handler: async (ctx, { date, weightKg }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("weight_logs")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", date),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { weightKg });
      return existing._id;
    }
    return await ctx.db.insert("weight_logs", { userId, date, weightKg });
  },
});

export const deleteLog = mutation({
  args: { id: v.id("weight_logs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) return;
    if (row.userId !== userId) throw new Error("Not authorized");
    await ctx.db.delete(id);
  },
});
