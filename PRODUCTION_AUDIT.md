# WeightCut Wizard — Production Readiness Audit

## Context
Full app survey before closing beta and accepting payments. Three parallel audits covered: (1) UI/UX & user-facing quality, (2) backend, security & data, (3) performance & code quality. Current state: functionally complete but significant gaps for a paid product.

**Overall Score: 4/10 — NOT production-ready for paying users.**

---

## PHASE 1 — BLOCKING (Must fix before accepting payment)

### 1.1 Payment Infrastructure (NOT IMPLEMENTED)
- No Stripe integration, no subscription management, no webhooks
- `is_premium` field exists in profiles but is never checked/enforced
- **Need**: Stripe checkout, webhook edge function, subscription table, paywall UI, billing portal
- **Need**: Terms of service, privacy policy, refund policy, GDPR data export/deletion

DONE ### 1.2 Error Monitoring (NONE)
- Zero observability — no Sentry, no LogRocket, no crash reporting
- Production errors are invisible; 23+ files use raw `console.log/error`
- **Need**: Sentry integration (client + edge functions), structured logging, alerting

DONE ### 1.3 Testing (ALMOST NONE) 
- Only 1 test file: `performanceEngine.test.ts` (638 lines)
- Zero tests for: auth flow, API calls, components, AI features, offline sync
- No vitest config, no CI test runner
- **Need**: vitest setup, tests for critical paths (auth, payments, data writes), 60%+ coverage target

DONE ### 1.4 Security — Auth Gaps 
- `scan-barcode/index.ts` — **NO auth verification** (anyone can call it)
- `transcribe-audio/index.ts` — **NO auth verification** (exposes Google API key usage)
- `food-search/index.ts` — Weak JWT validation (decodes without signature verification)
- **Need**: Add `supabase.auth.getUser()` check to all 3 functions

### 1.5 Security — Rate Limiting (NONE)
- Zero rate limiting on all 16 edge functions
- A single user can spam Grok API calls and exhaust quota
- **Need**: Per-user rate limits (e.g., Upstash or Deno KV) on all AI functions

### 1.6 Security — CORS
- Currently `"*"` (wildcard) on all functions — allows any website to call APIs
- Fine for dev but not for production with payments
- **Need**: Dynamic CORS that allows production domain + localhost for dev

DONE ### 1.7 Critical Dependencies
- `xlsx` (429 KB): HIGH severity vulnerability with **no fix available**
- `minimatch`, `rollup`: HIGH severity ReDoS
- **Need**: Replace `xlsx` with lightweight alternative or remove; run `npm audit fix`

DONE ### 1.8 Remove Debug Code
- `src/debug-meal-api.tsx` — Full debug component with emoji console.logs, must be deleted
- 23+ files have console.log statements left in production code

---

## PHASE 2 — HIGH PRIORITY (Fix before public release)

DONE ### 2.1 TypeScript Strictness DISABLED
- `tsconfig.json`: `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`
- Massive type safety gap — bugs slip through silently
- **Need**: Enable `strict: true` incrementally, fix type errors

### 2.2 Massive Single-File Components
| File | Lines | Problem |
|------|-------|---------|
| `Nutrition.tsx` | 3,878 | Meal logging + AI + barcode + voice + planning in one file |
| `WeightTracker.tsx` | 1,414 | Weight + AI + charts + sharing |
| `Hydration.tsx` | 1,206 | Monolithic page |
| `performanceEngine.ts` | 1,340 | Utility file should be split |
| `FightCampCalendar.tsx` | 758 | Calendar + sharing mixed |
| `BottomNav.tsx` | 632 | Too large for nav |

**Need**: Decompose into focused sub-components (max 300-400 lines each)

DONE ### 2.3 Empty States Missing
- **Nutrition**: Blank page when `meals.length === 0` — no "Log your first meal" CTA
- **Dashboard**: No guidance for new users with no weight logs
- **Goals**: No empty state for first-time users
- **Need**: Empty state components with CTAs on all data-driven pages

DONE ## 2.4 Loading State Inconsistency
| Page | Loading State | Quality |
|------|--------------|---------|
| Dashboard | DashboardSkeleton | Good |
| WeightTracker | Skeleton | Good |
| FightWeek | Skeleton | Good |
| Nutrition | Generic spinner | Bad |
| Goals | Generic spinner | Bad |
| Hydration | Generic spinner | Bad |

**Need**: Skeleton loaders for Nutrition, Goals, Hydration pages

### 2.5 Silent Async Errors
- `Dashboard.tsx`: `.catch(() => {})` — swallows errors silently
- Multiple pages: `if (!data) return;` without user feedback
- `JSON.parse()` without try-catch in: `localCache.ts`, `aiPersistence.ts`, `syncQueue.ts`
- **Need**: Error toasts/states on all async operations, wrap all JSON.parse

### 2.6 Bundle Size (>2.5MB uncompressed JS)
- `@huggingface/transformers`: 870 KB — used for barcode/ML, should lazy-load
- `xlsx`: 429 KB — evaluate if actually needed
- `Nutrition.tsx` chunk: 520 KB
- **Need**: Lazy-load transformers to barcode route only; replace/remove xlsx

### 2.7 Source Maps in Production
- `vite.config.ts` doesn't disable sourcemaps for production builds
- **Need**: Add `build: { sourcemap: false }`

### 2.8 No CI/CD Pipeline
- No `.github/workflows/` found
- Manual deployment only
- **Need**: GitHub Actions for build, test, lint, deploy

