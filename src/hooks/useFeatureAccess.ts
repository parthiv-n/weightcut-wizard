import { useSubscription } from "@/hooks/useSubscription";
import {
  FEATURE_GATES,
  meetsTier,
  type FeatureKey,
  type Tier,
} from "@/lib/featureGates";

/**
 * Reactive client-side gate check for a single feature.
 *
 * Components should branch on `hasAccess` to decide whether to invoke the
 * AI action directly or open the paywall. The server enforces the same
 * gate via `enforceFeatureGate`, so a bypass attempt still fails — this
 * hook just keeps the UX one-tap-to-upgrade.
 */
export function useFeatureAccess(featureKey: FeatureKey): {
  hasAccess: boolean;
  requiredTier: Tier;
} {
  const { tier } = useSubscription();
  const requiredTier = FEATURE_GATES[featureKey].minTier;
  const hasAccess = meetsTier(tier, requiredTier);
  return { hasAccess, requiredTier };
}
