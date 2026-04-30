-- Add a 7-day training-strain sparkline series to the coach dashboard.
-- strain_score per session = duration_minutes * rpe / 60  (RPE-equivalent hours)
-- Daily aggregate = SUM(strain) per (user_id, date), zero-filled across the
-- last 7 calendar days so the array is always length 7 (oldest → newest).
--
-- Realtime: tg_fanout_training (migration 20260428050000) already pushes a
-- 'training' event into coach_realtime_events on INSERT, so useCoachRealtimeSync
-- picks up new strain values on its 400ms-debounced refetch — no extra wiring.

CREATE INDEX IF NOT EXISTS fight_camp_calendar_user_date_idx
  ON public.fight_camp_calendar(user_id, date);

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
  joined_at TIMESTAMPTZ,
  strain_7d JSONB
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
  ),
  last_7_days AS (
    SELECT generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day'::interval)::date AS d
  ),
  daily_strain AS (
    SELECT user_id, date,
           SUM(COALESCE(duration_minutes, 0) * rpe / 60.0) AS strain
    FROM public.fight_camp_calendar
    WHERE user_id IN (SELECT user_id FROM members)
      AND date >= CURRENT_DATE - 6
      AND date <= CURRENT_DATE
    GROUP BY user_id, date
  ),
  strain_series AS (
    SELECT m.user_id,
           jsonb_agg(
             ROUND(COALESCE(ds.strain, 0)::numeric, 2)
             ORDER BY d.d
           ) AS strain_7d
    FROM members m
    CROSS JOIN last_7_days d
    LEFT JOIN daily_strain ds
           ON ds.user_id = m.user_id AND ds.date = d.d
    GROUP BY m.user_id
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
    m.joined_at,
    COALESCE(ss.strain_7d, '[0,0,0,0,0,0,0]'::jsonb) AS strain_7d
  FROM members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN latest_weight lw ON lw.user_id = m.user_id
  LEFT JOIN todays_meals tm ON tm.user_id = m.user_id
  LEFT JOIN strain_series ss ON ss.user_id = m.user_id
  ORDER BY lw.date DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.coach_athletes_overview(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
