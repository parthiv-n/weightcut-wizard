-- AI Decision Log
-- Foundation for adaptive plans, predictive alarms, and pattern detection.
-- Every AI feature can write a row here capturing the input snapshot used,
-- the parsed output, and (optionally) structured prediction facts that a
-- nightly reconciler can later compare against actual outcomes.

create table if not exists public.ai_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null,                    -- 'generate-cut-plan', 'meal-planner', etc.
  input_snapshot jsonb not null,            -- the AthleteSnapshot used
  output_json jsonb not null,               -- raw AI response (parsed)
  prediction_facts jsonb,                   -- structured: { predicted_kcal, predicted_loss_per_week_kg, ... }
  model text,                               -- groq model id
  created_at timestamptz not null default now(),
  outcome_logged_at timestamptz,            -- when we measured actual outcome
  actual_outcome jsonb,                     -- { actual_kcal_avg, actual_loss_per_week_kg, ... }
  error_pct numeric,                        -- |predicted - actual| / predicted, computed in TS
  user_accepted boolean,                    -- did user keep the plan?
  user_rating int                           -- optional 1-5
);

-- Most-recent decisions per user/feature for "last time you said X" context injection.
create index if not exists idx_ai_decisions_user_feature_recent
  on public.ai_decisions (user_id, feature, created_at desc);

-- Reconciler scan: rows still awaiting outcome measurement.
create index if not exists idx_ai_decisions_outcome_pending
  on public.ai_decisions (user_id)
  where outcome_logged_at is null;

alter table public.ai_decisions enable row level security;

-- Users may read, insert, and update their own decisions.
drop policy if exists "users read own decisions" on public.ai_decisions;
create policy "users read own decisions"
  on public.ai_decisions
  for select
  using (user_id = (select auth.uid()));

drop policy if exists "users insert own decisions" on public.ai_decisions;
create policy "users insert own decisions"
  on public.ai_decisions
  for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "users update own decisions" on public.ai_decisions;
create policy "users update own decisions"
  on public.ai_decisions
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Service role (cron / reconciler) gets full access for outcome backfill.
drop policy if exists "service role full access" on public.ai_decisions;
create policy "service role full access"
  on public.ai_decisions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
