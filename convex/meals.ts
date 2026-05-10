/**
 * Meal queries + mutations.
 *
 * Compound write `createMealWithItems` replaces the Postgres RPC
 * `create_meal_with_items` — both rows are inserted in a single Convex
 * mutation (transactional by default), so no rollback dance is needed.
 *
 * `listWithTotals` reproduces the `meals_with_totals` Postgres view by
 * summing each meal's items in-query. The total payload is bounded (≤100
 * meals × ≤20 items each) so this is fine to compute on read.
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import type { Doc, Id } from "./_generated/dataModel";

function mealToClient(
  meal: Doc<"meals">,
  items: Doc<"meal_items">[],
) {
  const totals = items.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      protein_g: acc.protein_g + i.proteinG,
      carbs_g: acc.carbs_g + i.carbsG,
      fats_g: acc.fats_g + i.fatsG,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0 },
  );
  return {
    id: meal._id,
    user_id: meal.userId,
    date: meal.date,
    meal_type: meal.mealType,
    meal_name: meal.mealName,
    is_ai_generated: meal.isAiGenerated,
    notes: meal.notes,
    total_calories: Math.round(totals.calories),
    total_protein_g: totals.protein_g,
    total_carbs_g: totals.carbs_g,
    total_fats_g: totals.fats_g,
    calories: Math.round(totals.calories),
    protein_g: totals.protein_g,
    carbs_g: totals.carbs_g,
    fats_g: totals.fats_g,
    item_count: items.length,
    created_at: meal._creationTime,
  };
}

function itemToClient(row: Doc<"meal_items">) {
  return {
    id: row._id,
    meal_id: row.mealId,
    food_id: row.foodId,
    name: row.name,
    position: row.position,
    grams: row.grams,
    calories: row.calories,
    protein_g: row.proteinG,
    carbs_g: row.carbsG,
    fats_g: row.fatsG,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────

export const listForUserByDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const meals = await ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", date),
      )
      .order("asc")
      .collect();
    return meals;
  },
});

/** The big one — replaces `meals_with_totals` view. Returns each meal
 *  with its items inlined and aggregated totals computed in-line. */
export const listWithTotals = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const userId = await requireUserId(ctx);
    const meals = await ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", date),
      )
      .order("asc")
      .collect();
    const result = [];
    for (const m of meals) {
      const items = await ctx.db
        .query("meal_items")
        .withIndex("by_meal", (q) => q.eq("mealId", m._id))
        .collect();
      result.push({
        ...mealToClient(m, items),
        items: items
          .sort((a, b) => a.position - b.position)
          .map(itemToClient),
      });
    }
    return result;
  },
});

export const getById = query({
  args: { id: v.id("meals") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const meal = await ctx.db.get(id);
    if (!meal) return null;
    if (meal.userId !== userId) throw new Error("Not authorized");
    const items = await ctx.db
      .query("meal_items")
      .withIndex("by_meal", (q) => q.eq("mealId", id))
      .collect();
    return {
      ...mealToClient(meal, items),
      items: items
        .sort((a, b) => a.position - b.position)
        .map(itemToClient),
    };
  },
});

// ───────────────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────────────

const itemValidator = v.object({
  name: v.string(),
  foodId: v.optional(v.id("foods")),
  grams: v.number(),
  calories: v.number(),
  proteinG: v.number(),
  carbsG: v.number(),
  fatsG: v.number(),
});

export const createMealWithItems = mutation({
  args: {
    date: v.string(),
    mealType: v.string(),
    mealName: v.string(),
    isAiGenerated: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    items: v.array(itemValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const mealId: Id<"meals"> = await ctx.db.insert("meals", {
      userId,
      date: args.date,
      mealType: args.mealType,
      mealName: args.mealName,
      isAiGenerated: args.isAiGenerated ?? false,
      notes: args.notes,
    });
    let i = 0;
    for (const item of args.items) {
      await ctx.db.insert("meal_items", {
        mealId,
        foodId: item.foodId,
        name: item.name,
        position: i,
        grams: item.grams,
        calories: item.calories,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatsG: item.fatsG,
      });
      i += 1;
    }
    return mealId;
  },
});

export const updateMeal = mutation({
  args: {
    id: v.id("meals"),
    mealType: v.optional(v.string()),
    mealName: v.optional(v.string()),
    notes: v.optional(v.string()),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const userId = await requireUserId(ctx);
    const meal = await ctx.db.get(id);
    if (!meal) throw new Error("Meal not found");
    if (meal.userId !== userId) throw new Error("Not authorized");
    const clean: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) clean[k] = val;
    }
    await ctx.db.patch(id, clean as any);
  },
});

export const deleteMeal = mutation({
  args: { id: v.id("meals") },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const meal = await ctx.db.get(id);
    if (!meal) return;
    if (meal.userId !== userId) throw new Error("Not authorized");
    // Cascade — delete child items first.
    const items = await ctx.db
      .query("meal_items")
      .withIndex("by_meal", (q) => q.eq("mealId", id))
      .collect();
    for (const it of items) {
      await ctx.db.delete(it._id);
    }
    await ctx.db.delete(id);
  },
});
