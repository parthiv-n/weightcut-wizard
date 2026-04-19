# Nutrition Page Overhaul — Design Spec

**Date:** 2026-04-19
**Status:** Approved, in implementation
**Scope:** Fix reliability bugs + redesign data model. Big-bang, clean-slate archival.

## Problem Statement

The Nutrition page is the worst-performing screen in the app. Observed failures:

1. **Calorie wheel goes empty on every refresh.** Target renders (from cache) but consumed stays at 0.
2. **Meals land as "Untitled" in the Snacks section** regardless of input path (manual, search, barcode, AI photo).
3. **Manual food search sometimes fails.** 401 responses from the `food-search` edge function.
4. **React console emits "unique key" warnings** from `MealCard` inside `Nutrition.tsx`.
5. **Data model is too thin.** `nutrition_logs` conflates meal header, items, and food data — no catalog, no portions, no FKs. This makes search, reuse, and reliability all fragile.

## Evidence (from live console + code audit)

| Observation | Source |
|---|---|
| `Error: Authentication operation timed out` (6s) | `src/lib/timeoutWrapper.ts:6` default; `src/contexts/UserContext.tsx:239` |
| `Load meals timed out after 6000ms` (repeats) | `src/hooks/nutrition/useNutritionData.ts:195` |
| `Failed to load resource: 401 (food-search)` | Warmup ping sends no Authorization header: `src/components/nutrition/FoodSearchDialog.tsx:151` |
| Each child needs key at `Nutrition.tsx:1250:91` → `MealCard` | `groupMeals.map` in `src/pages/Nutrition.tsx:694` renders rows whose `id` can collide when syncQueue payload uses an empty recordId |
| `meal.meal_name \|\| "Untitled"` fallback | `src/components/nutrition/MealCard.tsx:146,180` |
| `Nutrition.tsx` is 1358 lines (CLAUDE.md limit: 500) | `wc -l src/pages/Nutrition.tsx` |

## Goals

- Calorie wheel and macro rings fill correctly on cold reload, every time.
- Every meal has a human-readable name across every input path. No `"Untitled"`.
- Manual food search and add flows succeed deterministically when online.
- Clean data model: foods catalog, meal header, meal items — FK-bound, indexed, RLS-secured.
- Nutrition page files under the 500-line limit.

## Non-Goals (explicit)

- Offline-first conflict resolution for multi-device edits. SWR + sync queue stays.
- Historical migration of user meal data. User approved **clean-slate**; old data archived and read-only in DB, not surfaced in UI.
- Pre-seeding USDA foods catalog. Lazy cache-on-first-search only.
- Redesign of barcode UI, meal photo analysis UI, or meal planner flow.

---

## Phase 1 — Stabilize (must-land before schema migration runs)

### 1.1 Auth timeout + session resilience

**Files:** `src/lib/timeoutWrapper.ts`, `src/contexts/UserContext.tsx`, `src/hooks/nutrition/useNutritionData.ts`

- Raise `withAuthTimeout` default from 6000ms → **15000ms**. Auth on cold iOS Capacitor launch can legitimately take 10s.
- `UserContext._performLoad`: on first-attempt timeout, retry **once** after 2s before setting `authError`. Log both attempts distinctly.
- `loadMeals` in `useNutritionData.ts`: if `userId` arrives late, re-run load via an effect that also depends on `userId` (already does — verify no stale-closure issues). Ensure the retry-on-error backoff does not permanently stick when session finally restores.

### 1.2 Food search auth

**Files:** `src/components/nutrition/FoodSearchDialog.tsx`, `supabase/functions/food-search/index.ts`

- Remove the unauthenticated warmup ping at line 151 — OR keep the warmup but include the session token. Cleanest: remove it; the real search request already warms the isolate.
- Wrap the real search in a session-refresh helper: if `session?.access_token` is missing or `session.expires_at` is within 60s, call `supabase.auth.refreshSession()` once, then proceed. On refresh failure, surface a visible toast ("Sign-in expired, please reopen the app") rather than silent failure.
- `food-search/index.ts`: on 401, include a JSON error body with a `retryable: true` flag so the client can distinguish auth from real errors.

### 1.3 Kill `"Untitled"` at every boundary

**Files:** `src/hooks/nutrition/useMealOperations.ts`, `src/lib/syncQueue.ts`, `src/components/nutrition/MealCard.tsx`, `src/pages/nutrition/types.ts`

