# RevenueCat purchases-capacitor v5.67 → v12.3 — Migration Plan

> Generated 2026-05-18. Source of truth for the SDK upgrade rollout. Pair this with the audit report from the same date.

---

## The actual state of play

The RC dashboard warning ("5.67.0 → 12.3.0") describes **users in the wild on a shipped build**, not your source. Your source has already done the migration:

| Layer | Required for v12 | Current state |
|---|---|---|
| `@revenuecat/purchases-capacitor` | ≥12.0.3 | **12.3.1** |
| `@revenuecat/purchases-capacitor-ui` | match main SDK | **12.3.1** |
| `@capacitor/core` | ≥8 | **8.1.0** |
| `@capacitor/ios` | ≥8 | **8.1.0** |
| iOS deployment target | 15.0 | **15.0** |
| StoreKit | SK2 default | OK |
| `configure()` shape | v9+ `purchasesAreCompletedBy` / `storeKitVersion` | Code uses `{apiKey, appUserID}` (defaults are fine) |
| PaywallView | `RevenueCatUI.presentPaywall()` | Used in `src/components/subscription/PaywallOverlay.tsx` |
| Entitlement source of truth | Server-side | Convex `profile.subscription_tier` |

**The five-major-version minefield (Capacitor 5→8 lift, package rename, `observerMode`/`usesStoreKit2IfAvailable` removal, BillingClient 5→8, SK1→SK2) is already crossed.** You're not doing a migration; you're shipping a build that's been updated in source and stuck behind release cycles.

---

## What "safely update" actually means here

The risk is no longer code-level — it's release-management. Three things can still bite:

1. **In-App Purchase Key** not uploaded to RC dashboard → SK2 (v12 default) breaks silently
2. **Live users on old builds** keep using v5.67 until they update the app → enabling RC "Rules" paywalls now will show them the generic default paywall
3. **Anonymous-ID continuity** on the v5→v12 binary handoff for users mid-trial

---

## Phased plan

### Phase 0 — Pre-flight validation (1–2 hrs, local)

- [ ] `git pull && npm ci`
- [ ] Verify lockfile resolves to `@revenuecat/purchases-capacitor@12.3.1` (not `12.3.0` — the dashboard's stated minimum is met by 12.0.3+, you're well above)
- [ ] `cd ios/App && pod repo update && pod install` — confirm `PurchasesHybridCommon` ≥17.41.1 and `RevenueCat` 5.59–5.67.x land in `Podfile.lock`. Commit lockfile.
- [ ] `npx cap sync ios` — should be no-op after pod install; confirms native plugin registration
- [ ] In Xcode: confirm `IPHONEOS_DEPLOYMENT_TARGET = 15.0`, `SWIFT_VERSION ≥ 5.8`, Xcode 15.0+ (16+ if you want win-back testing)
- [ ] `npm run build && npm run lint` — must pass
- [ ] Open `src/lib/purchases.ts` and confirm:
  - `Purchases.configure({ apiKey, appUserID })` is the only configure call (no legacy `observerMode` or `usesStoreKit2IfAvailable` props)
  - `LOG_LEVEL` import still resolves
  - `RevenueCatUI` calls match the v12 surface (`presentPaywall`, `presentPaywallIfNeeded`, `presentCustomerCenter`)

### Phase 1 — RevenueCat dashboard prep (30 min, blocking)

These are one-time settings; miss them and Phase 2 will fail:

- [ ] **Upload In-App Purchase Key** (Apple → Users and Access → Keys → In-App Purchase). SK2 is the v9+ default and requires this key for server validation. Without it, restores and entitlement sync degrade silently.
- [ ] **Audit non-subscription products** (one-time IAPs, if any) → mark each consumable or non-consumable in the dashboard. v11 dropped the safety net here; misconfigured = restores silently drop.
- [ ] Confirm the entitlement identifier `"FightCamp Wizard Pro"` (exact string used in `purchases.ts`) still exists in the dashboard and is attached to your subscription products.
- [ ] **Do NOT enable Rules-based paywall components yet.** Wait until Phase 4.

