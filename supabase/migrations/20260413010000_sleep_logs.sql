-- Standalone sleep logging table (one entry per user per day)
create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  hours numeric not null check (hours >= 0 and hours <= 24),
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- RLS
alter table public.sleep_logs enable row level security;

create policy "Users can view own sleep logs"
  on public.sleep_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own sleep logs"
  on public.sleep_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sleep logs"
  on public.sleep_logs for update
  using (auth.uid() = user_id);

create policy "Users can delete own sleep logs"
  on public.sleep_logs for delete
  using (auth.uid() = user_id);

-- Index for efficient date-range queries
create index idx_sleep_logs_user_date on public.sleep_logs(user_id, date);
