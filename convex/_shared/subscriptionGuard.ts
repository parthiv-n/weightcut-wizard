/**
 * Back-compat shim.
 *
 * The old gem-deduction gate (`enforceGemGate`) has been removed as part of
 * the gems-and-ads removal refactor. All AI features are now Pro-only and
 * gated via `enforceFeatureGate(ctx, userId, "<KEY>")` from
 * `./featureGates`.
 *
 * This module re-exports the new gate so any straggler imports from
 * `../_shared/subscriptionGuard` keep compiling while we sweep the
 * codebase. Prefer importing from `./featureGates` directly.
 */
export { enforceFeatureGate, FEATURE_GATES, type FeatureKey } from "./featureGates";