- Central helper `coerceMealName(raw: string | null | undefined, mealType: string): string` returns `raw?.trim() || defaultNameFor(mealType)` where `defaultNameFor` returns "Breakfast", "Lunch", "Dinner", "Snack" (or "Logged meal" if meal_type absent).
- Apply this helper in **every path** that produces a meal payload: manual submit, food-search result mapping, barcode handler, analyze-meal post-processor, quick-add buttons, syncQueue payload builder, optimistic setter, and cache normalizer.
- Remove the `"Untitled"` string literal from `MealCard.tsx` — replace with `defaultNameFor(meal.meal_type)`. This is a belt-and-braces safety net; the real fix is the helper upstream.
- Add a Sentry log (no crash) whenever the helper fires a fallback — so we can verify in prod whether the fallback ever triggers after the fix lands.

### 1.4 Stable React keys

**Files:** `src/pages/Nutrition.tsx`

- Audit all `.map(` calls that render list rows. Change `key={meal.id}` to `key={\`${meal.id}:${meal.date}:${meal.meal_type}\`}` so optimistic rows with duplicated IDs never collide.
- Ensure syncQueue `recordId` generation always emits a fresh UUID (`crypto.randomUUID()`) — never empty string.

### 1.5 Split `Nutrition.tsx` (1358 lines → ≤500/file)

**New files:**
- `src/pages/nutrition/NutritionPage.tsx` — route component, state wiring, dialogs (≤400 lines)
- `src/pages/nutrition/NutritionHero.tsx` — MacroPieChart + targets + date navigator (≤250 lines)
- `src/pages/nutrition/MealSections.tsx` — 4 meal type sections with expand / quick-add (≤350 lines)
- `src/pages/nutrition/dialogs/` — one file per dialog (manual, AI, targets, meal plan, favorites, manual nutrition)

Old `src/pages/Nutrition.tsx` deleted. `src/App.tsx` lazy import points at `NutritionPage.tsx`.

---

## Phase 2 — Clean-slate schema

### 2.1 Archive existing table

```sql
-- Migration: 20260419010000_archive_nutrition_logs.sql
BEGIN;

ALTER TABLE public.nutrition_logs RENAME TO nutrition_logs_v1;

-- Keep RLS enabled and user-scoped SELECT so users can recover their own rows
-- via a future export tool. No app reads this table.

COMMENT ON TABLE public.nutrition_logs_v1 IS
  'Archived 2026-04-19 during nutrition overhaul. Read-only. Not queried by client.';

COMMIT;
```

### 2.2 New tables

```sql
-- Migration: 20260419020000_create_nutrition_v2.sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Foods catalog (shared, growing over time)
CREATE TABLE public.foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  brand TEXT,
  barcode TEXT UNIQUE,
  calories_per_100g NUMERIC(7,2) NOT NULL CHECK (calories_per_100g >= 0),
  protein_per_100g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (protein_per_100g >= 0),
  carbs_per_100g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (carbs_per_100g >= 0),
  fats_per_100g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (fats_per_100g >= 0),
  default_serving_g NUMERIC(6,2),
  source TEXT NOT NULL CHECK (source IN ('usda','openfoodfacts','user','ai')),
  source_ref TEXT,                           -- e.g. USDA fdcId, OFF barcode
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_ref)
);

CREATE INDEX idx_foods_name_trgm ON public.foods USING gin (name gin_trgm_ops);
CREATE INDEX idx_foods_barcode ON public.foods (barcode) WHERE barcode IS NOT NULL;

-- Meal header
CREATE TABLE public.meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'snack'
    CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  meal_name TEXT NOT NULL CHECK (char_length(trim(meal_name)) > 0),
  notes TEXT,
  is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meals_user_date ON public.meals (user_id, date DESC);
CREATE INDEX idx_meals_user_created ON public.meals (user_id, created_at DESC);

-- Meal items (foods with grams; either catalog food_id or ad-hoc)
CREATE TABLE public.meal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  food_id UUID REFERENCES public.foods(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  grams NUMERIC(7,2) NOT NULL CHECK (grams > 0),
  calories NUMERIC(7,2) NOT NULL CHECK (calories >= 0),
  protein_g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fats_g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (fats_g >= 0),
  position INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_meal_items_meal ON public.meal_items (meal_id, position);
CREATE INDEX idx_meal_items_food ON public.meal_items (food_id) WHERE food_id IS NOT NULL;

-- RLS
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_items ENABLE ROW LEVEL SECURITY;

-- foods: everyone reads, authenticated users insert their own
CREATE POLICY "foods_read_all" ON public.foods FOR SELECT USING (TRUE);
CREATE POLICY "foods_insert_authed" ON public.foods FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (created_by IS NULL OR created_by = auth.uid()));
CREATE POLICY "foods_update_own_unverified" ON public.foods FOR UPDATE
  USING (auth.uid() = created_by AND verified = FALSE);

-- meals: owner only
CREATE POLICY "meals_select_own" ON public.meals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "meals_insert_own" ON public.meals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meals_update_own" ON public.meals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "meals_delete_own" ON public.meals FOR DELETE USING (auth.uid() = user_id);

-- meal_items: via parent meal
CREATE POLICY "meal_items_select_own" ON public.meal_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = auth.uid()));
CREATE POLICY "meal_items_insert_own" ON public.meal_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = auth.uid()));
CREATE POLICY "meal_items_update_own" ON public.meal_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = auth.uid()));
CREATE POLICY "meal_items_delete_own" ON public.meal_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.meals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_items;

COMMIT;
```

