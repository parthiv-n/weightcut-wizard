# App-wide resilience pattern: Fight Camp + Sleep/Recovery + Training Calendar + minor Gym

**Status:** Approved for implementation
**Date:** 2026-04-19
**Scope:** Apply the same resilience pattern (single-retry + useSafeAsync + cache-invalidate-on-mutate + no silent failures) across pages that show the reload-loop / skeleton-flash / error-toast symptoms. Skip pages that already apply the pattern.

---

## Problem

User reports: Fight Camp page constantly reloads, shows skeleton loaders, and surfaces "Error loading fight camps" toast. Other pages may have adjacent issues.

Investigation found:
- **FightCamps.tsx** lacks `useSafeAsync`; has a user-visible exponential retry loop (1 s → 2 s × 2); no cache invalidation on create/delete.
- **FightCampDetail.tsx** navigates away on error instead of falling back to stale cache.
- **RecoveryDashboard.tsx** has a `baselineLoadedRef` that doesn't reset on userId change (cross-account data leak) and three silent `.catch(() => {})` handlers.
- **Recovery.tsx** has no timeout wrapper, surfaces errors only via `logger.error` (no toast or fallback).
- **Sleep.tsx** has no TTL on the `sleep_logs` cache and no toast on fetch errors.
- **TrainingCalendar.tsx** inlined fetches aren't `useSafeAsync`-guarded; post-mutation refetch is not awaited; 28-day fetch failures are silent.
- **`fight_camp_calendar.bodyweight`** is declared in `types.ts` but missing from any migration. Any write touching the column would 400.
- **Gym Tracker**'s `gym_session_history` cache has no TTL; `useGymAnalytics` cache isn't invalidated on session create/delete.
- **Weight Tracker** and **Gym Tracker** otherwise already follow the pattern — no further changes needed.

---

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Scope | (A) Symptomatic fix across all affected pages; no realtime, no typed payload helpers. |
| Retry / error UX | (a) Single silent retry after ~2 s; stale cache stays on screen; toast only if retry ALSO fails AND cache is empty. |
| `bodyweight` column | (a) Add migration, bring DB in line with types. |
| Adjacent cleanup | (c) Include RecoveryDashboard (baselineLoadedRef reset + un-silence .catch handlers) and the cross-page pattern. |

---

## Shared resilience pattern

Each affected page should:

1. Wrap `setLoading`, `setData`, `setError` calls in `useSafeAsync` (or an equivalent `isMounted` guard for inlined fetches).
2. On first fetch failure: attempt one silent retry after ~2 s. Keep cached data on screen throughout. Show toast only when BOTH attempts fail AND no cache is present.
3. Never set `setLoading(true)` after initial mount — skeleton appears only on cold start (cache miss at mount).
4. Invalidate the relevant `localCache` key after every create / update / delete mutation and refetch silently.
5. Replace silent `.catch(() => {})` handlers with `logger.warn(...)` so failures are traceable.

---

## Per-page changes

### A. Fight Camp cluster

**Migration** — `supabase/migrations/20260419000000_add_fight_camp_calendar_bodyweight.sql`:

```sql
ALTER TABLE public.fight_camp_calendar
  ADD COLUMN IF NOT EXISTS bodyweight numeric;
```

**`src/pages/FightCamps.tsx`**:
- Add `useSafeAsync` import + wrap `setLoading`, `setCamps`, `setError` calls.
- Replace the exponential retry loop with a single silent retry after 2 s that does NOT call `setLoading(true)`.
- Toast only if both attempts fail AND `camps.length === 0`.
- Invalidate `localCache.remove(userId, 'fight_camps')` after create and delete, then refetch silently.

**`src/pages/FightCampDetail.tsx`**:
- On fetch error, if a cached entry exists under `localCache.get("shared", \`fight_camp_${id}\`)`, show it and don't nav-away.
- Only toast + nav-away when cache is empty.
- After update mutation, invalidate that cache entry.

**`src/components/fightcamp/RecoveryDashboard.tsx`**:
- Reset `baselineLoadedRef.current = false` when `userId` changes.
- Replace the three silent `.catch(() => {})` handlers (wellness, baseline, sleep queries) with `.catch(err => logger.warn("RecoveryDashboard: <name> failed", { err }))`.

### B. Sleep & Recovery

**`src/pages/Recovery.tsx`**:
- Wrap the fetch in `withSupabaseTimeout` and `useSafeAsync`-equivalent guard.
- On first failure, retry once silently after 2 s.
- Toast "Couldn't load recovery data" only when both attempts fail AND there's no cached data.

**`src/pages/Sleep.tsx`**:
- Add 24 h TTL to the `sleep_logs` cache read.
- Toast on persistent fetch error (currently silent `logger.error` only).

### C. Training Calendar

**`src/pages/TrainingCalendar.tsx`**:
- Add `useSafeAsync` / `isMounted` guard around the inlined `fetchSessions` and `fetch28DaySessions`.
- `await` the post-mutation refetch on save / delete.
- Surface the 28-day fetch failure with `logger.warn` (currently silent `.catch`).

### D. Gym Tracker (minimal)

**`src/hooks/gym/useGymSessions.ts`**:
- Add 24 h TTL to the `gym_session_history` cache read (`localCache.get<..>(userId, 'gym_session_history', 24 * 60 * 60 * 1000)`).

**`src/hooks/gym/useGymAnalytics.ts`**:
- After a session create/delete, invalidate `gym_exercise_history_*` keys for the affected exercises (hook into the existing completion path, or expose an `invalidate(userId)` function called from the completion site).

### E. Weight Tracker

No change. Already applies the pattern (useSafeAsync, withSupabaseTimeout + withRetry, optimistic + rollback, 24 h AI cache).

---

## Files touched

| Action | File |
|---|---|
| New | `supabase/migrations/20260419000000_add_fight_camp_calendar_bodyweight.sql` |
| Modified | `src/pages/FightCamps.tsx` |
| Modified | `src/pages/FightCampDetail.tsx` |
| Modified | `src/components/fightcamp/RecoveryDashboard.tsx` |
| Modified | `src/pages/Recovery.tsx` |
| Modified | `src/pages/Sleep.tsx` |
| Modified | `src/pages/TrainingCalendar.tsx` |
| Modified | `src/hooks/gym/useGymSessions.ts` |
| Modified | `src/hooks/gym/useGymAnalytics.ts` |

Untouched: `src/pages/WeightTracker.tsx`, `src/hooks/weight/*`, all edge functions, all other consumers.

---

## Non-goals

- No realtime subscriptions.
- No typed payload helpers.
- No pendingMeals-style queue.
- No changes to `SleepLogger.tsx` (already optimistic).
- No changes to `WeightTracker.tsx` or Weight Cut pages (already pattern-compliant).

---

## Rollout

Single branch, single PR. Migration is idempotent (`IF NOT EXISTS`). Zero impact on external consumers.

## Testing

Manual QA:
- FightCamps: force offline on mount → no loop, no toast spam, cached list shown.
- FightCampDetail: disconnect Wi-Fi before opening a camp → stale detail renders instead of nav-away.
- Recovery / Sleep: toggle airplane mode → clean fallback; reconnect → auto-refetch.
- Training Calendar: save a session while server is down → stays with stale data + toast once.
- Gym Tracker: log + finish a session → analytics screen shows fresh numbers on next open.
