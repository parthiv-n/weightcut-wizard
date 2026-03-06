# Production Audit — WeightCut Wizard

Living checklist of everything to resolve before App Store submission. Consolidated from infrastructure audit + code-level audit. Items marked **DONE** have been addressed.

---

## CRITICAL (ship-blockers)

- [ ] **`createAIAbortController` accepts no params but called with `30000` everywhere** — `src/lib/timeoutWrapper.ts:53`. Called at 8+ sites across Nutrition.tsx, WeightTracker.tsx, FightWeek.tsx. The timeout value is silently ignored — AI operations have zero timeout protection. **Fix:** Either make the function accept a timeout param and wire it up, or remove the phantom arguments from all call sites.

- [ ] **AIGeneratingOverlay completion animation never fires** — `src/components/AIGeneratingOverlay.tsx:88-100`. The `!isGenerating && isOpen` condition is never true because both props are always the same value (`isAiActive`). Users never see "Complete!" feedback. **Fix:** Decouple `isOpen` from `isGenerating` in callers (Nutrition.tsx, Hydration.tsx, etc.) so `isOpen` stays true briefly after `isGenerating` goes false.

- [DONE] **No privacy policy or terms of service links in-app** — Required for App Store. No links exist anywhere in the UI. **Fix:** Add links to Settings sheet/page and onboarding footer.

- [ ] **Payment infrastructure not implemented** — No Stripe integration, no subscription management, no webhooks. `is_premium` field exists in profiles but is never checked/enforced. **Need:** Stripe checkout, webhook edge function, subscription table, paywall UI, billing portal.

- [ ] **No rate limiting on edge functions** — Zero rate limiting on all 16 edge functions. A single user can spam Grok API calls and exhaust quota. **Need:** Per-user rate limits (e.g., Upstash or Deno KV) on all AI functions.

- [ ] **Wildcard CORS on all functions** — Currently `"*"` on all functions — allows any website to call APIs. **Need:** Dynamic CORS that allows production domain + localhost for dev.

---

## HIGH

- [DONE] **Race condition in `refreshProfile()`** — `src/contexts/UserContext.tsx:140-187`. No abort signal or staleness check. If called twice rapidly, the slower first call can overwrite the faster second call's result with stale data. **Fix:** Capture userId at call start, verify it hasn't changed before setting state.

- [DONE] **Missing `userId` dependency in Nutrition.tsx warmup useEffect** — `src/pages/Nutrition.tsx:517`. Effect uses `userId` in its body but omits it from the dependency array — stale closure. **Fix:** Add `userId` to the dependency array.

- [DONE] **Missing input validation in `fight-camp-coach` edge function** — `supabase/functions/fight-camp-coach/index.ts:49-94`. Extracts many payload fields with zero type/range validation. Bad client data produces garbage LLM prompts. **Fix:** Add validation for required fields and numeric ranges before building the prompt.

- [DONE] **Missing `finish_reason` check in `analyse-diet` edge function** — `supabase/functions/analyse-diet/index.ts:142`. If Grok truncates the response (`finish_reason: "length"`), `parseJSON` will silently fail with a generic error. No logging to detect this. **Fix:** Check `data.choices[0].finish_reason` after the Grok call and log a warning if `"length"`.

- [DONE] **Untyped Supabase casts in FightCampCalendar** — `src/pages/FightCampCalendar.tsx` (lines 97, 124, 218, 226, 263, 313). Multiple `(supabase as any)` casts for `fight_camp_calendar` table. **Fix:** Extend Supabase type definitions to include this table.

- [DONE] **Missing ARIA labels on interactive elements** — Many icon-only buttons (edit, delete, expand/collapse in nutrition, weight unit toggles, settings toggles) lack `aria-label`. Only ~26 ARIA labels across entire codebase. **Fix:** Audit all icon-only buttons and add descriptive aria-labels.

- [DONE] **Color contrast below WCAG AA** — `src/index.css`. `--muted-foreground: 220 15% 65%` on near-black background yields ~3.5:1 ratio (AA requires 4.5:1). Affects secondary text, chart labels, muted icons. **Fix:** Adjust to `220 15% 55%` or similar for ≥4.5:1 ratio.

- [DONE] **No offline indicator UI** — Network events are listened to and a sync queue exists, but users see no visual indication they're offline or that data is pending sync. **Fix:** Add a thin banner component that shows when `navigator.onLine` is false.