### 2.3 View for fast page load

```sql
-- Migration: 20260419030000_meals_with_totals.sql
CREATE OR REPLACE VIEW public.meals_with_totals AS
SELECT
  m.id, m.user_id, m.date, m.meal_type, m.meal_name, m.notes, m.is_ai_generated, m.created_at,
  COALESCE(SUM(mi.calories), 0)::INT AS total_calories,
  COALESCE(SUM(mi.protein_g), 0)::NUMERIC(7,2) AS total_protein_g,
  COALESCE(SUM(mi.carbs_g), 0)::NUMERIC(7,2) AS total_carbs_g,
  COALESCE(SUM(mi.fats_g), 0)::NUMERIC(7,2) AS total_fats_g,
  COUNT(mi.id)::INT AS item_count
FROM public.meals m
LEFT JOIN public.meal_items mi ON mi.meal_id = m.id
GROUP BY m.id;

-- View inherits RLS from underlying tables via security invoker (default)
```

---

## Phase 3 — Edge functions and client rewire

### 3.1 Edge functions

| Function | Change |
|---|---|
| `food-search` | On USDA hit, `upsert` each result into `foods` table (by `source='usda', source_ref=fdcId`). Return catalog rows (id, name, macros). Warmup ping requires auth. |
| `scan-barcode` | Upsert into `foods` by `barcode`. Return food row. |
| `analyze-meal` | Inside a single Postgres `rpc('create_meal_with_items', …)` call, insert `meals` + N `meal_items` atomically. Revert savepoint on any error. |
| `lookup-ingredient` | Same pattern; upsert into `foods` with `source='ai'`. |
| All others (`analyse-diet`, `meal-planner`, etc.) | Point reads at `meals_with_totals` view instead of `nutrition_logs`. |

### 3.2 Client hooks

| File | Change |
|---|---|
| `src/hooks/nutrition/useNutritionData.ts` | Replace `from("nutrition_logs")` with `from("meals_with_totals")` for list query. Separate `meal_items` fetch only when a row is expanded. |
| `src/hooks/nutrition/useMealOperations.ts` | Insert flow: create `meals` row → fan out to `meal_items`. Use RPC `create_meal_with_items` for atomicity + single round trip. |
| `src/lib/syncQueue.ts` | Queue record format extended: `{table: 'meals' \| 'meal_items', …}`. Migration drops any stuck pre-v2 queue rows at boot. |
| `src/components/nutrition/FoodSearchDialog.tsx` | Read from `foods` table directly for recents (last 50 `meal_items.name` distinct). Fallback to edge fn for unknown queries. |
| `src/pages/nutrition/types.ts` | New types: `Food`, `Meal`, `MealItem`, `MealWithTotals`. |

### 3.3 SyncQueue migration

On app boot, if localStorage syncQueue contains any entry with `table === 'nutrition_logs'`, drop them (log count). They cannot be written to the archived table.

---

---

## Phase 4 — Cross-feature compatibility (critical)

**Problem:** 17 client files + 1 edge function (`wizard-chat`) + generated DB types all read from `nutrition_logs` today. Renaming the table breaks them all.

**Strategy:** After archival, create a **read-only compatibility view** named `public.nutrition_logs` that projects one flat row per `meal_item`, preserving the legacy shape. Every read consumer continues to work untouched. Writers are migrated explicitly.

### 4.1 Compat view

