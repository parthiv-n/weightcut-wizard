# Remove Gems & Ads, Introduce Free/Pro Feature Gating

**Date:** 2026-05-17
**Status:** Approved (proceeding autonomously per user directive)

## Goal

Eliminate the gems currency and ads features entirely. Replace gem-based AI rate limiting with a clean **Free vs. Pro** tier model. Build a centralized, extensible feature gating system so toggling what's gated is a one-line change. Lay groundwork (schema + helpers) for a future free trial without implementing the trial flow yet.

## Non-Goals

- Implement the free trial UX. (Schema fields + `isInTrial` helper land now; activation flow is later.)
- Reprice or restructure the RevenueCat offerings.
- Remove RevenueCat, paywall, or subscription enforcement — those stay.
- Migrate existing user data (gems balances are discarded; nobody loses money).

## Current Architecture (relevant slice)

- `convex/_shared/subscriptionGuard.ts` — `enforceGemGate(ctx, userId)` deducts 1 gem before any AI call; short-circuits for premium.
- `convex/profiles.ts` — `deductGem`, `rewardAdGem`, `spendGem`, `grantDailyFreeGem` mutations; profile columns `gems`, `lastFreeGemDate`, `adsWatchedToday`, `adsWatchedDate`.
- 19 AI actions in `convex/actions/*.ts` each call `enforceGemGate` on first line.
- Client: `useGems`, `useSubscription`, `SubscriptionContext`, `NoGemsDialog`, `AIUsageIndicator`, `AILimitTimer`, `aiCallWrapper.callWithGemRecovery`.
- Ads: `src/lib/admob.ts` (AdMob native), `@capacitor-community/admob` npm dep; integrated via `useGems.watchAdForGem()`.

## Target Architecture

### 1. Feature Flag Registry (`src/lib/featureGates.ts` + `convex/_shared/featureGates.ts`)

Single source of truth for what's gated. Both client and server import from analogous modules (they must stay in sync — comment in each).

```ts
// Tier semantics (extensible later: "trial", "pro_plus", etc.)
export type Tier = "free" | "pro";

// Every gated capability gets a key
export const FEATURE_GATES = {
  // AI features (all pro-only post-refactor)
  AI_MEAL_ANALYSIS: { minTier: "pro" },
  AI_WIZARD_CHAT: { minTier: "pro" },
  AI_WORKOUT_GENERATOR: { minTier: "pro" },
  AI_MEAL_PLANNER: { minTier: "pro" },
  AI_RECOVERY_COACH: { minTier: "pro" },
  AI_FIGHT_CAMP_COACH: { minTier: "pro" },
  AI_HYDRATION_INSIGHTS: { minTier: "pro" },
  AI_TRAINING_INSIGHTS: { minTier: "pro" },
  AI_TRAINING_SUMMARY: { minTier: "pro" },
  AI_DAILY_WISDOM: { minTier: "pro" },
  AI_FIGHT_WEEK_ANALYSIS: { minTier: "pro" },
  AI_CUT_PLAN: { minTier: "pro" },
  AI_TECHNIQUE_CHAINS: { minTier: "pro" },
  AI_AUDIO_TRANSCRIBE: { minTier: "pro" },
  AI_REHYDRATION_PROTOCOL: { minTier: "pro" },
  AI_WEIGHT_ANALYSIS: { minTier: "pro" },
  AI_LOOKUP_INGREDIENT: { minTier: "pro" },
  AI_BARCODE_ANALYSIS: { minTier: "pro" },
  AI_DIET_ANALYSIS: { minTier: "pro" },
  // Future expansion examples (kept commented for now):
  // ADVANCED_LEADERBOARDS: { minTier: "pro" },
  // EXPORT_DATA: { minTier: "pro" },
} as const;

export type FeatureKey = keyof typeof FEATURE_GATES;
```

To gate a new feature: add a line. To free up a feature: change `minTier` to `"free"`. To introduce a `trial` tier later: add it to the `Tier` union and update the tier-comparison helper. No call-site changes needed.

