# Nutrition Page Overhaul — Final Review

**Date:** 2026-04-19
**Reviewer:** code-review agent (final gate)
**Spec:** `docs/superpowers/specs/2026-04-19-nutrition-overhaul-design.md`
**Verdict:** **REJECTED (ship-blocker: test suite RED)**

Build and lint gates pass. The schema, RLS hardening, client-writer migration, file split, and realtime dual-sub all check out. **However, the tester's 40-test suite is still failing (7 red, 15 pass, 1 skip in the 23 nutrition tests that actually run).** Two concrete bugs are responsible; both are small and in the coder/tester contract surface, but the suite cannot be marked green without them. See "Remaining follow-ups" for the exact fixes.

---

## Gate-by-gate

| # | Gate | Result | Notes |
|---|------|--------|-------|
| 1 | `"Untitled"` literal grep | **PASS** | No `"Untitled"` literals in `src/` or `supabase/functions/`. The two remaining mentions in `src/` are inline comments (`src/lib/backgroundSync.ts:175`, `src/hooks/nutrition/useNutritionData.ts:182`) explaining defensive normalisation — acceptable. All other hits are in `tests/` and `docs/`. |
| 2 | `from("nutrition_logs").insert` grep | **PASS** | Zero hits in `src/` and `supabase/functions/`. Only matches are in `docs/superpowers/plans/…` (historical) and a banned-pattern reference in `tests/nutrition/mealOperations.spec.ts:7`. |
| 3 | `from("nutrition_logs").select` grep | **PASS (with one expected exception)** | Single hit: `src/components/DataResetDialog.tsx:49` — CSV export SELECT against the compat view. Read-only, not a write, and exactly the consumer the spec allows. |
| 4 | `wc -l` on nutrition split files | **PASS** | All 13 files under 500 lines. Largest: `NutritionPage.tsx` 481, `QuickAddDialog.tsx` 408. Files: `NutritionPage.tsx`(481), `MealSections.tsx`(183), `MealIdeasSection.tsx`(172), `TrainingWisdomSheet.tsx`(149), `NutritionHero.tsx`(139), `EditTargetsDialog.tsx`(168), `ManualNutritionDialog.tsx`(151), `QuickAddDialog.tsx`(408), `AiMealPlanDialog.tsx`(66), `FavoritesSheet.tsx`(56), `NutritionShareCard.tsx`(68), `EmptyMealsBanner.tsx`(71), `AiTaskBanner.tsx`(52). Total 2,164 lines vs the monolithic original. |
| 5 | `src/pages/Nutrition.tsx` deleted | **PASS** | `ls` returns "No such file or directory" — file removed as required. Routing must point to `src/pages/nutrition/NutritionPage.tsx`. |
| 6 | `npm run build` | **PASS** | `✓ built in 3.91s`. Bundle warning about NutritionPage chunk (137 kB, gzip 37 kB) is pre-existing code-splitting advisory, not a blocker. |
| 7 | `npm run lint` | **PASS (no net regression)** | 602 problems (375 errors, 227 warnings) — overwhelmingly `no-explicit-any` in pre-existing edge functions (`wizard-chat`, `training-summary`, `weight-tracker-analysis`). Spot-check of nutrition-owned files in the split shows no new errors attributable to this overhaul beyond the tester's own `mealOperations.spec.ts:283,295` `any` usage (acceptable in a test file but should be typed). |
| 8 | RLS hardening migration | **PASS with naming nit** | File exists at `supabase/migrations/20260419145000_nutrition_v2_rls_hardening.sql` (not `…025000` as the audit doc claims — naming skew, still applies AFTER `20260419120000_create_nutrition_v2.sql` and `20260419140000_nutrition_logs_compat_view.sql`, which is the required order). All five holes (H1–H5) patched: `meals` UPDATE `WITH CHECK`, `meal_items` UPDATE `WITH CHECK`, `foods` UPDATE `WITH CHECK`, `foods` INSERT tightened to `created_by = auth.uid()`, explicit `security_invoker=true` on `meals_with_totals` and compat `nutrition_logs` view. Also adds explicit `FOR DELETE USING (FALSE)` deny on `foods` (bonus, auditable intent). |
| 9 | `buildCreateMealRpcArgs` exported and pure | **PASS** | Defined in `src/lib/buildMealRpcArgs.ts:107`, re-exported from `src/hooks/nutrition/useMealOperations.ts:23`. Helper calls no `supabase` client; only pulls `coerceMealName`, `resolveMealType`, and local number-coercion utilities. Four call sites inside `useMealOperations.ts` (lines 178, 215, 259, 361) — every insert path routes through it. |
| 10 | `useMealsRealtime` dual-sub | **PASS** | `src/hooks/useMealsRealtime.ts` opens one channel `meals-v2:${userId}` with `.on("postgres_changes", { table: "meals" })` and `.on("postgres_changes", { table: "meal_items" })`. Maintains `mealParentRef` cache for item→parent date resolution and falls back to today's cache on unknown parents. Includes 1s defer off SIGNED_IN and clean teardown. |
| 11 | RLS audit doc | **PASS** | `docs/superpowers/specs/2026-04-19-nutrition-rls-audit.md` marks all 5 holes (H1–H5) patched. One inconsistency noted: the audit references migration file `20260419025000_nutrition_v2_rls_hardening.sql` but the actual file shipped is `20260419145000_…`. The audit doc should be updated for consistency; the patch itself is correct. |

