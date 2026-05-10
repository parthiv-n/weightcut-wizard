/**
 * Saved gym routines (AI-generated or manual).
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("saved_routines")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const createRoutine = mutation({
  args: {
    name: v.string(),
    goal: v.string(),
    sport: v.optional(v.string()),
    trainingDaysPerWeek: v.optional(v.number()),
    isAiGenerated: v.optional(v.boolean()),
    exercises: v.any(),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    // Compute the next sort order if not provided.
    let sortOrder = args.sortOrder;
    if (sortOrder === undefined) {
      const all = await ctx.db
        .query("saved_routines")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      sortOrder =
        all.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;
    }
    return await ctx.db.insert("saved_routines", {
      userId,
      name: args.name,
      goal: args.goal,
      sport: args.sport,
      trainingDaysPerWeek: args.trainingDaysPerWeek,
      isAiGenerated: args.isAiGenerated ?? false,
      exercises: args.exercises,
      sortOrder,
      updatedAt: Date.now(),
    });
  },
});

export const updateRoutine = mutation({
  args: {
    id: v.id("saved_routines"),
    name: v.optional(v.string()),
    goal: v.optional(v.string()),
    sport: v.optional(v.string()),
    trainingDaysPerWeek: v.optional(v.number()),
    exercises: v.optional(v.any()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...rest }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Routine not found");
    if (row.userId !== userId) throw new Error("Not authorized");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(id, patch as any);
  },
});

export const deleteRoutine = mutation({
  args: { id: v.id("saved_routines") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) return;
    if (row.userId !== userId) throw new Error("Not authorized");
    await ctx.db.delete(id);
  },
});
