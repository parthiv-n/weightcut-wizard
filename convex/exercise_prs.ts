/**
 * Per-exercise personal records.
 *
 * `updatePR` is invoked from set-logging flows when a new set beats the
 * current max. The mutation is idempotent: callers can spam it with the
 * latest stats and it'll only update if the new candidate is actually
 * higher than the stored value.
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import type { Doc } from "./_generated/dataModel";

function toClient(row: Doc<"exercise_prs">) {
  return {
    id: row._id,
    user_id: row.userId,
    exercise_id: row.exerciseId,
    best_set_id: row.bestSetId ?? null,
    max_weight_kg: row.maxWeightKg ?? null,
    max_reps: row.maxReps ?? null,
    max_volume: row.maxVolume ?? null,
    estimated_1rm: row.estimated1rm ?? null,
    updated_at: row.updatedAt,
    created_at: row._creationTime,
  };
}

export const getForUser = query({
  args: { exerciseId: v.optional(v.id("exercises")) },
  handler: async (ctx, { exerciseId }) => {
    const userId = await requireUserId(ctx);
    if (exerciseId) {
      const row = await ctx.db
        .query("exercise_prs")
        .withIndex("by_user_exercise", (q) =>
          q.eq("userId", userId).eq("exerciseId", exerciseId),
        )
        .unique();
      return row ? [toClient(row)] : [];
    }
    const all = await ctx.db
      .query("exercise_prs")
      .withIndex("by_user_exercise", (q) => q.eq("userId", userId))
      .collect();
    return all.map(toClient);
  },
});

export const updatePR = mutation({
  args: {
    exerciseId: v.id("exercises"),
    bestSetId: v.optional(v.id("gym_sets")),
    maxWeightKg: v.optional(v.number()),
    maxReps: v.optional(v.number()),
    maxVolume: v.optional(v.number()),
    estimated1rm: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("exercise_prs")
      .withIndex("by_user_exercise", (q) =>
        q.eq("userId", userId).eq("exerciseId", args.exerciseId),
      )
      .unique();
    if (!existing) {
      return await ctx.db.insert("exercise_prs", {
        userId,
        exerciseId: args.exerciseId,
        bestSetId: args.bestSetId,
        maxWeightKg: args.maxWeightKg,
        maxReps: args.maxReps,
        maxVolume: args.maxVolume,
        estimated1rm: args.estimated1rm,
        updatedAt: Date.now(),
      });
    }
    // Only patch if the candidate is strictly better.
    const patch: Record<string, unknown> = {};
    if (
      args.maxWeightKg !== undefined &&
      args.maxWeightKg > (existing.maxWeightKg ?? -Infinity)
    ) {
      patch.maxWeightKg = args.maxWeightKg;
      if (args.bestSetId) patch.bestSetId = args.bestSetId;
    }
    if (
      args.maxReps !== undefined &&
      args.maxReps > (existing.maxReps ?? -Infinity)
    ) {
      patch.maxReps = args.maxReps;
    }
    if (
      args.maxVolume !== undefined &&
      args.maxVolume > (existing.maxVolume ?? -Infinity)
    ) {
      patch.maxVolume = args.maxVolume;
    }
    if (
      args.estimated1rm !== undefined &&
      args.estimated1rm > (existing.estimated1rm ?? -Infinity)
    ) {
      patch.estimated1rm = args.estimated1rm;
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = Date.now();
      await ctx.db.patch(existing._id, patch as any);
    }
    return existing._id;
  },
});
