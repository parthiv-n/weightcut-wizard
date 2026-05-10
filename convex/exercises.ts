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
    created_at: row._creationTime,
  };
}

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    // Built-ins: userId === undefined. Note we can't filter `eq("userId", undefined)`
    // on the by_user index in a strict-typed way — fall back to a full scan, then
    // partition. The table is small (≤ a few hundred rows) so this is fine.
    const all = await ctx.db.query("exercises").collect();
    return all
      .filter((e) => e.userId === undefined || e.userId === userId)
      .map(toClient);
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