### 2. Server-Side Gate (`convex/_shared/featureGates.ts`)

Replaces `enforceGemGate`. Read the profile, derive effective tier (counting trial as pro when active), throw a typed error otherwise.

```ts
export async function enforceFeatureGate(
  ctx, userId, featureKey: FeatureKey
): Promise<{ tier: Tier }> {
  const profile = await ctx.runQuery(internal.profiles.getByUserId, { userId });
  const tier = effectiveTier(profile); // "free" | "pro" (pro if subscribed OR in trial)
  const required = FEATURE_GATES[featureKey].minTier;
  if (!meetsTier(tier, required)) {
    throw new Error(`PRO_FEATURE_REQUIRED:${featureKey}`);
  }
  return { tier };
}
```

`effectiveTier(profile)` lives in `convex/_shared/tier.ts` and reads `subscriptionTier`, `subscriptionExpiresAt`, `trialEndsAt`. Returns `"pro"` if any of those grant access; otherwise `"free"`.

### 3. Client Hook (`src/hooks/useFeatureAccess.ts`)

```ts
export function useFeatureAccess(featureKey: FeatureKey) {
  const { tier } = useSubscription();
  const required = FEATURE_GATES[featureKey].minTier;
  const hasAccess = meetsTier(tier, required);
  return { hasAccess, requiredTier: required };
}
```

Components check `hasAccess` before invoking AI; when false, open the paywall.

### 4. AI Call Wrapper (`src/lib/aiCallWrapper.ts`)

Rename `callWithGemRecovery` → `callWithProRecovery`. New behavior on `PRO_FEATURE_REQUIRED:*` errors:
1. Pull `getCustomerInfo()` from RevenueCat SDK.
2. If `isPremiumFromCustomerInfo()` → call `activatePremium()` action to sync server tier → `refreshProfile()` → retry once.
3. If still failing → propagate; UI opens paywall via `useSubscription.handlePaywallError`.

Same self-healing pattern, different signal. `useAIAction` hook keeps its public API.

### 5. Schema Changes

**Remove from `convex/schema.ts` `profiles` table:**
- `gems`
- `lastFreeGemDate`
- `adsWatchedToday`
- `adsWatchedDate`

**Add to `convex/schema.ts` `profiles` table** (for future trial — populated only when trial is implemented; safe to be optional):
- `trialStartedAt: v.optional(v.number())`
- `trialEndsAt: v.optional(v.number())`

Convex schema validation will reject mutations writing the removed fields on next deploy, so all server code referencing them MUST be removed in the same release.

### 6. Files to Delete Outright

- `src/hooks/useGems.ts`
- `src/components/subscription/AIUsageIndicator.tsx`
- `src/components/subscription/AILimitTimer.tsx`
- `src/components/subscription/NoGemsDialog.tsx`
- `src/lib/admob.ts`
- Any iOS Capacitor AdMob-specific Info.plist entries (App Tracking Transparency strings stay only if other code uses them; otherwise remove).

**npm dependency removal:** `@capacitor-community/admob`.

### 7. Files to Rewrite / Heavily Edit

- `convex/_shared/subscriptionGuard.ts` → exports `enforceFeatureGate` only (delete `enforceGemGate`, `grantDailyFreeGem` callers).
- `convex/profiles.ts` → delete `deductGem`, `rewardAdGem`, `spendGem`, `grantDailyFreeGem`; keep all subscription mutations.
- All 19 `convex/actions/*.ts` files → replace `enforceGemGate(ctx, userId)` with `enforceFeatureGate(ctx, userId, "AI_<NAME>")`.
- `src/contexts/SubscriptionContext.tsx` → strip gems state, gems sync, `wcw_gems_*` localStorage, no-gems dialog state. Keep tier, expiresAt, isPremium, paywall state. Add `isInTrial` derived value (always false until trial ships).
- `src/hooks/useSubscription.ts` → replace `checkAIAccess` (was `isPremium || gems > 0`) with `checkFeatureAccess(featureKey)`. Replace `handleAILimitError` with `handlePaywallError` that opens the paywall (no more no-gems dialog).
- `src/lib/aiCallWrapper.ts` → renamed function, new error code.
- `src/hooks/useAIAction.ts` → wire to new wrapper, take optional `featureKey` for the upfront client check.

