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
  // Check premium short-circuit FIRST so paid users don't keep accruing
  // free gems they'll never use — accumulating a stockpile would also
  // leak across a downgrade if it ever happened. We pay the cost of one
  // extra query here in exchange for cleaner state.
  const profile = await ctx.runQuery(internal.profiles_internal.getByUserId, {
    userId,
  });
  const now = Date.now();
  const isPremium =
    !!profile &&
    !!profile.subscriptionTier &&
    profile.subscriptionTier !== "free" &&
    (!profile.subscriptionExpiresAt || profile.subscriptionExpiresAt > now);
  if (isPremium) {
    return { isPremium: true as const };
  }

  // Free tier — top up the daily gem before deducting. The grant is idempotent
  // for the calendar day AND capped (see `grantDailyFreeGem`), so this is a
  // safe lazy-refill on every AI call without any explosion risk.
  try {
    await ctx.runMutation(internal.profiles.grantDailyFreeGem, { userId });
  } catch {
    /* non-fatal — deduction below is still authoritative */
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
  return { isPremium: false as const };
}