- [ ] **Massive single-file components** — `Nutrition.tsx` (3,878 lines), `WeightTracker.tsx` (1,414), `Hydration.tsx` (1,206), `performanceEngine.ts` (1,340), `FightCampCalendar.tsx` (758), `BottomNav.tsx` (632). **Need:** Decompose into focused sub-components (max 300-400 lines each).

- [ ] **Silent async errors** — `Dashboard.tsx`: `.catch(() => {})` swallows errors. Multiple pages: `if (!data) return;` without user feedback. `JSON.parse()` without try-catch in: `localCache.ts`, `aiPersistence.ts`, `syncQueue.ts`. **Need:** Error toasts/states on all async operations, wrap all JSON.parse.

- [ ] **Bundle size >2.5MB uncompressed JS** — `@huggingface/transformers`: 870 KB (used for barcode/ML, should lazy-load), `xlsx`: 429 KB. **Need:** Lazy-load transformers to barcode route only; replace/remove xlsx.

- [ ] **Input validation missing on most edge functions** — `rehydration-protocol`: no schema validation, `meal-planner`: no validation on prompt input. Most functions trust client data. **Need:** Zod schemas on all edge functions.

- [ ] **Sensitive data in localStorage** — Profile data (weight, age, sex, health metrics) cached unencrypted. AI cache contains meal descriptions, health data. Not cleared on logout. **Need:** Clear on logout, minimize PII caching, use Capacitor secure storage for iOS.

---

## MEDIUM

- [ ] **Missing NaN guard in FightWeek projections** — `src/pages/FightWeek.tsx:53-56`. `parseFloat("")` returns `NaN`. The `!cw` check works but is implicit and doesn't cover `0` values. **Fix:** Use explicit `isNaN()` checks.

- [ ] **Null dereference risk in RecoveryDashboard cooldown timer** — `src/components/fightcamp/RecoveryDashboard.tsx:269-271`. `rateLimitUntil` can be falsy, but `tick()` does arithmetic on it without a guard. **Fix:** Add `if (!rateLimitUntil) return` at top of `tick()`.

- [ ] **Event listener leak in ProfilePictureUpload** — `src/components/ProfilePictureUpload.tsx:17-19`. Image load/error listeners are never removed. **Fix:** Remove listeners in both resolve and reject paths.

- [ ] **Missing barcode format validation** — `supabase/functions/scan-barcode/index.ts:36`. Only checks if barcode is truthy — no length, digit, or format validation. **Fix:** Validate 8-18 digit string before API call.

- [ ] **`parseFloat(log.weight_kg)` without NaN check in Dashboard** — `src/pages/Dashboard.tsx:290`. If `weight_kg` is null/undefined, produces NaN in the chart. **Fix:** Default to 0 or skip entry.

- [ ] **No focus indicators for keyboard navigation** — No `focus-visible:ring` styles globally. Keyboard users can't see which element is focused. **Fix:** Add global `focus-visible` outline styles in `src/index.css`.

- [ ] **Missing empty states** — Nutrition page (0 meals), FightCamps page (0 camps), and Hydration page show blank content with no guidance for new users. **Fix:** Add empty state components with CTAs.

- [ ] **No app version display** — `package.json` version is "0.0.0", not shown anywhere in the UI. **Fix:** Set real version and display it in Settings.

- [ ] **Status bar styling doesn't match dark theme** — `index.html:11` has `content="default"`. On dark theme, white status bar is jarring. **Fix:** Change to `black-translucent`.

- [ ] **Inconsistent error status codes across edge functions** — Some return 404 for "not found", others return 500 for similar failures. Client must handle both. **Fix:** Standardize error response format and status codes.

- [ ] **Missing confirmation dialogs** — Goal updates (could break cut plan), nutrition target overrides, no "unsaved changes" warning on any form.

- [ ] **No React.memo anywhere** — Zero instances of `React.memo()` in entire codebase. Heavy components re-render on every parent update. **Need:** Memo on MealCard, chart components, RecoveryDashboard, AI overlays.

- [ ] **No pagination** — Nutrition meals could load thousands of records. Weight logs have no pagination. Fight camp calendar loads full month at once.

