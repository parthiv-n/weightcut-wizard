# Nutrition: Instant & Consistent (Option A)

**Status:** Approved for implementation
**Date:** 2026-04-18
**Scope:** Fix data-corruption bugs + make the Nutrition page feel instant. No schema restructure.

---

## Problem

The Nutrition page is the slowest and most inconsistent in the app:

1. **Skeleton loaders appear on nearly every visit** — even when data is cached.
2. **Food items occasionally disappear** at random.
3. **Food items lose their name** (display as "Untitled") and **migrate into the Snack column** regardless of their original meal type.
4. **Calorie totals change** without user action.
5. Multi-device edits are not reflected until a manual refresh.

---

## Root causes (from investigation, 2026-04-18)

- **Client-side partial writes.** `useNutritionData.ts:261` coerces pending inserts to `meal_type: p.meal_type || null`. A null arrives at the DB; the UI then groups `meal_type || 'snack'` into the Snack column and displays `meal_name || 'Untitled'`.
- **Spread-based payload construction.** `useMealOperations.ts` lines 78 / 141 / 384 use `...mealData`. Any caller that forgets a field silently omits it from the INSERT.
- **Silent drop in syncQueue.** After 5 retries, a failed sync is removed from `syncQueue` but remains in `localCache` → "ghost" items that later vanish when `localCache` is flushed.
- **Skeleton race.** `loadMeals()` sets `mealsLoading=true` even when cached data is present, because the 5-min memory cache TTL can expire between navigations. The skeleton flashes while localStorage is being hydrated.
- **No realtime on `nutrition_logs`.** The only realtime channel is on `profiles`. Every page that reads meals must poll or revalidate on visibility.
- **Historical corrupt rows.** Pre-existing rows with NULL `meal_type` / NULL `meal_name` will continue to exhibit the visible bug until backfilled.

---

## Decisions (Q&A)

| Decision | Choice | Rationale |
|---|---|---|
| Scope | A — surgical fix, no schema restructure | B/C buy maintainability, not user-facing performance. At 1k users, the DB layer is not the bottleneck. |
| Offline-sync UX | (a) User-driven recovery | Invisible data loss is unacceptable. A visible "pending" pill surfaces truth without interrupting flow. |
| Realtime scope | (b) Global subscription in `UserContext` | Enables cross-device live updates and cross-page consistency (Dashboard, gamification, Nutrition) with one multiplexed WS. |
| Skeleton policy | (a) Pure SWR + subtle syncing indicator | Skeleton only shows on the very first visit ever. All subsequent visits render cached data immediately; a subtle pulsing dot signals background activity. |
| Backfill for existing NULLs | `meal_type` by time-of-day inference; `meal_name` → `'Logged meal'` | Inference matches user intent; generic name is fine for rows that were already rendering as "Untitled". |

---

## Architecture (4 layers)

### 1. Database hardening

Single transactional migration: `supabase/migrations/20260418_nutrition_integrity.sql`.

```sql
BEGIN;

-- Backfill meal_type from created_at hour
UPDATE public.nutrition_logs
SET meal_type = CASE
  WHEN EXTRACT(HOUR FROM created_at) BETWEEN 4  AND 9  THEN 'breakfast'
  WHEN EXTRACT(HOUR FROM created_at) BETWEEN 10 AND 13 THEN 'lunch'
  WHEN EXTRACT(HOUR FROM created_at) BETWEEN 14 AND 16 THEN 'snack'
  WHEN EXTRACT(HOUR FROM created_at) BETWEEN 17 AND 21 THEN 'dinner'
  ELSE 'snack'
END
WHERE meal_type IS NULL;

-- Backfill meal_name
UPDATE public.nutrition_logs
SET meal_name = 'Logged meal'
WHERE meal_name IS NULL OR TRIM(meal_name) = '';

-- Add defaults + NOT NULL
ALTER TABLE public.nutrition_logs
  ALTER COLUMN meal_type  SET DEFAULT 'snack',
  ALTER COLUMN meal_type  SET NOT NULL,
  ALTER COLUMN meal_name  SET DEFAULT 'Logged meal',
  ALTER COLUMN meal_name  SET NOT NULL;

-- Enable realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.nutrition_logs;

COMMIT;
```

Existing CHECK constraint on `meal_type` values remains.
Existing RLS, indexes (`idx_nutrition_logs_user_date`, `idx_nutrition_logs_user_id`), and `updated_at` trigger are untouched.

### 2. Client write-path (typed, non-partial)

**New file:** `src/lib/buildMealPayload.ts`

```ts
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealInput {
  meal_name: string;          // required, non-empty
  meal_type: MealType;        // required, enumerated
  calories: number;           // required
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  portion_size?: string | null;
  recipe_notes?: string | null;
  ingredients?: unknown[] | null;
  is_ai_generated?: boolean;
}

export function buildMealPayload(args: {
  userId: string;
  date: string;
  input: MealInput;
  id?: string;
}): DbMealRow { /* … */ }
```

The helper is the *only* way to produce an insert payload. TypeScript enforces all required fields at call sites.

**Modifications:**
- `src/hooks/nutrition/useNutritionData.ts` — delete the `meal_type: p.meal_type || null` coercion.
- `src/hooks/nutrition/useMealOperations.ts` — replace `...mealData` spreads (lines 78, 141, 384) with `buildMealPayload({ userId, date, input })`.
- `src/hooks/nutrition/useQuickMealActions.ts` — same replacement; `"snack"` fallback kept but logs a warning via `logger.warn` so hidden bugs surface.

### 3. `pendingMeals` — persistent queue with state machine

