# Nutrition Overhaul V2 — Manual Smoke Test Checklist

**Spec:** `docs/superpowers/specs/2026-04-19-nutrition-overhaul-design.md`
**Target commit:** post-migration (see memory flags `client_writers_migrated: true`,
`edge_functions_updated: true`)
**Tester:** Assigned on day of smoke run
**Environment matrix:** iOS Capacitor (iPhone 15 Pro Sim + physical device) · Web (Chrome, Safari)

Every checkbox must be ticked before the overhaul ships. Record observed values, not just pass/fail.

---

## Automated test-suite coverage (tester round 2 — 2026-04-19)

Memory signal: `nutrition-overhaul-v2.tests_green = PASS:44/44`.
Build smoke: `npm run build` → green (vite built in ~4 s, no TS errors).

| Suite | File | Tests | Status | Covers acceptance |
|-------|------|-------|--------|-------------------|
| coerceMealName | `tests/nutrition/coerceMealName.spec.ts` | 19 | PASS | #2 (no "Untitled" regression) |
| mealOperations | `tests/nutrition/mealOperations.spec.ts` | 11 | PASS | #2 (RPC args shape, all 5 paths) |
| MacroPieChart (calorie wheel) | `tests/nutrition/calorieWheel.spec.tsx` | 14 | PASS | #1 (cold render + partial fill + over-target) |
| Nutrition v2 RLS | `tests/security/nutrition_rls.spec.ts` | 17 | SKIP (no `SUPABASE_TEST_URL`) | §5 cross-tenant — **manual QA / staging run required** |

**Covered by automated suite (no manual re-verification needed for these sub-items):**
- §2 Path A/B/C/D builder contract: 0 "Untitled" in synthesised RPC args; `p_meal_name` non-empty across every empty-raw × valid-meal_type combo (32 cases exercised).
- §2 item positions auto-assigned + monotonic.
- §2 notes trimming (empty → NULL, text passes through).
- §2 `buildCreateMealRpcArgs` never emits a `nutrition_logs`-shaped payload (key-set assertion).
- §1 calorie wheel: cold render with profile but zero meals renders Goal, Left=target, 0% and no "Over" flash; 25% partial fill; divide-by-zero guard when target=0.
- §1.3 coerceMealName: 4 valid meal_type defaults + unknown/null/undefined → "Logged meal" + case-sensitivity; never returns "" or "Untitled".

**Still requires manual QA (cannot be exercised in vitest):**
- §1 Cold-load reliability matrix (iOS Capacitor + web hard-refresh × 10 per platform).
- §2 Live insert through all 4 input paths against hosted DB (manual, food-search, barcode, AI photo) including Sentry `coerceMealName_fallback` count.
- §3 Search latency (USDA) — requires cold/warm edge-fn timings.
- §4 Cross-feature reconciliation (Dashboard, coach, streak, diet analysis, meal planner, CSV export, demo seeder).
- §5 RLS — run this suite with `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_KEY` set against staging.
- §6 `wc -l src/pages/nutrition/*.tsx` line-budget spot check.
- §7 Supabase 401 tail during smoke run.
- §8 Sentry 7-day watch (scheduled 2026-04-26).

**Coder / infra follow-ups applied in round 2:**
- Fixed `src/lib/mealName.ts` `defaultNameFor` to return `"Logged meal"` for unknown/empty meal_type, matching the spec §1.3 and the server-side `analyze-meal` edge function's own `defaultNameFor`. Previously returned `"Snack"` — client/server were inconsistent, which could have re-introduced the "all meals land in Snacks" regression whenever meal_type was missing.
- Updated `coerceMealName.spec.ts` import from `@/lib/coerceMealName` → `@/lib/mealName` (final module path).
- Rewrote `mealOperations.spec.ts` to target the shipped flat-arg RPC contract (`{ p_date, p_meal_type, p_meal_name, p_notes, p_is_ai_generated, p_items }`) matching migration `20260419150000_create_meal_with_items_rpc.sql` and the edge-function call sites. Original draft assumed a nested `{ p_meal, p_items }` shape that was never implemented.

---

## 1. Cold-load reliability — Acceptance #1

Hard-refresh the Nutrition page **10 consecutive times** on each platform. Clear Safari/web cache between runs 3 and 7 to force cold isolate + cold profile fetch.

| # | Platform | Wheel target visible < | Consumed populated < | Result |
|---|----------|------------------------|-----------------------|--------|
| 1 | Web wifi |                        |                       |        |
| 2 | Web wifi |                        |                       |        |
| 3 | Web wifi (cache cleared) |               |                  |        |
| 4 | Web wifi |                        |                       |        |
| 5 | Web wifi |                        |                       |        |
| 6 | iOS Sim  |                        |                       |        |
| 7 | iOS Sim (cold boot)  |           |                       |        |
| 8 | iOS device |                      |                       |        |
| 9 | iOS device (airplane → online) |      |                  |        |
| 10| iOS device 3G simulator |       |                       |        |

**Pass criteria:**
- [ ] Wifi: wheel target + consumed populated within **8 s** on every attempt.
- [ ] 3G: target populated within **15 s**, consumed within **15 s**.
- [ ] No blank wheel flashing "0 / 0" after 1 s on any attempt.
- [ ] No `Load meals timed out after 6000ms` in console/Sentry.

---

## 2. 50-meal regression across 4 input paths — Acceptance #2

Add meals in four equal batches (12 or 13 per path) — total **50 meals**. Record the landing section for each.

