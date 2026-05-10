"use node";

/**
 * Activate-premium — thin client-callable wrapper around the privileged
 * profile mutation. Mirrors the Supabase edge function's shape so the
 * RevenueCat sync path on the client can swap to `useAction` with no other
 * changes.
 *
 * The actual write is the `profiles.activatePremium` mutation (privileged,
 * not internal — authenticated callers may flip their own tier after a
 * successful Apple IAP). Webhook-driven updates use a separate internal
 * mutation that does not require auth context.
 */
import { v } from "convex/values";
import { action } from "../_generated/server";
import { api } from "../_generated/api";

export const run = action({
  args: {
    tier: v.string(),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { tier, expiresAt }): Promise<unknown> => {
    return await ctx.runMutation(api.profiles.activatePremium, {
      tier,
      expiresAt: expiresAt ?? undefined,
    });
  },
});
