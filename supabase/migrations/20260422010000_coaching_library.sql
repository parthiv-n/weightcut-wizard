-- Coaching Library: persistent per-discipline AI coaching insights
-- Each row is a snapshot of one Training Coach insight for one (user, session_type, fingerprint)
-- The fingerprint is the latest training session id at generation time, so a regeneration
-- triggered by a new logged session creates a new row instead of overwriting history.

create table if not exists public.coaching_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_type text not null,
  session_id uuid null,
  session_date date null,
  fingerprint text not null,
  insight_data jsonb not null,
  created_at timestamptz not null default now()
);

-- Idempotency: same user + discipline + fingerprint never written twice
create unique index if not exists coaching_library_user_type_fp_uniq
  on public.coaching_library (user_id, session_type, fingerprint);

-- Primary read pattern: one user's full library, newest first
create index if not exists coaching_library_user_created_idx
  on public.coaching_library (user_id, created_at desc);

-- Discipline-filtered chronological reads
create index if not exists coaching_library_user_type_created_idx
  on public.coaching_library (user_id, session_type, created_at desc);

alter table public.coaching_library enable row level security;

drop policy if exists "coaching_library_select_own" on public.coaching_library;
create policy "coaching_library_select_own"
  on public.coaching_library for select
  using (auth.uid() = user_id);

drop policy if exists "coaching_library_insert_own" on public.coaching_library;
create policy "coaching_library_insert_own"
  on public.coaching_library for insert
  with check (auth.uid() = user_id);

drop policy if exists "coaching_library_update_own" on public.coaching_library;
create policy "coaching_library_update_own"
  on public.coaching_library for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "coaching_library_delete_own" on public.coaching_library;
create policy "coaching_library_delete_own"
  on public.coaching_library for delete
  using (auth.uid() = user_id);
