/**
 * Gem-gating helper for Convex actions.
 *
 * Premium users bypass. Free users have 1 gem deducted per AI call.
 * Throws `Error("INSUFFICIENT_GEMS")` when out of gems so the client can
 * surface the upsell paywall.
 *
 * The mutation `internal.profiles.deductGem` already errors with
 * "No gems available" when gems <= 0; we re-throw as a stable code.
 */

import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

export async function enforceGemGate(ctx: ActionCtx, userId: Id<"users">) {
  // Grant the daily free gem first (idempotent for the day) so a returning
  // user who logged in fresh today gets their free gem before deduction.
  try {
    await ctx.runMutation(internal.profiles.grantDailyFreeGem, { userId });
  } catch {
    /* non-fatal */
  }

  // Check premium short-circuit via the profile.
  const profile = await ctx.runQuery(internal.profiles_internal.getByUserId, {
    userId,
  });
  if (
    profile &&
    profile.subscriptionTier &&
    profile.subscriptionTier !== "free" &&
    (!profile.subscriptionExpiresAt || profile.subscriptionExpiresAt > Date.now())
  ) {
    return { isPremium: true };
  }

  try {
    await ctx.runMutation(internal.profiles.deductGem, { userId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("No gems") || msg.includes("Profile not found")) {
      throw new Error("INSUFFICIENT_GEMS");
    }
    throw e;
  }
  return { isPremium: false };
}
