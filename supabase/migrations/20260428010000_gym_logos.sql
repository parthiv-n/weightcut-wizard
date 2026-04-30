-- Gym logos: column on gyms, public storage bucket, owner-only write RLS,
-- and updated RPCs to project logo_url to coach + athlete dashboards.

-- ── 1. Column ─────────────────────────────────────────────────────────
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS logo_url TEXT NULL;

-- ── 2. Storage bucket ─────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gym-logos', 'gym-logos', true, 5242880,
  ARRAY['image/webp','image/png','image/jpeg','image/jpg']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/webp','image/png','image/jpeg','image/jpg']::text[];

-- ── 3. Storage RLS — public read, owner-only write ───────────────────
DROP POLICY IF EXISTS "Gym logos public read" ON storage.objects;
CREATE POLICY "Gym logos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gym-logos');

DROP POLICY IF EXISTS "Coaches manage own gym logo" ON storage.objects;
CREATE POLICY "Coaches manage own gym logo"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'gym-logos'
    AND EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id::text = (storage.foldername(name))[1]
        AND g.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'gym-logos'
    AND EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id::text = (storage.foldername(name))[1]
        AND g.owner_user_id = (SELECT auth.uid())
    )
  );

-- ── 4. coach_athletes_overview — add gym_logo_url ────────────────────
-- DROP first because Postgres can't change return type via CREATE OR REPLACE
DROP FUNCTION IF EXISTS public.coach_athletes_overview(UUID);
CREATE OR REPLACE FUNCTION public.coach_athletes_overview(p_coach_id UUID)
RETURNS TABLE (
  user_id UUID,
  gym_id UUID,
  gym_name TEXT,
  gym_logo_url TEXT,
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
    SELECT id, name, logo_url FROM public.gyms WHERE owner_user_id = p_coach_id
  ),
  members AS (
    SELECT gm.user_id, gm.gym_id, gm.share_data, gm.joined_at,
           cg.name AS gym_name, cg.logo_url AS gym_logo_url
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
    m.gym_logo_url,
    COALESCE(NULLIF(p.display_name, ''), NULLIF(p.athlete_type, ''), 'Athlete') AS display_name,
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

-- ── 5. my_gyms_overview — add gym_logo_url ───────────────────────────
DROP FUNCTION IF EXISTS public.my_gyms_overview(UUID);
CREATE OR REPLACE FUNCTION public.my_gyms_overview(p_user_id UUID)
RETURNS TABLE (
  member_id UUID,
  gym_id UUID,
  gym_name TEXT,
  gym_location TEXT,
  gym_logo_url TEXT,
  coach_user_id UUID,
  coach_name TEXT,
  share_data BOOLEAN,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'my_gyms_overview: forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    gm.id              AS member_id,
    gm.gym_id          AS gym_id,
    g.name             AS gym_name,
    g.location         AS gym_location,
    g.logo_url         AS gym_logo_url,
    g.owner_user_id    AS coach_user_id,
    COALESCE(NULLIF(p.display_name, ''), NULLIF(p.athlete_type, ''), 'Coach') AS coach_name,
    gm.share_data      AS share_data,
    gm.joined_at       AS joined_at
  FROM public.gym_members gm
  JOIN public.gyms     g ON g.id = gm.gym_id
  LEFT JOIN public.profiles p ON p.id = g.owner_user_id
  WHERE gm.user_id     = p_user_id
    AND gm.status      = 'active'
    AND gm.member_role = 'athlete'
  ORDER BY gm.joined_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_gyms_overview(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