```sql
-- Migration: 20260419040000_nutrition_logs_compat_view.sql
BEGIN;

CREATE VIEW public.nutrition_logs AS
SELECT
  mi.id,
  m.user_id,
  m.date,
  m.meal_type,
  m.meal_name,                                         -- header name for ad-hoc rows
  mi.calories::INT,
  mi.protein_g,
  mi.carbs_g,
  mi.fats_g,
  mi.grams AS portion_size_g,
  mi.name AS item_name,                                -- line item name
  NULL::TEXT AS portion_size,                          -- legacy text field
  NULL::TEXT AS recipe_notes,
  m.is_ai_generated,
  jsonb_build_array(                                   -- legacy ingredients shape
    jsonb_build_object('name', mi.name, 'grams', mi.grams)
  ) AS ingredients,
  m.created_at
FROM public.meals m
JOIN public.meal_items mi ON mi.meal_id = m.id;

-- Block writes with clear error; app must use new tables
CREATE RULE nutrition_logs_no_insert AS ON INSERT TO public.nutrition_logs
  DO INSTEAD NOTHING;   -- writers updated below; INSERT on view silently no-ops so stale code does no harm
CREATE RULE nutrition_logs_no_update AS ON UPDATE TO public.nutrition_logs DO INSTEAD NOTHING;
CREATE RULE nutrition_logs_no_delete AS ON DELETE TO public.nutrition_logs DO INSTEAD NOTHING;

COMMIT;
```

**Important:** View inherits RLS from `meals` (security-invoker by default in PG ≥ 15). Verify with policy test in Phase 4.3.

### 4.2 Read consumers (keep working via compat view, no changes required)

These 12 files read `nutrition_logs` and will continue to work unchanged through the compat view. They are updated opportunistically later to query `meals_with_totals` directly for perf:

