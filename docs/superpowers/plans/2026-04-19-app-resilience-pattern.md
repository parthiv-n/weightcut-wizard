# App-wide resilience pattern — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Apply a consistent retry + useSafeAsync + cache-invalidate-on-mutate + no-silent-failures pattern to pages that are flaky (Fight Camp, Sleep, Recovery, Training Calendar) plus a minor tune on Gym Tracker. Leave Weight Tracker alone (already pattern-compliant).

**Spec:** `docs/superpowers/specs/2026-04-19-app-resilience-pattern-design.md`

**Branch:** `ui-change-nonvibecode` (same branch as nutrition fix).

---

## Task 1: Migration — add `fight_camp_calendar.bodyweight`

- [ ] Create `supabase/migrations/20260419000000_add_fight_camp_calendar_bodyweight.sql`:

```sql
ALTER TABLE public.fight_camp_calendar
  ADD COLUMN IF NOT EXISTS bodyweight numeric;
```

- [ ] Commit:
```bash
git add supabase/migrations/20260419000000_add_fight_camp_calendar_bodyweight.sql
git commit -m "feat(calendar): add fight_camp_calendar.bodyweight column

Aligns DB with types.ts which already declares the column. Idempotent.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 2: Fix `FightCamps.tsx` — retry + useSafeAsync + invalidate

**File:** `src/pages/FightCamps.tsx`.

### Step 1: Add useSafeAsync import

At the top of the file (near other `@/hooks/*` imports) add:
```tsx
import { useSafeAsync } from "@/hooks/useSafeAsync";
```

### Step 2: Inside the component body, after existing useState hooks

Add, immediately after `const navigate = useNavigate();`:
```tsx
  const { safeAsync, isMounted } = useSafeAsync();
```

### Step 3: Replace `fetchCamps` body

Replace the entire `fetchCamps` function (currently lines 67-115) with:

```tsx
  const fetchCamps = async (isRetry = false) => {
    if (!userId) return;

    const cached = localCache.get<FightCamp[]>(userId, 'fight_camps', 30 * 60 * 1000);
    if (cached) {
      safeAsync(setCamps)(cached);
      safeAsync(setLoading)(false);
    }

    try {
      const { data, error } = await withSupabaseTimeout(
        supabase
          .from("fight_camps")
          .select("id, name, event_name, fight_date, profile_pic_url, is_completed, starting_weight_kg, end_weight_kg, total_weight_cut, weight_via_dehydration, weight_via_carb_reduction, weigh_in_timing")
          .eq("user_id", userId)
          .order("fight_date", { ascending: false })
          .limit(50),
        undefined,
        "Load fight camps"
      );

      if (!isMounted()) return;

      if (error) throw error;

      safeAsync(setCamps)((data || []) as FightCamp[]);
      localCache.set(userId, 'fight_camps', data || []);
    } catch (error) {
      logger.warn("Error loading fight camps", { error });

      if (!isRetry) {
        // Single silent retry after 2s; cache stays on screen
        setTimeout(() => { if (isMounted()) fetchCamps(true); }, 2000);
        return;
      }

      // Retry also failed — only toast if nothing is showing
      if (!cached) {
        if (isMounted()) {
          toast({ title: "Couldn't load fight camps", description: "Check your connection and try again.", variant: "destructive" });
        }
      }
    } finally {
      safeAsync(setLoading)(false);
    }
  };
```

### Step 4: Invalidate cache after create + delete

In `handleCreateCamp`, replace `fetchCamps();` at the end with:
```tsx
      localCache.remove(userId, 'fight_camps');
      fetchCamps();
```

In `handleDeleteCamp`, after successful delete (wherever `fetchCamps` or equivalent is called, or at the end of the success path), add:
```tsx
      localCache.remove(userId, 'fight_camps');
```
…before the refetch or optimistic list update.

### Step 5: Verify + commit

- [ ] `npm run build`
- [ ] Commit:
```bash
git add src/pages/FightCamps.tsx
git commit -m "fix(fight-camp): useSafeAsync + single-retry + invalidate-on-mutate

Stops the toast-spam + skeleton-flash loop. One silent retry on fetch
failure; stale cache stays on screen; toast only when retry fails AND
cache is empty. Invalidate cache after create/delete.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 3: Fix `FightCampDetail.tsx` — stale cache fallback + invalidate

**File:** `src/pages/FightCampDetail.tsx`. Already uses `useSafeAsync`.

### Step 1: Read the current error path

Read lines 70-100 of the file. Look for the `.catch` or error handler where the page currently shows a toast and navigates away.

### Step 2: Replace the error path

Where the code currently runs something like:
```tsx
} catch (err) {
  toast({ title: "Error", description: "Failed to load fight camp", variant: "destructive" });
  navigate('/fight-camps');
}
```

Replace with:
```tsx
} catch (err) {
  logger.warn("Error loading fight camp", { err });
  // Fall back to stale cache if we have it — don't nav-away if the user has something to see
  const cached = localCache.get<any>("shared", `fight_camp_${id}`, 10 * 60 * 1000);
  if (cached) {
    if (isMounted()) setCamp(cached);
    return;
  }
  if (isMounted()) {
    toast({ title: "Error", description: "Failed to load fight camp", variant: "destructive" });
    navigate('/fight-camps');
  }
}
```

(Use the exact `setCamp` / state-setter name that exists in the file; the agent should read the file to confirm.)

### Step 3: Invalidate cache after update mutation

Find the save/update handler on this page. At the success path, before or after the existing state update, add:
```tsx
      localCache.remove("shared", `fight_camp_${id}`);
```

### Step 4: Verify + commit

- [ ] `npm run build`
- [ ] Commit:
```bash
git add src/pages/FightCampDetail.tsx
git commit -m "fix(fight-camp): stale-cache fallback on detail load error

Don't navigate away when the network fetch fails if we have cached
data for this camp. Invalidate cache after update mutations.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 4: Fix `RecoveryDashboard.tsx` — baselineLoadedRef + un-silence catches

**File:** `src/components/fightcamp/RecoveryDashboard.tsx`.

### Step 1: Reset `baselineLoadedRef` on userId change

Find the declaration of `baselineLoadedRef` (around line 94-96). Immediately after the `useRef` declarations, add a new `useEffect` that resets it when `userId` changes:

```tsx
  useEffect(() => {
    baselineLoadedRef.current = false;
  }, [userId]);
```

### Step 2: Replace silent `.catch(() => {})` handlers

Find the three background queries around lines 104-137 (wellness, checkInDays/baseline, sleepLogs). Each has a chain ending with `.catch(() => {})`. Replace each with a `logger.warn` that labels which query failed. Ensure `logger` is imported at the top.

Example:
```tsx
.catch(err => logger.warn("RecoveryDashboard: wellness fetch failed", { err }))
```

Do the same for the baseline query (label it "baseline fetch failed") and the sleep query ("sleep fetch failed"). Use the current query name/purpose to label each one.

### Step 3: Verify + commit

- [ ] `npm run build`
- [ ] Commit:
```bash
git add src/components/fightcamp/RecoveryDashboard.tsx
git commit -m "fix(fight-camp): reset baselineLoadedRef on userId change + log silent failures

Fixes a cross-account data-leak where baseline wouldn't reload after
user switch. Replaces three silent .catch(()=>{}) handlers with
logger.warn so failures are traceable.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 5: Fix `Recovery.tsx` — timeout + retry + useSafeAsync

**File:** `src/pages/Recovery.tsx`.

### Step 1: Ensure imports

Verify these imports exist at the top (add any that are missing):
```tsx
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { logger } from "@/lib/logger";
```

### Step 2: Use the hook inside the component

Add to the component body:
```tsx
  const { safeAsync, isMounted } = useSafeAsync();
```

### Step 3: Wrap the query in `withSupabaseTimeout` + add single silent retry

Find the inline Supabase query inside the page's effect or fetch function (the one that reads `fight_camp_calendar`). Wrap it like:

```tsx
const fetchSessions = async (isRetry = false) => {
  if (!userId) return;
  try {
    const { data, error } = await withSupabaseTimeout(
      supabase.from('fight_camp_calendar')
        .select('*')
        .eq('user_id', userId)
        .gte('date', from)
        .lte('date', to)
        .limit(100),
      undefined,
      "Load recovery sessions"
    );
    if (!isMounted()) return;
    if (error) throw error;
    safeAsync(setSessions)(data || []);
    // existing cache write, if any
  } catch (err) {
    logger.warn("Error loading recovery sessions", { err });
    if (!isRetry) {
      setTimeout(() => { if (isMounted()) fetchSessions(true); }, 2000);
      return;
    }
    if (isMounted() && (!sessions || sessions.length === 0)) {
      toast({ title: "Couldn't load recovery data", description: "Check your connection and try again.", variant: "destructive" });
    }
  }
};
```

Use the exact state-setter name present in the file (`setSessions` or similar). Preserve any existing cache-write logic.

### Step 4: Verify + commit

- [ ] `npm run build`
- [ ] Commit:
```bash
git add src/pages/Recovery.tsx
git commit -m "fix(recovery): timeout + silent retry + useSafeAsync

Brings the Recovery page up to the app-wide resilience pattern.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 6: Fix `Sleep.tsx` — cache TTL + error toast

**File:** `src/pages/Sleep.tsx`.

### Step 1: Add 24 h TTL to the sleep_logs cache read

Find the line that reads `localCache.get<Meal[] | any[]>(userId, "sleep_logs")` (no TTL argument) and change it to pass `24 * 60 * 60 * 1000` as the third argument.

Example:
```tsx
const cached = localCache.get<any[]>(userId, "sleep_logs", 24 * 60 * 60 * 1000) || [];
```

### Step 2: Toast on persistent fetch error

In the `.catch` / error block around the sleep fetch, after the existing `logger.error(...)`, add:

```tsx
toast({ title: "Couldn't load sleep data", description: "Check your connection.", variant: "destructive" });
```

Ensure `toast` is imported (from `@/hooks/use-toast` or wherever the project imports it). If not already imported, add the import.

### Step 3: Verify + commit

- [ ] `npm run build`
- [ ] Commit:
```bash
git add src/pages/Sleep.tsx
git commit -m "fix(sleep): 24h cache TTL + user-visible error toast

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 7: Fix `TrainingCalendar.tsx` — safe-guard + await refetch + surface silent failures

**File:** `src/pages/TrainingCalendar.tsx`.

### Step 1: Add `useSafeAsync` guard

Add:
```tsx
import { useSafeAsync } from "@/hooks/useSafeAsync";
```
in imports, and inside the component body:
```tsx
const { safeAsync, isMounted } = useSafeAsync();
```

### Step 2: Guard state setters in inlined fetches

Replace direct `setSessions(...)`, `setLoading(false)` calls inside `fetchSessions` and `fetch28DaySessions` with `safeAsync(setSessions)(...)`, `safeAsync(setLoading)(false)`.

Guard the error-toast paths with `if (!isMounted()) return;` before calling `toast(...)`.

### Step 3: Await the post-mutation refetch

Find the save/delete success path. Wherever the code currently has:
```tsx
fetchSessions();
fetch28DaySessions();
```
change to:
```tsx
await Promise.all([fetchSessions(), fetch28DaySessions()]);
```

### Step 4: Un-silence the 28-day fetch catch

Find the `.catch(() => {})` or silent catch inside `fetch28DaySessions`. Replace with:
```tsx
.catch(err => logger.warn("TrainingCalendar: 28-day fetch failed", { err }))
```

Ensure `logger` is imported.

### Step 5: Verify + commit

- [ ] `npm run build`
- [ ] Commit:
```bash
git add src/pages/TrainingCalendar.tsx
git commit -m "fix(calendar): safe-async guards + await refetch + log silent failures

Brings Training Calendar up to the app-wide resilience pattern.

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 8: Minor Gym Tracker tune — cache TTL + analytics invalidation

### Part A: Add TTL to gym_session_history cache

**File:** `src/hooks/gym/useGymSessions.ts`. Find the `localCache.get(userId, 'gym_session_history')` call and add a 24 h TTL argument: `localCache.get(userId, 'gym_session_history', 24 * 60 * 60 * 1000)`.

### Part B: Invalidate analytics cache on session create/delete

**File:** `src/hooks/gym/useGymAnalytics.ts`. Expose a helper (e.g., `invalidate(userId)`) that removes the cached keys whose prefix is `gym_exercise_history_`. Example:

```tsx
export function invalidateGymAnalytics(userId: string) {
  if (typeof window === 'undefined') return;
  const prefix = `wcw_${userId}_gym_exercise_history_`;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) localStorage.removeItem(key);
  }
}
```

In `src/hooks/gym/useGymSessions.ts`, import this helper and call it after a session is finished or deleted (inside the success paths for `finishSession` and `deleteSession`).

### Step: Verify + commit

- [ ] `npm run build`
- [ ] Commit:
```bash
git add src/hooks/gym/useGymSessions.ts src/hooks/gym/useGymAnalytics.ts
git commit -m "fix(gym): 24h TTL on session-history cache + invalidate analytics on mutate

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Self-review

Each task's changes are independent and can be reviewed/merged incrementally. All edits are:
- Additive (imports, new catch handling, guards) or
- Narrow replacements (one function body, one error path)

Spec coverage:
- Migration ✓ (Task 1)
- FightCamps pattern (Task 2)
- FightCampDetail pattern (Task 3)
- RecoveryDashboard fixes (Task 4)
- Recovery page pattern (Task 5)
- Sleep page pattern (Task 6)
- TrainingCalendar pattern (Task 7)
- Gym Tracker minor tune (Task 8)
- Weight Tracker: intentionally untouched (already pattern-compliant)