### Phase 2 — TestFlight bake (2–3 days)

Cut a release branch, push to TestFlight, run these tests on a real device with a real sandbox Apple ID (not the simulator + `.storekit` file — sandbox renewal cadence differs):

- [ ] **Fresh install, anonymous user**: open paywall → `presentPaywall()` renders your custom paywall (not generic default). Confirm `Purchases.getOfferings()` returns the `current` offering.
- [ ] **Fresh install, logged-in user**: `Purchases.configure({apiKey, appUserID})` sets the stable Convex user ID. Verify in RC dashboard the customer object exists with that ID, not anon.
- [ ] **Purchase flow**: complete a sandbox purchase. Confirm:
  - `customerInfo.entitlements.active["FightCamp Wizard Pro"]` is populated
  - The `addCustomerInfoUpdateListener` in `SubscriptionContext.tsx` fires
  - `activatePremium` Convex action verifies server-side via `verifyEntitlement` (`/convex/lib/revenuecat.ts:74`)
  - `profile.subscription_tier` updates in Convex
  - UI flips to premium
- [ ] **Restore flow**: delete app → reinstall → log in as same Convex user → restore. Entitlement should re-attach via stable `appUserID`.
- [ ] **Mid-trial anonymous-ID continuity**: install v5.67 build (if you have a TestFlight artifact archived), start a trial, then install the v12 build over it. Verify the trial entitlement survives. If you don't have a v5.67 artifact, fall back to checking that `$RCAnonymousID:` survives in `NSUserDefaults` (key unchanged across majors).
- [ ] **Trial-eligibility branch**: `Purchases.getOfferings()` plus `checkTrialOrIntroductoryPriceEligibility` (if used) — confirm the eligibility-aware CTA copy in the dashboard paywall switches correctly.
- [ ] **Cancellation path**: cancel the subscription in sandbox Settings, wait for the (accelerated) expiry, verify `customerInfo.entitlements.active` clears and the listener triggers a `refreshProfile()` that flips the UI back to free.

### Phase 3 — Release to App Store (after Phase 2 passes)

- [ ] Bump version in `package.json`, `Info.plist`, and Xcode build number
- [ ] Submit to App Review with the standard sandbox account in the review notes (Apple needs to test IAP)
- [ ] **Do not** enable RC Rules-based paywalls yet — old-version users still need to render your existing paywall
- [ ] Monitor App Store Connect for release; once live, watch RC dashboard "Active SDK versions" — you want the v12 fraction to climb past ~70–80% before Phase 4

### Phase 4 — Enable Rules / Paywall v2 features (1–2 weeks after release)

Only after the v12 binary has propagated to the bulk of your install base:

- [ ] In RC dashboard, segment your paywall: a Rules-targeted variant for `SDK Version >= 11` (your new audience) and a fallback variant compatible with v5 (for stragglers). Don't skip the fallback or you'll burn the long tail of users who don't auto-update.
- [ ] Roll out the conversion-optimized paywall design from the earlier design pass
- [ ] (Optional) Add a soft force-update prompt for users on app versions tied to v5.67, to drain the stragglers

### Phase 5 — Post-release monitoring (ongoing)

Watch for 7 days:

- RC dashboard → **Failed events** — anything > baseline indicates SK2 receipt validation issues (usually missing IPK)
- RC dashboard → **Charts → SDK versions** — v12 share should climb steadily; if it stalls, you have an update-adoption problem
- Convex → `activatePremium` action error rate — should stay flat
- Crashlytics / Sentry — watch for `PurchasesError`, `StoreKitError`, anything from `purchases-capacitor` namespace

---

## Rollback plan (if Phase 2 finds something or Phase 3 ships breakage)

Rollback is non-trivial because the iOS deployment target bump is one-way for already-submitted builds. Realistic path:

1. **JS-only rollback** (preferred if the issue is in your code, not the SDK):
   - `git revert` the offending commit
   - Re-cut TestFlight, re-test
