# Onboarding Final Redirect Fix — Plan

**Branch**: `coach-mode`
**Status**: Ready to implement
**Owner**: implementer (handed off by planner)

## Symptom

After "Start camp" on Step 7 of the W2 onboarding flow, the user is bounced back to Step 1 of `/onboarding` instead of landing on `/dashboard` with the tutorial booting and the cut plan card visible. Pre-restructure this worked.

## Root cause (most likely)

**Race between `Onboarding.tsx`'s redirect-on-mount effect (lines 92–114) and `handleSubmit`'s navigate (line 287).** The localStorage marker `wcw_onboarding_just_completed` is set AFTER `refreshProfile()` resolves and AFTER `seedDemoData()` runs, but the *effect* dependency array at line 114 (`[authLoading, hasProfile, isCoach, navigate, profile]`) re-fires the moment `refreshProfile()` updates `profile`. At that instant:

1. `profile.onboarding_completed_at` *should* be set, but if `safeProfileUpsert` had to strip it (PGRST204 — schema-cache miss for the W2 migration), the column will be `null` on the just-fetched row.
2. `wcw_onboarding_just_completed` localStorage marker has NOT yet been written (it's set on line 283, three statements after `refreshProfile()` resolves on line 275).
3. The heuristic fallback at line 107 (`profile.sex && profile.age && profile.current_weight_kg && profile.height_cm`) DOES trigger — but only if every one of those four columns came back populated. If any incremental persist on Step 2 also stripped a column, the heuristic returns false.

Result: the effect fires `navigate("/dashboard", { replace: true })` from `handleSubmit` on line 287, then *immediately* the redirect-on-mount effect re-runs (because `profile` just changed), sees no completion sentinel and no localStorage marker, and replaces the route. ProfileCompletionGuard then re-checks (its logic at `src/components/ProfileCompletionGuard.tsx:49–66` is identical) and bounces to `/onboarding`. The orchestrator re-mounts at `currentStep=1` because the resume effect at line 118 only seeds when `profile.onboarding_step` is between 1 and TOTAL_STEPS — and a stripped `onboarding_step` column leaves `profile.onboarding_step` as `undefined` → `Number(undefined)` = `NaN` → seed skipped → state defaults to `useState<number>(1)`.

A secondary contributor: `Index.tsx:51` reads `lastRoute` from localStorage, but `RouteTracker` (`App.tsx:117–121`) skips writing `/onboarding` (it's in `SKIP_ROUTES`), so `lastRoute` is whatever the user was on before sign-up — usually nothing — so this is NOT the primary cause but masks the bug if the user reloads.

## Fix specification

### Fix 1 — Make the post-submit redirect bulletproof
**File**: `src/pages/Onboarding.tsx`

a. **Set the localStorage marker BEFORE `refreshProfile()`**, so the redirect-on-mount effect (and ProfileCompletionGuard) sees it the moment `profile` updates. Move line 283 (`localStorage.setItem("wcw_onboarding_just_completed", "true")`) to immediately after `await scheduleOnboardingNotifications()` on line 272 — i.e. before line 275 `await refreshProfile()`.

b. **Add a `justSubmittedRef = useRef(false)`** at the top of the component (next to `planKickedOffRef`). Set `justSubmittedRef.current = true` as the very first line inside `handleSubmit`'s `try` block. In the redirect-on-mount effect at lines 92–114, early-return if `justSubmittedRef.current` is true. This prevents the effect from racing the navigate even if all the localStorage / heuristic guards fail.

c. **Use `navigate("/dashboard", { replace: true })` only AFTER an explicit assertion** that the profile fetch returned `onboarding_completed_at` OR that we set the localStorage marker. Order should be: (1) `safeProfileUpsert`, (2) set localStorage marker, (3) set `justSubmittedRef.current = true`, (4) `await refreshProfile()`, (5) `seedDemoData`, (6) `celebrateSuccess`, (7) `navigate("/dashboard", { replace: true })`. Currently the order interleaves the marker between `seedDemoData` and `celebrateSuccess`.

d. **Drop the `profile` dependency from the redirect-on-mount effect** — or guard the effect so it ONLY fires when `currentStep === 1` (the resume case). The effect's purpose is "if user re-opens onboarding after already finishing, bounce them out". It should NOT fire while the user is mid-flow. Add `if (currentStep > 1) return;` near line 93. This is the cheap structural fix even if (a)–(c) are skipped.

### Fix 2 — Ensure the dashboard tutorial fires
**Files**: `src/pages/Onboarding.tsx`, `src/tutorial/TutorialContext.tsx`

The tutorial trigger is correct (`TutorialContext.tsx:151–208` reads `wcw_onboarding_just_completed`). Fix 1(a) — moving the marker write earlier — is sufficient. No change needed to the tutorial itself. Verify by tracing: marker → navigate → Dashboard mounts → TutorialContext effect at line 152 runs, sees marker, clears it on line 176, calls `seedDemoData` if needed, starts the `onboarding` tutorial flow on line 205.

One additional safeguard: in `Onboarding.tsx` line 277 the orchestrator calls `seedDemoData(userId)` itself. The tutorial provider also calls `seedDemoData` (TutorialContext.tsx:197). This is already idempotent (`isDemoActive` short-circuits) so leave it.

### Fix 3 — Persist the cut plan so the dashboard card is visible
**File**: `src/components/onboarding/planKickoff.ts` and `src/components/onboarding/orchestrator.ts`

The dashboard's cut-plan card (`Dashboard.tsx:647–656`) renders only if `isFighter(profile?.goal_type) && hasCutPlan`. `hasCutPlan` flips true if EITHER (a) `localStorage.wcw_cut_plan` is set, OR (b) `profile.cut_plan_json` rehydrates it (Dashboard.tsx:98–110).

Today the orchestrator writes the plan ONLY to `localStorage.wcw_cut_plan` (Onboarding.tsx:183). It never persists `cut_plan_json` to the `profiles` table. On iOS WebView, localStorage can be wiped between launches — and on a reinstall / fresh device the user has nothing in DB to rehydrate from. Pre-restructure the old `Onboarding.tsx` wrote `cut_plan_json` directly to the profile during the final upsert.

Add `cut_plan_json` to `buildFinalProfileUpdate`:
- Extend `FinalProfileInputs` (orchestrator.ts:247) with `cutPlanJson: Record<string, unknown> | null`.
- In `buildFinalProfileUpdate`, return `cut_plan_json: cutPlanJson` alongside the other fields (orchestrator.ts:290–337).
- In `Onboarding.tsx:253`, pass `cutPlanJson: result_from_kickoff.cachePayload ?? null`. The orchestrator currently throws away `cachePayload` — capture it in a ref or in `planPreview` state. Add a new piece of state `const [planCachePayload, setPlanCachePayload] = useState<Record<string, unknown> | null>(null);` and set it inside `runKickoff` (line 175) right after `setPlanPreview(result.preview)`.
- Ensure `safeProfileUpsert`'s `STRIPPABLE_COLUMNS` set in `src/lib/safeProfileUpsert.ts:17–34` does NOT contain `cut_plan_json` (it currently doesn't — keep it that way) so a missing column surfaces a real error instead of silently dropping the plan. If migrations may genuinely lag in dev, ADD `cut_plan_json` to the strippable set as a one-line addition; the localStorage write covers the dev gap.

This makes the cut plan card persist across sessions and across reinstalls, matching pre-restructure behaviour.

### Fix 4 (optional belt-and-braces) — block ProfileCompletionGuard during submit
**File**: `src/components/ProfileCompletionGuard.tsx`

Read the same `wcw_onboarding_just_completed` marker BEFORE the loading guard runs. Currently it's checked inside the `onboardingComplete` derivation but only after `profile` is loaded. If the navigate from `handleSubmit` lands while `loadUserData` is still re-running (it isn't — but defensively), the guard sees `!profile` plus `!hasProfile` and bounces to /onboarding. Add an early `if (localStorage.getItem("wcw_onboarding_just_completed") === "true") return <>{children}</>;` near line 67. Cheap insurance.

