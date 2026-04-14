# Sleep Logging Redesign — Spec

## Summary
Remove sleep logging from the training session form. Add a standalone daily sleep logger on the Dashboard (minimal, hours only). Create a dedicated Sleep chart page. Wire the performance engine to read from the new `sleep_logs` table.

## Database

New table `sleep_logs`:
```sql
create table public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  hours numeric not null check (hours >= 0 and hours <= 24),
  created_at timestamptz default now(),
  unique(user_id, date)
);
```
RLS: users read/write their own rows only. Upsert on `(user_id, date)` conflict.

The existing `fight_camp_calendar.sleep_hours` column is **not removed** — it stays for backward compatibility but is no longer written to or read from.

## Dashboard Sleep Widget

**Location:** After Daily Insight card, before gamification section.

**States:**
- **Not logged today:** Moon icon + "Log Sleep" + chevron. Card style matches other dashboard cards.
- **Tap to log:** Inline stepper expands (same +/- 0.5h pattern as old training form). Default value from `profiles.sleep_hours` or 7.5h. "Save" button collapses back.
- **Already logged:** Shows logged hours with moon icon + check. Tap to edit (reopens stepper).

**Data flow:** Optimistic update via `localCache`, upsert to Supabase in background. Cache key: `sleep_log_{YYYY-MM-DD}`.

## Sleep Chart Page

**Route:** `/sleep` (lazy-loaded)

**Components:**
- Line chart (Recharts `LineChart`) — hours over time, 7-8h recommended zone as shaded band
- Timeframe toggle: 1W / 1M / 3M (default 1M)
- Stats row: average, best night, worst night (3 columns)
- Cache-first via `localCache`, key `sleep_logs`

## Performance Engine Changes

`performanceEngine/helpers.ts` `getRecentSleepValues()` — receives sleep data from `sleep_logs` instead of extracting from training sessions.

`RecoveryDashboard.tsx` — fetches `sleep_logs` (28 days) alongside training sessions, passes both to engine.

## Training Form Removal

- `FightCampLogForm.tsx` — remove sleep input section and props
- `TrainingCalendar.tsx` — remove `sleepHours` state, remove from save payload and edit loading
