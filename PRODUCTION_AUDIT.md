# Production Audit — WeightCut Wizard

Living checklist of everything to resolve before App Store submission. Consolidated from infrastructure audit + code-level audit. Items marked **DONE** have been addressed.

---

## CRITICAL (ship-blockers)

- [ ] **No privacy policy or terms of service links in-app** — Links exist in `Auth.tsx:296` but point to `#privacy-policy` placeholder URLs with a TODO comment. Not valid for App Store review. **Fix:** Publish real policies and update the placeholder hrefs.

- [ ] **Payment infrastructure not implemented** — No Stripe integration, no subscription management, no webhooks. `is_premium` field exists in profiles but is never checked/enforced. **Need:** Stripe checkout, webhook edge function, subscription table, paywall UI, billing portal.

- [ ] **No global unhandled promise rejection handler** — No `window.addEventListener('unhandledrejection', ...)` in `main.tsx`. Async errors outside try/catch vanish silently, never reach Sentry. **Fix:** Add global handler in `main.tsx` that forwards to Sentry.

- [ ] **No rate limiting on edge functions** — Zero rate limiting on all 16 edge functions. A single user can spam Grok API calls and exhaust quota. **Need:** Per-user rate limits (e.g., Upstash or Deno KV) on all AI functions.

- [ ] **Wildcard CORS on all functions** — Currently `"*"` on all functions — allows any website to call APIs. **Need:** Dynamic CORS that allows production domain + localhost for dev.

---

## HIGH


- [ ] **Over-fetching with `select("*")` everywhere** — 15+ queries across `UserContext.tsx:149,254`, `FightCampDetail.tsx:57`, `useSkillTree.ts:63,81,90,112`, `DataResetDialog.tsx:46-49`, `batchOperations.ts:141,154,168`, `weight-tracker-analysis/index.ts:74`. Fetches all columns when only a few are needed. Wastes bandwidth and exposes unnecessary data. **Fix:** Replace with explicit column lists.

- [ ] **Silent async errors** — `Dashboard.tsx`: `.catch(() => {})` swallows errors. Multiple pages: `if (!data) return;` without user feedback. `JSON.parse()` without try-catch in: `localCache.ts`, `aiPersistence.ts`, `syncQueue.ts`. **Need:** Error toasts/states on all async operations, wrap all JSON.parse.

- [ ] **Bundle size >2.5MB uncompressed JS** — `@huggingface/transformers`: 870 KB (used for barcode/ML, should lazy-load), `xlsx`: 429 KB. **Need:** Lazy-load transformers to barcode route only; replace/remove xlsx.

- [ ] **Input validation missing on most edge functions** — `rehydration-protocol`: no schema validation, `meal-planner`: no validation on prompt input. Most functions trust client data. **Need:** Zod schemas on all edge functions.

---

## MEDIUM

- [ ] **Inconsistent error status codes across edge functions** — Some return 404 for "not found", others return 500 for similar failures. Client must handle both. **Fix:** Standardize error response format and status codes.

- [ ] **Missing confirmation dialogs** — Goal updates (could break cut plan), nutrition target overrides, no "unsaved changes" warning on any form.

- [ ] **No React.memo anywhere** — Zero instances of `React.memo()` in entire codebase. Heavy components re-render on every parent update. **Need:** Memo on MealCard, chart components, RecoveryDashboard, AI overlays.

- [ ] **No pagination** — Nutrition meals could load thousands of records. Weight logs have no pagination. Fight camp calendar loads full month at once.

- [ ] **No CI/CD pipeline** — No `.github/workflows/` found. Manual deployment only. **Need:** GitHub Actions for build, test, lint, deploy.

---

## LOW

- [ ] **Global `setInterval` in nutritionCache never cleared** — `src/lib/nutritionCache.ts:186-188`. Runs every 5 min with no cleanup mechanism. Harmless in browser but not clean. **Fix:** Export start/stop functions, call on login/logout.

- [ ] **Empty `cleanup()` in `createAIAbortController`** — `src/lib/timeoutWrapper.ts:58`. The returned cleanup function is a no-op. All callers invoke it in `finally` blocks for nothing. Phantom `30000` args have been removed, but the no-op cleanup remains. **Fix:** Remove the phantom cleanup or implement actual timeout cleanup.

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

## PERFORMANCE OPTIMIZATIONS

