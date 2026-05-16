/**
 * Exercises (gym lift library).
 *
 * The `exercises` table holds both global rows (userId undefined) and
 * user-custom rows. `listForUser` returns the union.
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import type { Doc } from "./_generated/dataModel";

function toClient(row: Doc<"exercises">) {
  return {
    id: row._id,
    user_id: row.userId ?? null,
    name: row.name,
    category: row.category,
    muscle_group: row.muscleGroup,
    equipment: row.equipment,
    is_custom: row.isCustom,
    is_bodyweight: row.isBodyweight,
    created_at: new Date(row._creationTime).toISOString(),
  };
}

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    // Two indexed reads — built-ins (userId === undefined) and the user's
    // own custom rows. Avoids a full-table scan as the catalog grows.
    const [builtIns, custom] = await Promise.all([
      ctx.db
        .query("exercises")
        .withIndex("by_user", (q) => q.eq("userId", undefined))
        .collect(),
      ctx.db
        .query("exercises")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    return [...builtIns, ...custom].map(toClient);
  },
});

export const createCustom = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    muscleGroup: v.string(),
    equipment: v.optional(v.string()),
    isBodyweight: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("exercises", {
      userId,
      name: args.name,
      category: args.category,
      muscleGroup: args.muscleGroup,
      equipment: args.equipment,
      isCustom: true,
      isBodyweight: args.isBodyweight ?? false,
    });
  },
});

export const deleteCustom = mutation({
  args: { id: v.id("exercises") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) return;
    if (row.userId !== userId) throw new Error("Not authorized");
    await ctx.db.delete(id);
  },
});