### Path A: Manual form (13 meals)
- [ ] 0/13 land as "Untitled" or in wrong section
- [ ] All meal_name values present in `meals_with_totals` query
- [ ] Breakfast → Breakfast section, Lunch → Lunch, Dinner → Dinner, Snack → Snack
- Observed: ___ / 13 correct

### Path B: Food-search (13 meals)
- [ ] Search "chicken", select first result — within **2 s** warm / **5 s** cold
- [ ] Select "apple", "banana", "rice", "oats" — items round-trip via `foods` catalog
- [ ] Meal name matches the selected food
- [ ] 0/13 land in wrong section
- Observed: ___ / 13 correct

### Path C: Barcode scan (12 meals)
- [ ] Scan real barcodes (cereal, protein bar, yogurt …)
- [ ] `scan-barcode` edge fn upserts into `foods` with `barcode` as UNIQUE key
- [ ] Second scan of same barcode re-uses catalog row (no duplicate in `foods`)
- [ ] 0/12 "Untitled"
- Observed: ___ / 12 correct

### Path D: AI photo analysis (12 meals)
- [ ] `analyze-meal` returns items array; RPC `create_meal_with_items` inserts atomically
- [ ] Revert savepoint on fail: force an item with grams<=0 and verify the whole meal is rolled back
- [ ] Rendered meal_name is the AI-generated name, not "Untitled"
- Observed: ___ / 12 correct

**Aggregate pass criteria:**
- [ ] **Zero** meals land as "Untitled"
- [ ] **Zero** meals land in the wrong section
- [ ] `SELECT count(*) FROM meals WHERE meal_name = 'Untitled'` returns `0`
- [ ] Sentry breadcrumb `coerceMealName_fallback` fires 0 times

---

## 3. Search latency — Acceptance #3

From a fresh isolate (cold edge fn):
- [ ] First search for "chicken" returns results within **5 s**
- [ ] Second search for "beef" returns within **2 s** (warm)
- [ ] Third search for "quinoa" returns within **2 s**

From a warm isolate:
- [ ] 5 distinct USDA queries each return within **2 s**

Network fault modes:
- [ ] 401 from `food-search` → client shows "Sign-in expired" toast, offers retry
- [ ] Offline → client falls back to `foods` catalog recents (last 50 distinct names)

---

## 4. Cross-feature compatibility — Spec §4.8

Run each of the following against the same seed account and confirm identical output before and after migration.

### Dashboard
- [ ] Today's calorie summary **exactly** matches the Nutrition page wheel
- [ ] Today's macro rings match Nutrition macro bars to the gram
- [ ] Yesterday's totals render if stored

### Wizard chat (coach)
- [ ] "What did I eat yesterday?" returns the full meal list, names match
- [ ] "How's my protein today?" uses `meals_with_totals` aggregates (confirm via edge fn log)

### Gamification / streak
- [ ] Streak counter matches manual count of days with ≥1 meal
- [ ] Logging today's first meal bumps the streak by 1 within 2 s

### Diet analysis
- [ ] `analyse-diet` returns the same top-level insights on the same 7-day window as pre-migration
- [ ] Macro breakdown % adds up to 100 ±1

### Fight-week analysis
- [ ] Weekly kcal average within ±5 kcal of a hand-summed total
- [ ] Protein/carbs/fats weekly averages within ±1 g

### Meal planner
- [ ] Plan references **current-week** eating patterns (verify prompt uses `meals_with_totals`)
- [ ] Generated meal ideas, when logged via the "Log All" button, end up as `meals` + `meal_items`, never `nutrition_logs`

### Daily wisdom
- [ ] "Today's tip" references today's macros (not yesterday's or static)

### CSV export (DataResetDialog)
- [ ] Export includes every meal from both the new schema and the `nutrition_logs_v1` archive
- [ ] Totals in CSV reconcile with the Dashboard for every date

### Demo data
- [ ] A fresh demo user sees seeded meals on both the Nutrition page and the Dashboard
- [ ] Demo seeder writes into `meals` + `meal_items`, never `nutrition_logs`

---

## 5. Data-model and RLS verification

- [ ] Automated RLS suite (`tests/security/nutrition_rls.spec.ts`) passes against the staging project (SUPABASE_TEST_URL set)
- [ ] User A cannot see User B's meals on the page (verified via second browser session)
- [ ] Deleting a meal cascades deletion of all its meal_items (confirm via admin SQL)
- [ ] `foods` table insert fails without authentication (verified via anon client)

---

## 6. File-size limit — Acceptance #4

Run locally:

```bash
wc -l src/pages/nutrition/*.tsx
```

- [ ] Every reported file is **< 500 lines**
- [ ] `src/pages/Nutrition.tsx` no longer exists (replaced by the split)

---

## 7. Supabase log audit — Acceptance #5

During the smoke run, tail the Supabase function logs:

- [ ] Zero 401 responses from `food-search` during an authenticated session
- [ ] Only 401s present are from explicit anonymous test requests
- [ ] `create_meal_with_items` RPC logs show no errors on the 50-meal regression run

---

## 8. Sentry 7-day post-ship watch — Acceptance #6

Schedule a calendar reminder for **2026-04-26** to check Sentry:

- [ ] `coerceMealName` fallback breadcrumb count = 0 over 7 days
- [ ] No new `nutrition_logs` INSERT errors (would indicate stale code path)
- [ ] `unique key` React warnings on Nutrition page = 0

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Tester | | | |
| Reviewer | | | |
| Coordinator | | | |

> **Do not merge until every checkbox above is ticked.** Partial passes must be itemised in the notes column and re-run after fix.