**New file:** `src/lib/pendingMeals.ts` (replaces silent behavior of `syncQueue.ts`).

State per entry: `pending → syncing → synced` or `→ failed`.

Behavior:
- Persistent in localStorage; survives restarts.
- Replayed on app start.
- Retry with exponential backoff: 2s, 4s, 8s, 16s, 30s, 60s (capped).
- `failed` state reached after 6 consecutive errors — *still retained*, surfaces in UI.
- On `synced`, removed from store.

**`localCache` hydration consistency:**
After a successful DB fetch, reconcile cache:
- If a cached row is not in the DB response *and* not in `pendingMeals` → drop it.
- This eliminates ghost items and stale "Untitled" rows.

**UI:** `src/components/nutrition/PendingSyncPill.tsx`
- Renders in the Nutrition page header when `pendingMeals.length > 0`.
- Tap opens a sheet: per-item retry, per-item delete, "retry all".
- Accessible (role=status, aria-live=polite).

### 4. Realtime + SWR

**New hook:** `src/hooks/useMealsRealtime.ts`

```ts
// Mounted once in UserContext when a user is authenticated.
supabase
  .channel(`meals:${userId}`)
  .on("postgres_changes",
      { event: "*", schema: "public", table: "nutrition_logs",
        filter: `user_id=eq.${userId}` },
      handler)
  .subscribe();
```

Handler dispatches into `nutritionCache`:
- `INSERT` → cache the row under its date key.
- `UPDATE` → replace by id.
- `DELETE` → remove by id.

Cache consumers (Nutrition, Dashboard frequent-meals, gamification streak, baselineComputer) subscribe to cache change events and re-derive their views. No manual invalidation needed.

**SWR policy in `loadMeals()`:**
- If `mealsRef.current.length > 0` OR `localCache.has(...)` → never set `mealsLoading=true`.
- Skeleton is reachable only when **no** cached rows exist for the date (cold start).
- Subtle syncing indicator (`src/components/SyncingIndicator.tsx`) pulses in the header when a background fetch or pending sync is active.

**Fallback:** if the realtime channel disconnects, visibility-based revalidation (already implemented) remains as a safety net.

**Cache TTL:** raised from 5 min to 30 min. Realtime is the primary freshness mechanism; TTL is only a sanity backstop for tabs that miss realtime events.

---

## Files touched

**New**
- `supabase/migrations/20260418_nutrition_integrity.sql`
- `src/lib/buildMealPayload.ts`
- `src/lib/pendingMeals.ts`
- `src/hooks/useMealsRealtime.ts`
- `src/components/nutrition/PendingSyncPill.tsx`
- `src/components/SyncingIndicator.tsx`

**Modified**
- `src/contexts/UserContext.tsx` — mount `useMealsRealtime`.
- `src/hooks/nutrition/useNutritionData.ts` — SWR policy, remove coercion, subscribe to cache events.
- `src/hooks/nutrition/useMealOperations.ts` — typed writes via helper; route through `pendingMeals`.
- `src/hooks/nutrition/useQuickMealActions.ts` — typed writes via helper.
- `src/lib/nutritionCache.ts` — accept realtime events, emit change events, TTL → 30 min.
- `src/lib/backgroundSync.ts` — retire overlapping responsibilities; single queue via `pendingMeals`.
- `src/pages/Nutrition.tsx` — render `PendingSyncPill` + `SyncingIndicator`.

**Untouched (backward compatible)**
- All 6 edge functions (`wizard-chat`, `analyse-diet`, `meal-planner`, `weight-tracker-analysis`, `rehydration-protocol`, `generate-cut-plan`).
- Dashboard frequent-meals, `FoodSearchDialog`, `baselineComputer`, gamification streak — same `from('nutrition_logs')` query shapes.

---

## Edge cases

- **Offline insert** → optimistic cache update + `pendingMeals` entry + pill. No loss.
- **Multi-device** → realtime propagates within ~200 ms.
- **Realtime disconnects** → visibility polling kicks in.
- **Migration failure** → transactional; rolls back automatically.
- **Very old rows with NULL `meal_type`** → time-of-day inference in the backfill; deterministic.
- **Large client cache divergence** → hydration reconciliation drops any cached row not in DB and not in `pendingMeals`.

---

## Testing

**Unit**
- `buildMealPayload` — TypeScript rejects partial inputs at compile time.
- `pendingMeals` — state transitions, exponential backoff, persistence across restart.
- `nutritionCache` — realtime event application (INSERT/UPDATE/DELETE).

**Integration**
- Insert on one session → realtime propagates to another session's cache within 500 ms.
- Offline insert → reconnect → auto-syncs and cache converges.
- Ghost-item scenario → localCache contains a row not in DB → hydration drops it.

**Migration**
- Apply to a staging DB seeded with NULL rows. Verify: row count unchanged, zero NULLs remain, time-of-day inference matches expectations.

**Manual (production-like)**
- Fresh install → Nutrition shows skeleton once, then never again in the session.
- Navigate away and back → no skeleton.
- Log a meal offline → pill appears → reconnect → pill clears.

---

## Rollout

- Single PR, single deploy. Migration and client code ship together.
- No feature flag.
- Pre-deploy: run migration on staging, verify row counts and zero NULLs.
- Post-deploy: monitor Sentry/error logs for `buildMealPayload` type issues that surface previously hidden callers.

## Non-goals

- No schema restructure (no `meals`/`meal_items` split).
- No materialized `daily_nutrition_totals` table.
- No change to edge-function prompts or read paths.
- No UI redesign of the Nutrition page beyond the two new indicator components.