### Bundle Size
- [ ] **Lazy-load `@huggingface/transformers` (870 KB)** — Currently in `package.json` deps but only used via dynamic `import()` in `VoiceInput.tsx:40,55`. Verify it's not in the main chunk via bundle analysis. If it is, move to a code-split chunk.
- [ ] **Convert PNG assets to WebP** — `wizard-hero.png`, `wizard-thinking.png`, `wizard-logo.png`, `wizard-nutrition.png` in `src/assets/`. Use WebP with PNG fallback. Add responsive 1x/2x/3x variants for retina.
- [ ] **Run bundle analyzer** — Add `rollup-plugin-visualizer` to vite config to identify other large chunks. Target <1.5MB compressed for initial load.

### Rendering
- [ ] **Add `React.memo` to mapped components** — MealCard, SessionCard, any component rendered inside `.map()`. Zero `React.memo` usage currently.
- [ ] **Add `useCallback` to handlers passed as props** — Nutrition page handlers (`onEdit`, `onDelete`, dialog toggles) are recreated every render, causing child re-renders. 72 useCallback instances exist elsewhere but key pages like Nutrition are missing them.
- [ ] **Split UserContext consumers** — `useUser()` merges auth + profile contexts. Components needing only `userId` re-render when profile changes. Allow `useAuth()` / `useProfile()` separate consumption.

### Data Fetching
- [ ] **Replace `select("*")` with specific columns** — See HIGH section. Reduces payload size and query time.
- [ ] **Add Supabase composite indexes** — Frequently queried patterns lack indexes:
  - `nutrition_logs(user_id, date DESC)`
  - `weight_logs(user_id, date DESC)`
  - `fight_camps(user_id)`
  - `user_technique_progress(user_id)`
  - `fight_camp_calendar(user_id, date DESC)`
- [ ] **Consolidate gamification queries** — `useGamification.ts:267-363` runs 5 parallel DB queries on every Dashboard mount (cached 15 min). Consider a single DB function or view.
- [ ] **Use `head: true` for count-only queries** — `useGamification.ts:302,307` fetches full rows just to count them. Use `.select("", { count: "exact", head: true })`.

### Edge Functions
- [ ] **Consolidate warmup pings** — Dashboard, WeightTracker, Nutrition, RecoveryDashboard, FightWeek, Hydration all fire independent warmup GETs with fixed 2s delays. Consolidate into one utility, use `requestIdleCallback`, skip if already warmed.
- [ ] **Add response caching headers** — Static-ish responses (daily-wisdom for same day, ingredient lookups) could return `Cache-Control` headers to reduce repeat calls.

### Images & Assets
- [ ] **Lazy-load wizard images** — Add `loading="lazy"` to decorative wizard PNGs that appear below the fold.

### Lists
- [ ] **Add pagination to nutrition logs** — Currently loads all meals for a date range. With months of data, query + render time grows linearly.

---

## DONE (resolved)

- [x] **Error monitoring** — Sentry integration added (client + edge functions).
- [x] **Testing setup** — vitest configured, critical path tests added.
- [x] **Security — auth on scan-barcode, transcribe-audio, food-search** — `supabase.auth.getUser()` checks added.
- [x] **Critical dependency vulnerability** — `xlsx` replaced/removed; `npm audit fix` run.
- [x] **Debug code removed** — `src/debug-meal-api.tsx` deleted; console.logs cleaned up.
- [x] **TypeScript strict mode** — `strict: true` enabled incrementally.
- [x] **Empty states** — Added to data-driven pages (Nutrition, FightCamps have empty states; Hydration form is always shown).
- [x] **Loading state consistency** — Skeleton loaders added for Nutrition, Goals, Hydration.

---

## COMPLIANCE CHECKLIST (Required for App Store / payments)

- [ ] Privacy policy published and linked in app (currently placeholder links)
- [ ] Terms of service published and linked in app
- [ ] GDPR: Data export functionality
- [x] GDPR: Account deletion functionality
- [ ] GDPR: Consent management
- [x] Account deletion (Apple requirement since 2022)
- [ ] PCI DSS: Use Stripe-hosted checkout (avoid handling card data)
- [ ] Refund policy defined
- [ ] Tax handling configured (Stripe Tax or manual)
- [ ] Cookie/tracking consent (if applicable)
- [ ] Incident response plan documented
- [ ] App Store screenshots (5-8 per device size)
- [ ] App icon set (all iOS sizes via Xcode asset catalog)
