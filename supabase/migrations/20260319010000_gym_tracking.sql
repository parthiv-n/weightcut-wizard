-- Gym tracking: exercises, sessions, sets, PRs

-- 1. Exercise library
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('push','pull','legs','core','cardio','full_body')),
  muscle_group text not null check (muscle_group in ('chest','back','shoulders','biceps','triceps','quads','hamstrings','glutes','calves','abs','forearms','traps','full_body','cardio')),
  equipment text check (equipment in ('barbell','dumbbell','cable','machine','bodyweight','kettlebell','bands','none')),
  is_bodyweight boolean not null default false,
  is_custom boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_exercises_user on public.exercises(user_id);
create index idx_exercises_category on public.exercises(category);

-- RLS: everyone can read built-in + own custom; only own custom can be modified
alter table public.exercises enable row level security;

create policy "Anyone can read built-in exercises"
  on public.exercises for select
  using (user_id is null);

create policy "Users can read own custom exercises"
  on public.exercises for select
  using (auth.uid() = user_id);

create policy "Users can insert own custom exercises"
  on public.exercises for insert
  with check (auth.uid() = user_id and is_custom = true);

create policy "Users can update own custom exercises"
  on public.exercises for update
  using (auth.uid() = user_id and is_custom = true);

create policy "Users can delete own custom exercises"
  on public.exercises for delete
  using (auth.uid() = user_id and is_custom = true);

-- 2. Gym sessions
create table public.gym_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  session_type text not null check (session_type in ('Strength','Conditioning','Muay Thai S&C','Hypertrophy','Powerlifting','Circuit','Custom')),
  duration_minutes integer,
  notes text,
  perceived_fatigue integer check (perceived_fatigue between 1 and 10),
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_gym_sessions_user_date on public.gym_sessions(user_id, date desc);

alter table public.gym_sessions enable row level security;

create policy "Users can manage own gym sessions"
  on public.gym_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Gym sets
create table public.gym_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.gym_sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  set_order integer not null,
  exercise_order integer not null,
  weight_kg real,
  reps integer not null,
  rpe real check (rpe between 1 and 10),
  is_warmup boolean not null default false,
  is_bodyweight boolean not null default false,
  assisted_weight_kg real,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_gym_sets_session on public.gym_sets(session_id);
create index idx_gym_sets_exercise on public.gym_sets(exercise_id, user_id);
create index idx_gym_sets_user on public.gym_sets(user_id);

alter table public.gym_sets enable row level security;

create policy "Users can manage own gym sets"
  on public.gym_sets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Exercise PRs (denormalized cache)
create table public.exercise_prs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  max_weight_kg real,
  max_reps integer,
  max_volume real,
  estimated_1rm real,
  best_set_id uuid references public.gym_sets(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(user_id, exercise_id)
);

create index idx_exercise_prs_user on public.exercise_prs(user_id);

alter table public.exercise_prs enable row level security;

create policy "Users can manage own exercise PRs"
  on public.exercise_prs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Seed built-in exercises (user_id = NULL, is_custom = false)