## Test plan

The implementer + debugger should run, in order:

1. **Static checks** — must all pass cleanly:
   - `npm run lint`
   - `npx tsc --noEmit` (or `npm run build` — covers typecheck)
   - `npm test` if tests exist for `orchestrator.ts` (the new `cutPlanJson` field needs to be threaded through)
2. **Manual flow trace (web)** — use a fresh test account or wipe localStorage:
   - Sign up → land on Step 1.
   - Complete each of Steps 1–7 for a CUTTER (`goal_type === "cutting"`). Verify in DevTools → Application → localStorage that `wcw_cut_plan` is written between Step 6 and Step 7.
   - Press "Start camp" on Step 7. Watch DevTools → Network: the profile upsert fires, then `navigate("/dashboard")` fires once. The page MUST stay on `/dashboard`.
   - Verify `wcw_onboarding_just_completed` is briefly present, then cleared by `TutorialContext` after the tutorial boots (200–500ms after the dashboard renders).
   - Verify the cut plan card is visible (`Dashboard.tsx:647`) — the "Cut Plan" button.
   - Verify the dashboard tutorial overlay appears.
3. **Manual flow trace (LOSER path)** — same drill with `goal_type === "losing"`. Steps 3 and 4 should be skipped. Land on /dashboard. The cut plan card will NOT show (cutter-only).
4. **Reload after onboarding** — refresh the page on /dashboard. Confirm no bounce to /onboarding (the heuristic + cut_plan_json + localStorage all combine to make this safe).
5. **Stale-DB simulation** — temporarily add `onboarding_completed_at` back to `STRIPPABLE_COLUMNS` and force `safeProfileUpsert` to strip it (e.g., comment out the column from the SELECT in `queryColumns.ts`). Confirm the heuristic fallback + `wcw_onboarding_just_completed` marker still keep the user on /dashboard.
6. **Coach guard regression** — sign in as a coach. Confirm the redirect lands on `/coach`, never on `/onboarding`. The `isCoach` short-circuit at Onboarding.tsx:94–97 must continue to fire BEFORE the onboarding-complete check.

## Rollback note

If the fix introduces a different bug (e.g., the redirect-on-mount effect now fails to bounce a returning, fully-onboarded user from `/onboarding` to `/dashboard`), the cheap rollback is to keep Fix 1(a) and Fix 1(b) but revert Fix 1(d). The `justSubmittedRef` short-circuit alone is enough to defeat the race; the effect dependency change is just the structural cleanup.

If Fix 3 (`cut_plan_json` persistence) breaks the upsert because the column isn't in the live schema cache, add `cut_plan_json` to `STRIPPABLE_COLUMNS` in `safeProfileUpsert.ts` — the localStorage write covers display until the migration ships.

If Fix 4 causes the guard to leak into a state where a never-onboarded user with a stale localStorage marker skips the wizard, clear `wcw_onboarding_just_completed` on sign-out (already partial — verify in `signOut` at `UserContext.tsx:532`). Add `try { localStorage.removeItem("wcw_onboarding_just_completed"); } catch {}` to `signOut`.
