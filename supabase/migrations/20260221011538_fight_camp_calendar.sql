-- Create fight_camp_calendar table
create table public.fight_camp_calendar (
    id uuid not null default gen_random_uuid (),
    user_id uuid not null references auth.users (id) on delete cascade,
    date date not null,
    session_type text not null,
    duration_minutes integer not null,
    rpe integer not null check (rpe >= 1 and rpe <= 10),
    intensity text not null check (intensity in ('low', 'moderate', 'high')),
    soreness_level integer null check (soreness_level >= 0 and soreness_level <= 10),
    sleep_hours numeric null,
    created_at timestamp with time zone null default now(),
    constraint fight_camp_calendar_pkey primary key (id)
);

-- Enable RLS
alter table public.fight_camp_calendar enable row level security;

-- Create Policies
create policy "Users can view their own calendar entries"
    on public.fight_camp_calendar for select
    using (auth.uid() = user_id);

create policy "Users can insert their own calendar entries"
    on public.fight_camp_calendar for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own calendar entries"
    on public.fight_camp_calendar for update
    using (auth.uid() = user_id);

create policy "Users can delete their own calendar entries"
    on public.fight_camp_calendar for delete
    using (auth.uid() = user_id);