- `src/pages/Dashboard.tsx` (reads today's totals)
- `src/hooks/useGamification.ts` (streak)
- `src/utils/baselineComputer.ts` (7-day rolling baselines)
- `src/lib/backgroundSync.ts` (adjacent-date preload)
- `src/hooks/nutrition/useQuickMealActions.ts` (yesterday's meals for repeat)
- `src/components/nutrition/FoodSearchDialog.tsx:108` (recents list)
- `src/components/DataResetDialog.tsx` (export CSV)
- Any other SELECT-only consumer

Verification test (tester agent): run each flow, confirm data renders identically.

### 4.3 Write consumers (must be migrated)

These 5 files WRITE to `nutrition_logs` and **must** be updated — INSERT on the view silently no-ops:

| File | Change |
|---|---|
| `src/hooks/nutrition/useMealOperations.ts` (5 insert paths + 1 update + 1 delete) | Replace `supabase.from("nutrition_logs").insert(...)` with RPC `create_meal_with_items({meal, items})`. Replace update/delete with direct ops on `meals` / `meal_items`. |
| `src/lib/batchOperations.ts` | Batch writer rewritten to create one `meals` row per batch + many `meal_items`. |
| `src/components/DataResetDialog.tsx:255` | Delete from `meals` (cascade wipes `meal_items`). |
| `src/lib/demoData.ts` | Demo seeder writes into new tables. |
| `supabase/functions/analyze-meal/*`, `scan-barcode/*`, `lookup-ingredient/*` | Covered in Phase 3.1. Use `create_meal_with_items` RPC. |

### 4.4 Realtime subscribers

| File | Change |
|---|---|
| `src/hooks/useMealsRealtime.ts` | Subscribe to BOTH `meals` and `meal_items`. Emit cache-invalidation event keyed by `meal.user_id + meal.date`. Item-level events look up parent via cached mapping to derive date. |
| `src/lib/pendingMeals.ts` | Heal logic updated: any syncQueue entry with `table === 'nutrition_logs'` is dropped at boot with a log (can't be replayed against archived table). New queue entries use `table === 'meals'` and `table === 'meal_items'`. |

### 4.5 Wizard chat (edge)

**File:** `supabase/functions/wizard-chat/index.ts:238`

```ts
// BEFORE
supabaseClient.from('nutrition_logs')
  .select('date, calories, protein_g, carbs_g, fats_g, meal_type, meal_name')
  .eq('user_id', user.id).gte('date', sevenDaysAgo)...

// AFTER — same shape, via compat view OR directly:
supabaseClient.from('meals_with_totals')
  .select('date, total_calories as calories, total_protein_g as protein_g, ' +
          'total_carbs_g as carbs_g, total_fats_g as fats_g, meal_type, meal_name')
  .eq('user_id', user.id).gte('date', sevenDaysAgo)...
```

Prefer `meals_with_totals` (one row per meal with aggregated macros) over the compat view (one row per meal_item) — the wizard prompt expects meal-level granularity.

Audit other edge functions for `nutrition_logs` reads: `analyse-diet`, `fight-week-analysis`, `meal-planner`, `daily-wisdom`, `rehydration-protocol`, `weight-tracker-analysis`. Any that reads nutrition data gets the same treatment — switch to `meals_with_totals`.

### 4.6 Generated types

**File:** `src/integrations/supabase/types.ts`

Regenerate after migrations via `npx supabase gen types typescript --local > src/integrations/supabase/types.ts`. New types for `meals`, `meal_items`, `foods`, `meals_with_totals`, plus the legacy `nutrition_logs` view. Replace all hand-cast `as any` on insert payloads with the new typed shape in `useMealOperations.ts`.

### 4.7 localCache keys

`localCache.setForDate(userId, "nutrition_logs", …)` uses `"nutrition_logs"` as a string key, not a table name. This stays — it's just a cache namespace. Migration code at boot (`src/lib/pendingMeals.ts` heal path) drops stuck queue entries; cache entries auto-refresh from DB on first load.

### 4.8 Acceptance test matrix (cross-feature)

| Feature | Test |
|---|---|
| Dashboard | Today's calorie summary matches Nutrition page exactly |
| Wizard chat | Ask coach "what did I eat yesterday?" — returns accurate meals |
| Gamification | Streak counter matches manual count of days with ≥1 meal |
| Diet analysis | "Analyze my diet" returns same data as pre-migration |
| Fight-week analysis | Weekly macro averages match |
| Meal planner | AI suggestions reference current-week eating patterns |
| Daily wisdom | "Today's tip" references current macros |
| CSV export (DataReset) | Exports all meals with correct totals |
| Demo data | Fresh demo user sees seeded meals on Nutrition + Dashboard |

---

## Testing Plan

**Frontend (tester agent):**
- Cold-load page (clear cache + refresh) → wheel fills within 8s
- Add meal via each of 4 paths → no "Untitled", correct section
- Search "chicken" → results within 2s, select → appears in correct section
- Offline add → online → meal syncs to DB, optimistic row reconciled
- Network throttle to 3G → wheel still renders target from cache, consumed updates on arrival

**Database (backend + security-architect):**
- RLS: user A cannot read user B's meals or meal_items
- RLS: user A cannot create meal_items pointing at user B's meal
- Foreign-key cascade: deleting a meal deletes all its meal_items
- `foods` catalog: anon users cannot write; authenticated can insert but not delete

**End-to-end:**
- All 8 streaming edge functions still function after schema swap
- NutritionCard share component renders correctly with new totals view

---

## Rollback

- Phase 1 changes are file-local and revertable via `git revert`.
- Phase 2 migration includes `nutrition_logs_v1` archive — data not lost. Down-migration script included that recreates `nutrition_logs` as a view over `meals_with_totals` if absolutely needed.
- Feature flag `VITE_NUTRITION_V2_ENABLED` gates client-side reads. Set to `false` to temporarily route back to `nutrition_logs_v1` (read-only, no adds).

---

## Acceptance Criteria

1. On hard refresh (10 consecutive attempts on iOS + web), the calorie wheel shows correct consumed/target within 8s on wifi, within 15s on 3G.
2. Across 50 meal additions (12–13 per input path), zero meals render as "Untitled" or land in the wrong section.
3. Food search returns results within 2s on known USDA items (warm isolate) and 5s on cold start.
4. `wc -l src/pages/nutrition/*.tsx` — every file under 500 lines.
5. Supabase logs show no 401s from `food-search` except legitimate anonymous requests.
6. Sentry logs show `coerceMealName` fallback fires zero times over a 7-day observation window.

---

## Swarm Dispatch

Single parallel message, hierarchical topology:

| Agent | Scope |
|---|---|
| `hierarchical-coordinator` | Enforces spec contract, gates merges |
| `backend-dev` | Phase 1.1 + 1.2, Phase 3.1 edge fn rewrites, RPC `create_meal_with_items` |
| `system-architect` | Phase 2 migrations (review + author), view definitions |
| `security-architect` | Phase 2 RLS policies, cross-tenant test suite |
| `coder` | Phase 1.3 + 1.4 + 1.5, Phase 3.2 client hooks |
| `tester` | Phase 1 & 3 smoke tests, cold-load matrix, 50-meal regression run |
| `reviewer` | Final diff review against this spec and CLAUDE.md rules |

All agents share the `nutrition-overhaul-v2` memory namespace.
