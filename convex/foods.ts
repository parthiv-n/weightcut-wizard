/**
 * Food catalogue queries + mutations.
 *
 * - `searchByName` uses the .searchIndex declared in schema.ts (replaces
 *   the Postgres pg_trgm GIN index).
 * - `getByBarcode` is a single-row lookup keyed by the unique barcode.
 * - `upsertFood` is called server-side (from Phase-4 edge functions) to
 *   memoize OpenFoodFacts / USDA results into the `foods` table so the next
 *   barcode/text-search hit doesn't re-fetch externally.
 */
import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireUserId, optionalUserId } from "./lib/auth";
import type { Doc } from "./_generated/dataModel";

function toClient(row: Doc<"foods">) {
  return {
    id: row._id,
    name: row.name,
    brand: row.brand,
    barcode: row.barcode,
    source: row.source,
    source_ref: row.sourceRef,
    verified: row.verified,
    created_by: row.createdBy,
    default_serving_g: row.defaultServingG,
    calories_per_100g: row.caloriesPer100g,
    protein_per_100g: row.proteinPer100g,
    carbs_per_100g: row.carbsPer100g,
    fats_per_100g: row.fatsPer100g,
    created_at: row._creationTime,
  };
}

export const searchByName = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    verifiedOnly: v.optional(v.boolean()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { query: q, limit, verifiedOnly, source }) => {
    // Allow anon access for the food search dialog — non-PII reference data.
    await optionalUserId(ctx);
    if (!q || q.trim().length === 0) return [];
    let chain = ctx.db
      .query("foods")
      .withSearchIndex("search_name", (s) => {
        let b = s.search("name", q);
        if (verifiedOnly !== undefined) {
          b = b.eq("verified", verifiedOnly);
        }
        if (source !== undefined) {
          b = b.eq("source", source);
        }
        return b;
      });
    const rows = await chain.take(limit ?? 20);
    return rows.map(toClient);
  },
});

export const getByBarcode = query({
  args: { barcode: v.string() },
  handler: async (ctx, { barcode }) => {
    await optionalUserId(ctx);
    const row = await ctx.db
      .query("foods")
      .withIndex("by_barcode", (q) => q.eq("barcode", barcode))
      .first();
    return row ? toClient(row) : null;
  },
});

export const getById = query({
  args: { id: v.id("foods") },
  handler: async (ctx, { id }) => {
    await optionalUserId(ctx);
    const row = await ctx.db.get(id);
    return row ? toClient(row) : null;
  },
});

/** Create a user-custom food (source = 'user'). Authenticated. */
export const createCustom = mutation({
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    defaultServingG: v.optional(v.number()),
    caloriesPer100g: v.number(),
    proteinPer100g: v.number(),
    carbsPer100g: v.number(),
    fatsPer100g: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("foods", {
      name: args.name,
      brand: args.brand,
      source: "user",
      verified: false,
      createdBy: userId,
      defaultServingG: args.defaultServingG,
      caloriesPer100g: args.caloriesPer100g,
      proteinPer100g: args.proteinPer100g,
      carbsPer100g: args.carbsPer100g,
      fatsPer100g: args.fatsPer100g,
    });
  },
});

/** Server-side upsert, called from Phase-4 actions that fetch from
 *  external food databases (USDA, OpenFoodFacts). Dedupes by
 *  (source, sourceRef) — the natural key in those APIs. */
export const upsertFood = internalMutation({
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    barcode: v.optional(v.string()),
    source: v.string(),
    sourceRef: v.optional(v.string()),
    verified: v.boolean(),
    defaultServingG: v.optional(v.number()),
    caloriesPer100g: v.number(),
    proteinPer100g: v.number(),
    carbsPer100g: v.number(),
    fatsPer100g: v.number(),
  },
  handler: async (ctx, args) => {
    return await upsertFoodImpl(ctx, args);
  },
});

// Shared upsert implementation reused by single + batch variants below.
async function upsertFoodImpl(
  ctx: any,
  args: {
    name: string;
    brand?: string;
    barcode?: string;
    source: string;
    sourceRef?: string;
    verified: boolean;
    defaultServingG?: number;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatsPer100g: number;
  },
) {
  // Prefer (source, sourceRef) dedupe; fall back to barcode.
  let existing = null;
  if (args.sourceRef) {
    existing = await ctx.db
      .query("foods")
      .withIndex("by_source_ref", (q: any) =>
        q.eq("source", args.source).eq("sourceRef", args.sourceRef),
      )
      .first();
  }
  if (!existing && args.barcode) {
    existing = await ctx.db
      .query("foods")
      .withIndex("by_barcode", (q: any) => q.eq("barcode", args.barcode))
      .first();
  }
  if (existing) {
    await ctx.db.patch(existing._id, {
      name: args.name,
      brand: args.brand,
      caloriesPer100g: args.caloriesPer100g,
      proteinPer100g: args.proteinPer100g,
      carbsPer100g: args.carbsPer100g,
      fatsPer100g: args.fatsPer100g,
      defaultServingG: args.defaultServingG,
      verified: args.verified,
    });
    return existing._id;
  }
  return await ctx.db.insert("foods", args);
}

/** Alias matching the Phase-4B contract — same behaviour as `upsertFood`,
 *  named to distinguish "from external API" callers from any potential
 *  user-driven upserts. */
export const upsertFromExternal = internalMutation({
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    barcode: v.optional(v.string()),
    source: v.string(),
    sourceRef: v.optional(v.string()),
    verified: v.boolean(),
    defaultServingG: v.optional(v.number()),
    caloriesPer100g: v.number(),
    proteinPer100g: v.number(),
    carbsPer100g: v.number(),
    fatsPer100g: v.number(),
  },
  handler: async (ctx, args) => {
    return await upsertFoodImpl(ctx, args);
  },
});

/** Batch variant — used by food-search to upsert ~25 USDA rows in a single
 *  mutation. Returns the resulting food ids in input order so the caller can
 *  attach catalog ids to the response payload. */
export const upsertManyFromExternal = internalMutation({
  args: {
    rows: v.array(
      v.object({
        name: v.string(),
        brand: v.optional(v.string()),
        barcode: v.optional(v.string()),
        source: v.string(),
        sourceRef: v.optional(v.string()),
        verified: v.boolean(),
        defaultServingG: v.optional(v.number()),
        caloriesPer100g: v.number(),
        proteinPer100g: v.number(),
        carbsPer100g: v.number(),
        fatsPer100g: v.number(),
      }),
    ),
  },
  handler: async (ctx, { rows }) => {
    const ids: string[] = [];
    for (const row of rows) {
      const id = await upsertFoodImpl(ctx, row);
      ids.push(id);
    }
    return ids;
  },
});