insert into public.exercises (name, category, muscle_group, equipment, is_bodyweight) values
  -- Chest (Push)
  ('Barbell Bench Press', 'push', 'chest', 'barbell', false),
  ('Incline Barbell Bench Press', 'push', 'chest', 'barbell', false),
  ('Dumbbell Bench Press', 'push', 'chest', 'dumbbell', false),
  ('Incline Dumbbell Press', 'push', 'chest', 'dumbbell', false),
  ('Decline Bench Press', 'push', 'chest', 'barbell', false),
  ('Dumbbell Flyes', 'push', 'chest', 'dumbbell', false),
  ('Cable Flyes', 'push', 'chest', 'cable', false),
  ('Machine Chest Press', 'push', 'chest', 'machine', false),
  ('Push-Up', 'push', 'chest', 'bodyweight', true),
  ('Dips (Chest)', 'push', 'chest', 'bodyweight', true),
  -- Shoulders (Push)
  ('Overhead Press', 'push', 'shoulders', 'barbell', false),
  ('Dumbbell Shoulder Press', 'push', 'shoulders', 'dumbbell', false),
  ('Arnold Press', 'push', 'shoulders', 'dumbbell', false),
  ('Lateral Raise', 'push', 'shoulders', 'dumbbell', false),
  ('Cable Lateral Raise', 'push', 'shoulders', 'cable', false),
  ('Front Raise', 'push', 'shoulders', 'dumbbell', false),
  ('Face Pull', 'pull', 'shoulders', 'cable', false),
  ('Reverse Pec Deck', 'pull', 'shoulders', 'machine', false),
  ('Upright Row', 'push', 'shoulders', 'barbell', false),
  ('Machine Shoulder Press', 'push', 'shoulders', 'machine', false),
  -- Triceps (Push)
  ('Tricep Pushdown', 'push', 'triceps', 'cable', false),
  ('Overhead Tricep Extension', 'push', 'triceps', 'cable', false),
  ('Skull Crushers', 'push', 'triceps', 'barbell', false),
  ('Close-Grip Bench Press', 'push', 'triceps', 'barbell', false),
  ('Dips (Triceps)', 'push', 'triceps', 'bodyweight', true),
  ('Dumbbell Kickbacks', 'push', 'triceps', 'dumbbell', false),
  -- Back (Pull)
  ('Barbell Row', 'pull', 'back', 'barbell', false),
  ('Dumbbell Row', 'pull', 'back', 'dumbbell', false),
  ('Seated Cable Row', 'pull', 'back', 'cable', false),
  ('Lat Pulldown', 'pull', 'back', 'cable', false),
  ('Pull-Up', 'pull', 'back', 'bodyweight', true),
  ('Chin-Up', 'pull', 'back', 'bodyweight', true),
  ('T-Bar Row', 'pull', 'back', 'barbell', false),
  ('Pendlay Row', 'pull', 'back', 'barbell', false),
  ('Machine Row', 'pull', 'back', 'machine', false),
  ('Straight Arm Pulldown', 'pull', 'back', 'cable', false),
  -- Biceps (Pull)
  ('Barbell Curl', 'pull', 'biceps', 'barbell', false),
  ('Dumbbell Curl', 'pull', 'biceps', 'dumbbell', false),
  ('Hammer Curl', 'pull', 'biceps', 'dumbbell', false),
  ('Preacher Curl', 'pull', 'biceps', 'barbell', false),
  ('Cable Curl', 'pull', 'biceps', 'cable', false),
  ('Incline Dumbbell Curl', 'pull', 'biceps', 'dumbbell', false),
  ('Concentration Curl', 'pull', 'biceps', 'dumbbell', false),
  ('EZ-Bar Curl', 'pull', 'biceps', 'barbell', false),
  -- Traps (Pull)
  ('Barbell Shrug', 'pull', 'traps', 'barbell', false),
  ('Dumbbell Shrug', 'pull', 'traps', 'dumbbell', false),
  ('Rack Pull', 'pull', 'traps', 'barbell', false),
  -- Forearms (Pull)
  ('Wrist Curl', 'pull', 'forearms', 'barbell', false),
  ('Reverse Wrist Curl', 'pull', 'forearms', 'barbell', false),
  ('Farmer''s Walk', 'pull', 'forearms', 'dumbbell', false),
  -- Quads (Legs)
  ('Barbell Squat', 'legs', 'quads', 'barbell', false),
  ('Front Squat', 'legs', 'quads', 'barbell', false),
  ('Leg Press', 'legs', 'quads', 'machine', false),
  ('Leg Extension', 'legs', 'quads', 'machine', false),
  ('Hack Squat', 'legs', 'quads', 'machine', false),
  ('Bulgarian Split Squat', 'legs', 'quads', 'dumbbell', false),
  ('Goblet Squat', 'legs', 'quads', 'dumbbell', false),
  ('Lunges', 'legs', 'quads', 'dumbbell', false),
  ('Walking Lunges', 'legs', 'quads', 'dumbbell', false),
  ('Pistol Squat', 'legs', 'quads', 'bodyweight', true),
  -- Hamstrings (Legs)
  ('Romanian Deadlift', 'legs', 'hamstrings', 'barbell', false),
  ('Leg Curl', 'legs', 'hamstrings', 'machine', false),
  ('Stiff-Leg Deadlift', 'legs', 'hamstrings', 'barbell', false),
  ('Good Morning', 'legs', 'hamstrings', 'barbell', false),
  ('Nordic Hamstring Curl', 'legs', 'hamstrings', 'bodyweight', true),
  ('Dumbbell Romanian Deadlift', 'legs', 'hamstrings', 'dumbbell', false),
  -- Glutes (Legs)
  ('Hip Thrust', 'legs', 'glutes', 'barbell', false),
  ('Cable Kickback', 'legs', 'glutes', 'cable', false),
  ('Glute Bridge', 'legs', 'glutes', 'bodyweight', true),
  ('Sumo Deadlift', 'legs', 'glutes', 'barbell', false),
  -- Calves (Legs)
  ('Standing Calf Raise', 'legs', 'calves', 'machine', false),
  ('Seated Calf Raise', 'legs', 'calves', 'machine', false),
  ('Donkey Calf Raise', 'legs', 'calves', 'machine', false),
  -- Core
  ('Plank', 'core', 'abs', 'bodyweight', true),
  ('Hanging Leg Raise', 'core', 'abs', 'bodyweight', true),
  ('Cable Crunch', 'core', 'abs', 'cable', false),
  ('Ab Wheel Rollout', 'core', 'abs', 'none', false),
  ('Russian Twist', 'core', 'abs', 'none', false),
  ('Decline Sit-Up', 'core', 'abs', 'bodyweight', true),
  ('Pallof Press', 'core', 'abs', 'cable', false),
  ('Dragon Flag', 'core', 'abs', 'bodyweight', true),
  -- Full Body / Compound
  ('Deadlift', 'pull', 'back', 'barbell', false),
  ('Clean and Press', 'full_body', 'full_body', 'barbell', false),
  ('Kettlebell Swing', 'full_body', 'full_body', 'kettlebell', false),
  ('Thruster', 'full_body', 'full_body', 'barbell', false),
  ('Burpee', 'full_body', 'full_body', 'bodyweight', true);

-- updated_at trigger for gym_sessions
create or replace function public.update_gym_session_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_gym_sessions_updated_at
  before update on public.gym_sessions
  for each row execute function public.update_gym_session_timestamp();