2. **Full SDK downgrade** (last resort):
   - `npm i @revenuecat/purchases-capacitor@5.67.0 @revenuecat/purchases-capacitor-ui@<matching>` — but no matching UI package existed at v5; you'd lose `RevenueCatUI` entirely and need to rebuild the paywall in custom React
   - Drop `IPHONEOS_DEPLOYMENT_TARGET` to 13.0 in Xcode + Podfile manually
   - `rm -rf ios/App/Pods ios/App/Podfile.lock && pod install`
   - Submit as a new build (you can't undo a released minimum-OS bump for already-submitted versions)
3. **No backend rollback needed** — entitlement state is server-side on RC + Convex, untouched by SDK version.

Archive the v5.67 build artifact and `Podfile.lock` in a `releases/v5.67` git tag now, so a rollback isn't a from-scratch reconstruction.

---

## Risks specific to this codebase

| Risk | Severity | Where to check |
|---|---|---|
| IPK not uploaded → SK2 server-side validation fails | **High** | RC dashboard → Project Settings → Apple |
| Convex `verifyEntitlement` calls hardcoded entitlement ID `"FightCamp Wizard Pro"` (with space) | Medium | `/convex/lib/revenuecat.ts:74-148` — confirm dashboard ID matches exactly, including the space and capitalization |
| Listener registered before user is logged in could attribute purchase to anon ID | Medium | `/src/contexts/SubscriptionContext.tsx:174-241` — `configure()` runs once with the resolved Convex user ID, but verify the order on first launch |
| `presentPaywall()` returns a `result` enum that v12 may have widened (`NOT_PRESENTED`, etc.) | Low | `/src/components/subscription/PaywallOverlay.tsx:158-170` — already handles four cases, confirm enum names match v12 |
| `Podfile.lock` not committed (audit found none) | Medium | Run `pod install` and commit the lockfile — otherwise CI builds and your local builds resolve different native deps |

---

## Reference — what the v5→v12 hops actually changed (for future-you)

| Hop | Biggest change |
|---|---|
| v5 → v6 | Package rename: `@capgo/capacitor-purchases` → `@revenuecat/purchases-capacitor`. Android Billing Client 5. |
| v6 → v7 | `ProrationMode` → `ReplacementMode`. `DEFERRED` mode removed. Android min SDK 19. InApp Messages support. |
| v7 → v8 | Capacitor 6 required. |
| v8 → v9 | **Big one.** iOS 13 minimum. StoreKit 2 default. `usesStoreKit2IfAvailable` → `storeKitVersion` enum. `observerMode` → `purchasesAreCompletedBy`. Android BillingClient 7. IPK required for SK2. |
| v9 → v10 | Capacitor 7 required. Native roll-ups. |
| v10 → v11 | Android BillingClient 8, min SDK 23. Consumed one-time purchases no longer restorable. Products must be classified consumable/non-consumable in dashboard. |
| v11 → v12 | Capacitor 8 required. Native roll-ups. iOS deployment target raised to 15. |

---

## RevenueCat "Rules" / fallback paywall context

- **Rules**: RC's conditional component visibility / targeting layer on Paywalls v2 (announced 2026-03-18).
- **Fallback trigger**: when a Rules-enabled paywall references components the installed SDK can't render, `RevenueCatUI` falls back to a **generic platform-native default paywall**. It's off-brand and conversion drops noticeably.
- **Minimum SDK for Capacitor**: **purchases-capacitor 12.0.3+**. New builds are safe.
- **Scope**: fires at runtime, per installed app, based on the SDK shipped in that binary. Users in the wild on the old binary keep seeing the default paywall until they update the app.

---

## Single-sentence verdict

This isn't a migration — it's a TestFlight bake of an already-completed upgrade plus an RC dashboard hygiene pass (IPK + product classification), followed by a normal App Store release; the only nuance is staggering the rollout so users on the old shipped build don't get hit with RC's default paywall.
