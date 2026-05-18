/**
 * On-`PRO_FEATURE_REQUIRED:*` self-heal for AI actions.
 *
 * The problem this solves
 * -----------------------
 * The Convex `enforceFeatureGate` helper short-circuits pro users before
 * running any AI logic. That check reads `profile.subscriptionTier`,
 * `profile.subscriptionExpiresAt`, and (later) `profile.trialEndsAt` from
 * the database. If those values are stale relative to the user's real
 * RevenueCat entitlement (delayed webhook, expired optimistic grant, new
 * device that hasn't synced yet, cross-`users._id` because the user signed
 * in fresh on a new deployment, etc.) the gate incorrectly throws
 * `PRO_FEATURE_REQUIRED:<FEATURE>` even though the user IS a paying pro
 * customer.
 *
 * Recovery sequence on `PRO_FEATURE_REQUIRED:*`:
 *   1. Read `customerInfo` from the RC SDK — this is the device-local
 *      source of truth (cryptographically backed by StoreKit on iOS).
 *   2. If RC confirms the user IS pro, call `api.actions.activatePremium`
 *      so Convex updates the profile's `subscriptionTier`/`expiresAt` to
 *      match the real RC entitlement window.
 *   3. Retry the original AI action exactly once.
 *
 * If RC also says the user is not entitled, the original error propagates
 * untouched so `useSubscription.handlePaywallError` can open the paywall.
 *
 * WHY THIS LIVES HERE (and must not be removed)
 * ---------------------------------------------
 * Without this wrapper, the only paths that move a stale Convex profile to
 * pro are the RC webhook (server-to-server, can be minutes late or miss
 * entirely) and the SubscriptionContext cold-start sync (fires once per app
 * launch). Mid-session users whose entitlement window expires or whose
 * profile drifts have NO recovery path — they'd hit `PRO_FEATURE_REQUIRED`
 * on every AI feature until they fully restart the app or hit Settings →
 * Restore. This wrapper turns that pothole into a single-call self-heal.
 */
import { Capacitor } from "@capacitor/core";
import { logger } from "@/lib/logger";
import {
  getCustomerInfo,
  isPremiumFromCustomerInfo,
} from "@/lib/purchases";
import { PRO_REQUIRED_PREFIX } from "@/lib/featureGates";

function isProRequiredError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(PRO_REQUIRED_PREFIX);
}

export interface CallWithProRecoveryDeps {
  /** The `useAction(api.actions.activatePremium.run)` reference. The action
   *  takes no client-trusted args — it derives `userId` from the Convex
   *  auth context and verifies entitlement against RC's REST API
   *  server-side. Calling it cannot grant pro unless RC confirms a real
   *  paid entitlement. */
  activatePremium: () => Promise<unknown>;
}

export interface CallWithProRecoveryOptions {
  /** Optional callback fired after a successful self-heal so the caller can
   *  refresh derived state (e.g. `refreshProfile()` to pull the updated tier
   *  into the reactive profile query). */
  onRecovered?: () => void | Promise<void>;
}

type ActionFn<Args, R> = (args: Args) => Promise<R>;

/**
 * Wraps a Convex AI action call with `PRO_FEATURE_REQUIRED:*` self-healing.
 * Generic over the underlying action's args/return so it slots into any
 * gated action without losing type safety.
 *
 * Note: the underlying `fn` is invoked twice in the recovery path (first
 * attempt, then once after RC re-sync). Idempotency-sensitive callers
 * should be aware — but every gated action throws BEFORE any LLM call when
 * the gate fails, so no billing leak.
 */
export async function callWithProRecovery<Args, R>(
  fn: ActionFn<Args, R>,
  args: Args,
  deps: CallWithProRecoveryDeps,
  opts: CallWithProRecoveryOptions = {},
): Promise<R> {
  try {
    return await fn(args);
  } catch (err) {
    if (!isProRequiredError(err)) throw err;
    if (!Capacitor.isNativePlatform()) {
      // RC SDK isn't loaded on the web build. We can't self-heal from
      // customerInfo there — let the original error propagate so the
      // paywall opens.
      throw err;
    }

    logger.warn("AI call hit PRO_FEATURE_REQUIRED — attempting self-heal from RC SDK");
    const info = await getCustomerInfo().catch(() => null);
    if (!info || !isPremiumFromCustomerInfo(info)) {
      // RC also says not-entitled — the user genuinely needs to upgrade.
      throw err;
    }

    // `activatePremium` is the server-verified RC REST action — it ignores
    // any client claims and looks up entitlement from RC by the user's
    // Convex auth identity.
    try {
      await deps.activatePremium();
      logger.info("AI call self-heal: activatePremium succeeded");
    } catch (activateErr) {
      logger.warn("AI call self-heal: activatePremium threw — retrying anyway", {
        error: activateErr instanceof Error ? activateErr.message : String(activateErr),
      });
    }

    if (opts.onRecovered) {
      try {
        await opts.onRecovered();
      } catch {
        /* best-effort — don't block retry on a refresh hiccup */
      }
    }

    // Single retry. If this fails too, propagate (no infinite loop).
    return await fn(args);
  }
}