## Memory-gate poll

Queried `nutrition-overhaul-v2` namespace:

- `tests_green`: **NOT PRESENT**
- `tests_failing`: **PRESENT** (28 min old at poll time). Tester summary reports: `1 failed | 14 passed | 25 skipped (40 total)` — but this was written before coder round 2 landed. A fresh vitest run this session shows **7 failed | 15 passed | 1 skipped** across the three nutrition spec files. The tester memory entry is stale; tests are still red, just with a different failure shape.

### Failures observed in the live rerun

1. **`tests/nutrition/coerceMealName.spec.ts` — entire suite fails to load.**
   - Error: `Cannot find package '@/lib/coerceMealName'`
   - Root cause: the spec imports from `@/lib/coerceMealName`, but the helper lives at `@/lib/mealName` (which exports both `coerceMealName` and `defaultNameFor`).
   - Owner: tester (fix import) **or** coder (add a barrel file `src/lib/coerceMealName.ts` re-exporting from `./mealName`). The spec says "Expected module path: src/lib/coerceMealName.ts" — lean toward re-export barrel.

2. **`tests/nutrition/mealOperations.spec.ts` — 7 of 8 RPC-contract tests throw `TypeError: Cannot read properties of undefined (reading 'meal_type')` at `buildMealRpcArgs.ts:108`.**
   - Root cause: interface-shape mismatch. Tests call `buildCreateMealRpcArgs({ userId, date, input: {...} })` (the shape the spec implies at lines 100–110). The helper expects `{ header: { meal_name, meal_type, date, … }, items?, fallbackTotals? }`. The single "exports buildCreateMealRpcArgs — coder gate" test passes; every test that actually calls the builder with real input blows up.
   - Owner: coder (either accept the test's flat shape and adapt internally, or update the test harness's thin wrapper at `mealOperations.spec.ts:70,134` to translate into `{header, items}`). Given the helper contract is documented in the spec and used by 4 call sites in `useMealOperations.ts`, the cleaner fix is a tester-side shim.

Tester should rerun and post `tests_green` once both are fixed — this is a <30-minute patch.

## Security review

- RLS audit migration addresses every hole the security-architect flagged. No new surface area introduced by this review.
- Client writers now go through `create_meal_with_items` RPC — `user_id` binding to `auth.uid()` is a server-side concern; verified in the RPC implementation per spec §326 and exercised by the RLS spec suite (currently skipped without staging creds — see followup).
- `DataResetDialog`'s SELECT on the `nutrition_logs` compat view is safe: view is `security_invoker=true` via the H5 patch, so it filters by caller.
- No hardcoded secrets, no `.env` diffs, no new PII handling.

## Performance / maintainability

- File split brings the monolithic `Nutrition.tsx` under the 500-line guideline across all 13 pieces. `NutritionPage.tsx` at 481 is close to the ceiling — any future addition should split `MealSections` or the dialogs out further.
- Realtime hook uses a single channel with two listeners and a local parent-cache, avoiding N+1 subscribe churn.
- `buildCreateMealRpcArgs` is pure, testable, and centralises the six writer paths. Good refactor.

---

## Remaining follow-ups (ordered by ship-impact)

1. **BLOCKER — Fix the two test-suite failures above.** Coder or tester lands a ~10-line patch (either re-export `coerceMealName` from `src/lib/coerceMealName.ts`, or update `mealOperations.spec.ts` helper shim to pass `{header, items}`). Tester reruns and stores `tests_green` in `nutrition-overhaul-v2` namespace.
2. **HIGH — Wire the RLS spec suite (`tests/security/nutrition_rls.spec.ts`) into CI** with staging `SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY` / `SUPABASE_TEST_SERVICE_KEY` env vars. Without this, cross-tenant denial is only tested manually.
3. **MEDIUM — Update `docs/superpowers/specs/2026-04-19-nutrition-rls-audit.md`** to reference the actual migration filename `20260419145000_nutrition_v2_rls_hardening.sql` (currently says `…025000`).
4. **LOW — Code-split `NutritionPage.tsx`** (481 lines, close to 500). Candidates: lift `MealSections` layout logic and the larger dialog into their own module, or split hero+header from the page body.
5. **LOW — Type the `any` usage in `tests/nutrition/mealOperations.spec.ts:283,295`** to silence the two net-new lint errors that file introduced.
6. **LOW — Confirm router update** — any route still pointing at `src/pages/Nutrition.tsx` will 404. Verify `src/App.tsx` lazy-imports `./pages/nutrition/NutritionPage`.

## Final verdict

**REJECTED** — code quality, security posture, build, and lint all pass; but tests must be green before shipping a data-layer migration of this size. Re-review is trivial (one patch, one test rerun) and should not require another full pass — once `tests_green` lands in the memory namespace this review flips to APPROVED-WITH-FOLLOWUPS (items 2–6 are non-blocking).