### 8. New File

- `src/components/subscription/UpgradeDialog.tsx` — replaces `NoGemsDialog`. Single CTA: "Upgrade to Pro" → `openPaywall()`. No "Watch Ad" path. Used when a free user hits a pro feature without the upfront check (rare; primary path is gating the entry button).

## Data Flow After Refactor

### Free user invokes AI feature
```
Click "Analyze Meal"
→ useFeatureAccess("AI_MEAL_ANALYSIS").hasAccess === false
→ openPaywall()
(Server never called; no token cost; no error round-trip)
```

### Free user bypasses client check (e.g., direct deeplink, race)
```
analyzeMeal action
→ enforceFeatureGate(ctx, userId, "AI_MEAL_ANALYSIS")
→ throw PRO_FEATURE_REQUIRED:AI_MEAL_ANALYSIS
→ callWithProRecovery catches → checks RC SDK
→ if not entitled → propagate → UI opens paywall
```

### Pro user invokes AI feature
```
Click "Analyze Meal"
→ useFeatureAccess returns { hasAccess: true }
→ useAIAction call proceeds
→ enforceFeatureGate passes (tier === "pro")
→ Groq call → result
(No gem deduction, no event dispatch, no localStorage)
```

## Migration / Rollout

This is destructive — no compat shim, since:
- No user data depends on `gems` columns (the balance is ephemeral).
- Removing ads has no upstream effect.
- All AI features become pro-only, which **does** reduce free-tier capability. The user accepts this trade as part of the simplified model.

**Deploy order matters:**
1. Schema change (remove gem columns, add trial columns) MUST land with all server code that referenced them, or Convex will reject mutations.
2. Client deploy can follow; client never writes gem columns post-refactor.
3. Both should be a single PR / single deploy window.

**Convex schema removal note:** Removing optional fields is non-breaking for reads (Convex tolerates extra fields on existing documents until they're rewritten). The `gems`/`adsWatched*`/`lastFreeGemDate` columns will simply be ignored. We do NOT need a data backfill or migration script. New `trialStartedAt`/`trialEndsAt` are added as `v.optional` so existing rows pass validation.

## Verification Plan

- `npm run build` passes (TypeScript happy with no stale imports of `useGems`, `AIUsageIndicator`, etc.).
- `npm run lint` passes.
- Manual smoke (cannot run in agent context — flag to user):
  - Free user → click any AI feature → paywall opens.
  - Pro user → click any AI feature → action runs.
  - Settings/profile page renders (no gem badge, no ad-related rows).
- Grep verification (must return zero matches in `src/` and `convex/` after refactor):
  - `gems`, `gem-consumed`, `wcw_gems`, `Gem `, `AdMob`, `admob`, `rewardAdGem`, `NoGemsDialog`, `AIUsageIndicator`, `AILimitTimer`, `useGems`, `enforceGemGate`, `callWithGemRecovery`, `INSUFFICIENT_GEMS`, `watchAdForGem`, `showRewardedAd`, `@capacitor-community/admob`.
  - Exception: `docs/` and `package-lock.json` may still mention them post-prune; lockfile gets regenerated on `npm install`.

## Out of Scope (Tracked Separately)

- Free trial activation flow (eligibility check, "Start 7-day trial" CTA, trial-ending notification).
- Webhook handling of trial state from RevenueCat (most trial signaling is via product entitlements + RC's `period_type === "trial"`; needs separate spec).
- Reducing free tier further (e.g., gating non-AI features).
