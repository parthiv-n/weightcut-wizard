/**
 * Tier semantics for the post-gems pricing model.
 *
 * Only two tiers exist for now:
 *   - "free": default. Cannot invoke pro-gated features.
 *   - "pro":  paid subscription (monthly/annual/lifetime) OR an active free
 *             trial. Trial state is read off the `trialEndsAt` profile
 *             column which is populated when (if) the trial flow ships.
 *
 * `effectiveTier(profile)` is the single source of truth. Every code path
 * that needs to know "is this user pro?" funnels through here so adding a
 * third tier (e.g. "pro_plus") is a one-place change.
 *
 * Keep this file in lockstep with the analogous client-side helpers (see
 * `src/lib/featureGates.ts`). The server is the authority, but the client
 * should arrive at the same answer or the upfront gating UX is wrong.
 */

import type { Doc } from "../_generated/dataModel";

export type Tier = "free" | "pro";

/**
 * Profile shape this helper depends on. Accepts any object exposing the
 * subscription / trial columns we care about — typed loosely so callers can
 * pass a partial projection without satisfying every `Doc<"profiles">`
 * field. `null` returns `"free"` so callers don't have to short-circuit.
 */
export type TierProfileShape = Pick<
  Doc<"profiles">,
  "subscriptionTier" | "subscriptionExpiresAt"
> & {
  trialEndsAt?: number | null;
};

/** Returns `"pro"` if the user has an active paid subscription OR an active
 *  trial; otherwise `"free"`. */
export function effectiveTier(
  profile: TierProfileShape | null | undefined,
  nowMs: number = Date.now(),
): Tier {
  if (!profile) return "free";

  const tier = profile.subscriptionTier;
  const expiresAt = profile.subscriptionExpiresAt;
  const hasPaidEntitlement =
    typeof tier === "string" &&
    tier.length > 0 &&
    tier !== "free" &&
    (!expiresAt || expiresAt > nowMs);
  if (hasPaidEntitlement) return "pro";

  const trialEndsAt = profile.trialEndsAt;
  if (typeof trialEndsAt === "number" && trialEndsAt > nowMs) return "pro";

  return "free";
}

/**
 * True iff `actual` satisfies the `required` tier.
 *
 * With only two tiers the rules are trivial:
 *   - required === "free": always true.
 *   - required === "pro":  true only if actual === "pro".
 *
 * Keeping this as an ordered comparison (rather than direct equality) means
 * adding a "pro_plus" later requires changing this function and nothing
 * else.
 */
export function meetsTier(actual: Tier, required: Tier): boolean {
  const rank: Record<Tier, number> = { free: 0, pro: 1 };
  return rank[actual] >= rank[required];
}
