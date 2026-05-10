/**
 * Meal plans + user dietary preferences.
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";

export const listPlans = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("meal_plans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const createPlan = mutation({
  args: {
    planName: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    dailyCalorieTarget: v.number(),
    dietaryPreferences: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("meal_plans", {
      userId,
      ...args,
      updatedAt: Date.now(),
    });
  },
});

export const updatePlan = mutation({
  args: {
    id: v.id("meal_plans"),
    planName: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    dailyCalorieTarget: v.optional(v.number()),
    dietaryPreferences: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...rest }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Plan not found");
    if (row.userId !== userId) throw new Error("Not authorized");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(id, patch as any);
  },
});

export const deletePlan = mutation({
  args: { id: v.id("meal_plans") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(id);
    if (!row) return;
    if (row.userId !== userId) throw new Error("Not authorized");
    await ctx.db.delete(id);
  },
});

// ───────────────────────────────────────────────────────────────────────
// user_dietary_preferences (1:1 with user)
// ───────────────────────────────────────────────────────────────────────

export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("user_dietary_preferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const upsertPreferences = mutation({
  args: {
    dietaryRestrictions: v.optional(v.array(v.string())),
    favoriteCuisines: v.optional(v.array(v.string())),
    dislikedFoods: v.optional(v.array(v.string())),
    mealPreferences: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("user_dietary_preferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      for (const [k, val] of Object.entries(args)) {
        if (val !== undefined) patch[k] = val;
      }
      await ctx.db.patch(existing._id, patch as any);
      return existing._id;
    }
    return await ctx.db.insert("user_dietary_preferences", {
      userId,
      ...args,
      updatedAt: Date.now(),
    });
  },
});