### 2.9 Sensitive Data in localStorage
- Profile data (weight, age, sex, health metrics) cached unencrypted
- AI cache contains meal descriptions, health data
- Not cleared on logout
- **Need**: Clear sensitive data on logout, minimize PII caching, use Capacitor secure storage for iOS

### 2.10 Input Validation on Edge Functions
- `rehydration-protocol`: No schema validation, no range checks on numeric values
- `meal-planner`: No validation on prompt input
- Most functions trust client data
- **Need**: Zod schemas on all edge functions

---

## PHASE 3 — MEDIUM PRIORITY (Fix for quality release)

### 3.1 Accessibility
- Only ~26 ARIA labels across entire codebase
- Missing: `aria-required`, `aria-invalid` on forms, screen reader descriptions for charts
- No keyboard navigation testing for modals/complex forms
- Color contrast concerns with `text-muted-foreground` on dark glass cards
- `NotFound.tsx` uses `bg-gray-100` instead of design system dark theme

### 3.2 Missing Confirmation Dialogs
- Goal updates (could break cut plan)
- Nutrition target overrides
- No "unsaved changes" warning on any form

### 3.3 Mobile/iOS Issues
- Refresh button uses hardcoded CSS instead of Tailwind safe-area classes
- Some modal close buttons have small touch targets
- No landscape mode handling
- No iPad breakpoints
- No offline indicator surfaced to user

### 3.4 Missing React.memo
- Zero instances of `React.memo()` in entire codebase
- Heavy components re-render on every parent update
- **Need**: Memo on MealCard, chart components, RecoveryDashboard, AI overlays

### 3.5 Event Listener Leaks
- `ui/sidebar.tsx`: Missing keydown listener cleanup
- `use-mobile.tsx`: Missing MQL listener cleanup
- `ProfilePictureUpload.tsx`: Image event listeners not removed

### 3.6 API Resilience
- No fallback if Grok API is down (11+ functions affected)
- No circuit breaker pattern
- No retry with backoff
- food-search has in-memory cache (lost on function restart)

### 3.7 No Pagination
- Nutrition meals: could load thousands of records
- Weight logs: no pagination
- Fight camp calendar: loads full month at once

### 3.8 AI Features UX
- `AIGeneratingOverlay`: No cancel button, no estimated time, no "stuck" detection
- No partial response recovery if stream cuts off
- AI cache not invalidated when user profile changes

---

## PHASE 4 — LOW PRIORITY (Polish for post-launch)

### 4.1 Incomplete Features
- **Onboarding**: Missing welcome screen, nutrition preferences, confirmation review, post-onboarding tutorial
- **Goals**: No progress tracking, milestones, notifications on goal reached
- **Dashboard**: No CTAs for inactive users, no weekly recap
- **Nutrition**: No meal history, macro trends, shopping list generation
- **Hydration**: No tracking of actual intake vs plan, no checklist UI, no hourly reminders
- **Fight Week**: No day-by-day checklist, no hydration integration

### 4.2 Design Consistency
- Inconsistent spacing (`p-4` vs `px-5 py-3.5`)
- Mixed border radius (`rounded-2xl`, `rounded-full`, `rounded-xl`)
- Inconsistent toast notification styles
- Haptic feedback missing on many interactions

### 4.3 ESLint Config Too Permissive
- `@typescript-eslint/no-unused-vars: "off"` — dead code not flagged
- 10+ `eslint-disable` comments scattered through components

### 4.4 Token Refresh Race Condition
- `UserContext.tsx`: Multiple concurrent requests can trigger simultaneous `refreshSession()` calls
- **Need**: Refresh lock/mutex

### 4.5 Dependency Updates
- 29 packages outdated (React 18→19, supabase-js 2.85→2.98, etc.)
- Image asset: `wizard-logo.png` (432 KB) should be SVG/WebP

---

## COMPLIANCE CHECKLIST (Required for payments)

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

---

## ESTIMATED EFFORT

| Phase | Items | Effort |
|-------|-------|--------|
| Phase 1 (Blocking) | 8 items | 3-4 weeks |
| Phase 2 (High) | 10 items | 2-3 weeks |
| Phase 3 (Medium) | 8 items | 2 weeks |
| Phase 4 (Polish) | 5 items | Ongoing |
| **Total to launch** | **~26 items** | **7-9 weeks** |

---

## FILES REQUIRING MOST WORK

| File | Issues |
|------|--------|
| `src/pages/Nutrition.tsx` (3,878 lines) | Decompose, remove console.logs, add empty states, add skeletons |
| `src/pages/Hydration.tsx` (1,206 lines) | Decompose, add skeleton loader |
| `src/pages/WeightTracker.tsx` (1,414 lines) | Decompose, remove console.logs |
| `supabase/functions/_shared/cors.ts` | Dynamic CORS for production |
| `supabase/functions/scan-barcode/index.ts` | Add auth verification |
| `supabase/functions/transcribe-audio/index.ts` | Add auth, fix API key in URL |
| `supabase/functions/meal-planner/index.ts` | Fix HTTP 200 error responses, add validation |
| `src/integrations/supabase/client.ts` | Secure storage for iOS |
| `vite.config.ts` | Disable sourcemaps, optimize chunks |
| `tsconfig.json` | Enable strict mode |
| `src/debug-meal-api.tsx` | DELETE entirely |
