"use node";

/**
 * Activate-premium — formerly a thin client-callable wrapper that simply
 * forwarded the user's claimed tier/expiry to `profiles.activatePremium`.
 * That surface let any authenticated client forge a premium grant, so the
 * direct path is now BLOCKED.
 *
 * Legitimate post-purchase flows must go through the RevenueCat webhook
 * (`http.ts` → `internal.profiles.updateSubscriptionFromRevenueCat`), which
 * is verified by RevenueCat's shared-secret header and is the only path
 * authorised to mutate subscription state.
 *
 * The action is kept callable so existing client code (`useAction(api
 * .actions.activatePremium.run)`) compiles, but it throws unconditionally
 * with a clear message. Callers must remove the call and rely on the
 * webhook + reactive `getMine` subscription to surface the updated tier.
 *
 * TODO(receipt-validation): once the Apple StoreKit receipt-validation
 * helper lands, this action can be re-enabled to:
 *   1. Validate the StoreKit receipt against Apple's server.
 *   2. Map verified `productId` → tier + expiry.
 *   3. Call `internal.profiles.activatePremium` with the validated values.
 */
import { v } from "convex/values";
import { action } from "../_generated/server";

export const run = action({
  args: {
    tier: v.string(),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (_ctx, _args): Promise<unknown> => {
    // TODO: replace with receipt validation that calls
    // internal.profiles.activatePremium after verifying the Apple/RevenueCat
    // receipt server-side.
    throw new Error("Not authorized");
  },
});
