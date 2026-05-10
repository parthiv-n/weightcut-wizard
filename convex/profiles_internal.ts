/**
 * Internal queries on the `profiles` table — callable from Convex actions via
 * `ctx.runQuery(internal.profiles_internal.*)`.
 *
 * Kept separate from `profiles.ts` because the surface there is user-scoped
 * via `requireUserId(ctx)`. Actions resolve the userId out-of-band (via
 * `internal.lib_auth.getMyUserId`) and then pass it explicitly.
 */
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const getByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const getDietaryPreferences = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("user_dietary_preferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});
