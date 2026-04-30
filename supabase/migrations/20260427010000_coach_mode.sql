-- Coach Mode: gyms, gym_members, role flag, RLS for coach→athlete reads
-- ----------------------------------------------------------------------
-- Adds:
--   profiles.role         'fighter' (default) | 'coach'
--   gyms                  one row per gym, owned by a coach
--   gym_members           link athletes ↔ gym, with share_data toggle
-- RLS: coaches can SELECT athletes' weight_logs / meals_with_totals /
-- profiles for any athlete in their gym whose share_data = true.

-- ── 1. Role column on profiles ────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'fighter'
  CHECK (role IN ('fighter', 'coach'));

CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);

-- ── 2. Gyms ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gyms_owner_idx ON public.gyms(owner_user_id);
CREATE INDEX IF NOT EXISTS gyms_invite_code_idx ON public.gyms(invite_code);

-- Generate a unique 6-char invite code (uppercase alphanumeric, no ambiguous chars)
CREATE OR REPLACE FUNCTION public.generate_gym_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no I, L, O, 0, 1
  code TEXT;
  i INT;
  attempts INT := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.gyms WHERE invite_code = code);
    attempts := attempts + 1;
    IF attempts > 50 THEN
      RAISE EXCEPTION 'Could not generate unique invite code after 50 attempts';
    END IF;
  END LOOP;
  RETURN code;
END $$;

-- ── 3. Gym membership ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gym_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'athlete' CHECK (member_role IN ('coach', 'athlete')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'removed')),
  share_data BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gym_id, user_id)
);

CREATE INDEX IF NOT EXISTS gym_members_gym_idx ON public.gym_members(gym_id);
CREATE INDEX IF NOT EXISTS gym_members_user_idx ON public.gym_members(user_id);
CREATE INDEX IF NOT EXISTS gym_members_active_idx ON public.gym_members(gym_id, status) WHERE status = 'active';

-- ── 4. RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_members ENABLE ROW LEVEL SECURITY;

-- Gyms: owner can do everything; members can read their gym; anyone can read by invite code (handled in app via .eq filter, RLS allows it)
DROP POLICY IF EXISTS gyms_owner_all ON public.gyms;
CREATE POLICY gyms_owner_all ON public.gyms
  FOR ALL TO authenticated
  USING (owner_user_id = (SELECT auth.uid()))
  WITH CHECK (owner_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS gyms_member_read ON public.gyms;
CREATE POLICY gyms_member_read ON public.gyms
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_members
      WHERE gym_members.gym_id = gyms.id
        AND gym_members.user_id = (SELECT auth.uid())
        AND gym_members.status = 'active'
    )
  );

-- Allow lookup-by-invite-code for joining (read-only, single row at a time in the app)
DROP POLICY IF EXISTS gyms_lookup_by_invite ON public.gyms;
CREATE POLICY gyms_lookup_by_invite ON public.gyms
  FOR SELECT TO authenticated
  USING (true);  -- relies on .eq("invite_code", ...) filter in the app; gyms info is non-sensitive

-- Gym members: user can read own membership rows; coach (gym owner) can read all members of their gym; user can insert their own join row; coach can update/delete members
DROP POLICY IF EXISTS gym_members_self_read ON public.gym_members;
CREATE POLICY gym_members_self_read ON public.gym_members
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS gym_members_coach_read ON public.gym_members;
CREATE POLICY gym_members_coach_read ON public.gym_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms
      WHERE gyms.id = gym_members.gym_id
        AND gyms.owner_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS gym_members_self_join ON public.gym_members;
CREATE POLICY gym_members_self_join ON public.gym_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS gym_members_self_update ON public.gym_members;
CREATE POLICY gym_members_self_update ON public.gym_members
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS gym_members_coach_manage ON public.gym_members;
CREATE POLICY gym_members_coach_manage ON public.gym_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gyms
      WHERE gyms.id = gym_members.gym_id
        AND gyms.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gyms
      WHERE gyms.id = gym_members.gym_id
        AND gyms.owner_user_id = (SELECT auth.uid())
    )
  );

