/**
 * Auth helper for Convex queries / mutations.
 *
 * Every authenticated function should call `requireUserId(ctx)` at the top
 * to (a) reject anonymous calls and (b) get a strongly-typed `Id<"users">`
 * to scope subsequent reads/writes by. This replaces Supabase RLS — Convex
 * has no row-level security so authorization is the function's responsibility.
 *
 * Pattern:
 *   const userId = await requireUserId(ctx);
 *   const rows = await ctx.db.query("weight_logs")
 *     .withIndex("by_user_date", q => q.eq("userId", userId))
 *     .collect();
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function requireUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

/** Same as requireUserId but returns null instead of throwing. Use for
 *  queries that should return an empty result when unauthenticated rather
 *  than erroring (e.g. background prefetches during sign-out). */
export async function optionalUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx);
}

/**
 * Internal query for Phase 4 actions to resolve the calling user's id.
 * Actions can't read `ctx.db` directly; this exposes the auth lookup as a
 * runQuery target so the action layer can authorise itself.
 */
export const getMyUserId = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
  },
});