- [ ] **Source maps in production** — `vite.config.ts` doesn't disable sourcemaps for production builds. **Fix:** Add `build: { sourcemap: false }`.

- [ ] **No CI/CD pipeline** — No `.github/workflows/` found. Manual deployment only. **Need:** GitHub Actions for build, test, lint, deploy.

---

## LOW

- [ ] **Global `setInterval` in nutritionCache never cleared** — `src/lib/nutritionCache.ts:186-188`. Runs every 5 min with no cleanup mechanism. Harmless in browser but not clean. **Fix:** Export start/stop functions, call on login/logout.

- [ ] **Empty `cleanup()` in `createAIAbortController`** — `src/lib/timeoutWrapper.ts:58`. The returned cleanup function is a no-op. All callers invoke it in `finally` blocks for nothing. **Fix:** Remove the phantom cleanup or implement actual timeout cleanup.

- [ ] **Inconsistent haptic feedback** — Some interactions have haptics (BottomNav, Settings), others don't (meal delete, weight log, goal saves). **Fix:** Audit all user actions and apply consistent haptic patterns.

- [ ] **No pull-to-refresh gesture** — Manual refresh button exists but no native iOS pull-to-refresh. **Fix:** Implement using Capacitor plugin or library.

- [ ] **No scroll-to-top on active tab tap** — `scrollToTop()` exists in Nutrition.tsx but isn't wired to BottomNav. Standard iOS pattern. **Fix:** Wire BottomNav active-tab tap to scroll to top.

- [ ] **Very long meal names can overflow** — MealCard uses `truncate` but no `line-clamp`. Multi-word names may clip awkwardly. **Fix:** Use `line-clamp-2`.

- [ ] **No timezone awareness** — Dates use local `new Date().toISOString().split('T')[0]`. Crossing midnight or changing timezone can cause date misalignment. **Fix:** Store timezone in profile, use consistently.

- [ ] **Crash recovery UI is too technical** — ErrorBoundary shows raw error details. **Fix:** Show user-friendly copy with "Try Again" and "Contact Support" options; hide tech details behind a `<details>` toggle.

- [ ] **Token refresh race condition** — `UserContext.tsx`: Multiple concurrent requests can trigger simultaneous `refreshSession()` calls. **Need:** Refresh lock/mutex.

- [ ] **ESLint config too permissive** — `@typescript-eslint/no-unused-vars: "off"` — dead code not flagged. 10+ `eslint-disable` comments scattered through components.

- [ ] **Dependency updates** — 29 packages outdated (React 18→19, supabase-js 2.85→2.98, etc.). Image asset `wizard-logo.png` (432 KB) should be SVG/WebP.

- [ ] **Incomplete features** — Onboarding missing welcome screen; Goals has no progress tracking/milestones; Dashboard has no CTAs for inactive users; Hydration has no intake tracking vs plan; Fight Week has no day-by-day checklist.

- [ ] **API resilience** — No fallback if Grok API is down (11+ functions affected). No circuit breaker pattern, no retry with backoff. `food-search` has in-memory cache only (lost on function restart).

---

## DONE (resolved)

- [x] **Error monitoring** — Sentry integration added (client + edge functions).
- [x] **Testing setup** — vitest configured, critical path tests added.
- [x] **Security — auth on scan-barcode, transcribe-audio, food-search** — `supabase.auth.getUser()` checks added.
- [x] **Critical dependency vulnerability** — `xlsx` replaced/removed; `npm audit fix` run.
- [x] **Debug code removed** — `src/debug-meal-api.tsx` deleted; console.logs cleaned up.
- [x] **TypeScript strict mode** — `strict: true` enabled incrementally.
- [x] **Empty states** — Added to data-driven pages.
- [x] **Loading state consistency** — Skeleton loaders added for Nutrition, Goals, Hydration.

---

## COMPLIANCE CHECKLIST (Required for App Store / payments)

- [ ] Privacy policy published and linked in app
- [ ] Terms of service published and linked in app
- [ ] GDPR: Data export functionality
- [ ] GDPR: Account deletion functionality
- [ ] GDPR: Consent management
- [ ] PCI DSS: Use Stripe-hosted checkout (avoid handling card data)
- [ ] Refund policy defined
- [ ] Tax handling configured (Stripe Tax or manual)
- [ ] Cookie/tracking consent (if applicable)
- [ ] Incident response plan documented