-- ── 5. Coach read access to athlete data ──────────────────────────────
-- Helper: is `target_user` a sharing athlete in any gym owned by `coach`?
CREATE OR REPLACE FUNCTION public.coach_can_view_athlete(coach UUID, target_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.gym_members gm
    JOIN public.gyms g ON g.id = gm.gym_id
    WHERE g.owner_user_id = coach
      AND gm.user_id = target_user
      AND gm.status = 'active'
      AND gm.share_data = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.coach_can_view_athlete(UUID, UUID) TO authenticated;

-- Profiles: coaches in same gym can read athlete profile (sharing)
DROP POLICY IF EXISTS profiles_coach_read ON public.profiles;
CREATE POLICY profiles_coach_read ON public.profiles
  FOR SELECT TO authenticated
  USING (public.coach_can_view_athlete((SELECT auth.uid()), profiles.id));

-- Weight logs
DROP POLICY IF EXISTS weight_logs_coach_read ON public.weight_logs;
CREATE POLICY weight_logs_coach_read ON public.weight_logs
  FOR SELECT TO authenticated
  USING (public.coach_can_view_athlete((SELECT auth.uid()), weight_logs.user_id));

-- Meals
DROP POLICY IF EXISTS meals_coach_read ON public.meals;
CREATE POLICY meals_coach_read ON public.meals
  FOR SELECT TO authenticated
  USING (public.coach_can_view_athlete((SELECT auth.uid()), meals.user_id));

-- Sleep logs (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sleep_logs') THEN
    EXECUTE 'DROP POLICY IF EXISTS sleep_logs_coach_read ON public.sleep_logs';
    EXECUTE 'CREATE POLICY sleep_logs_coach_read ON public.sleep_logs FOR SELECT TO authenticated USING (public.coach_can_view_athlete((SELECT auth.uid()), sleep_logs.user_id))';
  END IF;
END $$;

-- Training sessions (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'training_sessions') THEN
    EXECUTE 'DROP POLICY IF EXISTS training_sessions_coach_read ON public.training_sessions';
    EXECUTE 'CREATE POLICY training_sessions_coach_read ON public.training_sessions FOR SELECT TO authenticated USING (public.coach_can_view_athlete((SELECT auth.uid()), training_sessions.user_id))';
  END IF;
END $$;

-- ── 6. Coach dashboard aggregate (single round-trip per coach load) ──
-- Returns one row per athlete in the coach's gyms with latest weight,
-- target, today's calories, last log date, sleep avg (7d). One call,
-- indexed via gym_members(gym_id, status) and weight_logs(user_id, date desc).
CREATE OR REPLACE FUNCTION public.coach_athletes_overview(p_coach_id UUID)
RETURNS TABLE (
  user_id UUID,
  gym_id UUID,
  gym_name TEXT,
  display_name TEXT,
  avatar_url TEXT,
  goal_type TEXT,
  current_weight_kg NUMERIC,
  goal_weight_kg NUMERIC,
  fight_week_target_kg NUMERIC,
  target_date DATE,
  last_weight_at DATE,
  todays_calories NUMERIC,
  daily_calorie_goal NUMERIC,
  last_meal_at TIMESTAMPTZ,
  share_data BOOLEAN,
  joined_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH coach_gyms AS (
    SELECT id, name FROM public.gyms WHERE owner_user_id = p_coach_id
  ),
  members AS (
    SELECT gm.user_id, gm.gym_id, gm.share_data, gm.joined_at, cg.name AS gym_name
    FROM public.gym_members gm
    JOIN coach_gyms cg ON cg.id = gm.gym_id
    WHERE gm.status = 'active' AND gm.member_role = 'athlete'
  ),
  latest_weight AS (
    SELECT DISTINCT ON (user_id) user_id, weight_kg, date
    FROM public.weight_logs
    WHERE user_id IN (SELECT user_id FROM members)
    ORDER BY user_id, date DESC
  ),
  todays_meals AS (
    SELECT user_id, COALESCE(SUM(total_calories), 0) AS cals, MAX(created_at) AS last_at
    FROM public.meals_with_totals
    WHERE user_id IN (SELECT user_id FROM members)
      AND created_at::date = CURRENT_DATE
    GROUP BY user_id
  )
  SELECT
    m.user_id,
    m.gym_id,
    m.gym_name,
    COALESCE(p.athlete_type, 'Athlete') AS display_name,
    p.avatar_url,
    p.goal_type,
    COALESCE(lw.weight_kg, p.current_weight_kg) AS current_weight_kg,
    p.goal_weight_kg,
    p.fight_week_target_kg,
    p.target_date::date,
    lw.date AS last_weight_at,
    COALESCE(tm.cals, 0) AS todays_calories,
    p.ai_recommended_calories AS daily_calorie_goal,
    tm.last_at AS last_meal_at,
    m.share_data,
    m.joined_at
  FROM members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN latest_weight lw ON lw.user_id = m.user_id
  LEFT JOIN todays_meals tm ON tm.user_id = m.user_id
  ORDER BY lw.date DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.coach_athletes_overview(UUID) TO authenticated;

-- Index to speed the latest_weight DISTINCT ON
CREATE INDEX IF NOT EXISTS weight_logs_user_date_desc_idx ON public.weight_logs(user_id, date DESC);
