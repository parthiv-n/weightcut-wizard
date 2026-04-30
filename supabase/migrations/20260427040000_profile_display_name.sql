-- Add a real display_name column to profiles so coaches see athletes' actual
-- names (the BottomNav settings dialog previously stored userName in
-- localStorage only). athlete_type is reserved for sport (MMA/Boxing/etc.).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Update coach_athletes_overview to prefer display_name over athlete_type.
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

-- Same treatment for athlete detail
CREATE OR REPLACE FUNCTION public.coach_athlete_detail(p_coach_id UUID, p_athlete_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can BOOLEAN;
  v_result JSON;
BEGIN
  SELECT public.coach_can_view_athlete(p_coach_id, p_athlete_id) INTO v_can;
  IF NOT v_can THEN RETURN NULL; END IF;

  SELECT json_build_object(
    'profile', (
      SELECT row_to_json(p) FROM (
        SELECT id,
               COALESCE(NULLIF(display_name, ''), NULLIF(athlete_type, ''), 'Athlete') AS display_name,
               athlete_type, avatar_url, goal_type, current_weight_kg,
               goal_weight_kg, fight_week_target_kg, target_date,
               ai_recommended_calories, ai_recommended_protein_g,
               ai_recommended_carbs_g, ai_recommended_fats_g
        FROM public.profiles WHERE id = p_athlete_id
      ) p
    ),
    'weight_7d', (
      SELECT json_agg(json_build_object('date', date, 'weight_kg', weight_kg) ORDER BY date)
      FROM public.weight_logs
      WHERE user_id = p_athlete_id
        AND date >= CURRENT_DATE - INTERVAL '7 days'
    ),
    'today_macros', (
      SELECT row_to_json(t) FROM (
        SELECT
          COALESCE(SUM(total_calories), 0) AS calories,
          COALESCE(SUM(total_protein_g), 0) AS protein_g,
          COALESCE(SUM(total_carbs_g), 0) AS carbs_g,
          COALESCE(SUM(total_fats_g), 0) AS fats_g
        FROM public.meals_with_totals
        WHERE user_id = p_athlete_id
          AND created_at::date = CURRENT_DATE
      ) t
    ),
    'recent_sessions', (
      SELECT json_agg(s ORDER BY s.date DESC)
      FROM (
        SELECT date, session_type, rpe, soreness_level, duration_minutes
        FROM public.fight_camp_calendar
        WHERE user_id = p_athlete_id
        ORDER BY date DESC
        LIMIT 5
      ) s
    ),
    'sleep_7d_avg', (
      SELECT ROUND(AVG(hours)::numeric, 1)
      FROM public.sleep_logs
      WHERE user_id = p_athlete_id
        AND date >= CURRENT_DATE - INTERVAL '7 days'
    ),
    'membership', (
      SELECT row_to_json(m) FROM (
        SELECT gm.share_data, gm.status, gm.joined_at, g.name AS gym_name
        FROM public.gym_members gm
        JOIN public.gyms g ON g.id = gm.gym_id
        WHERE gm.user_id = p_athlete_id
          AND g.owner_user_id = p_coach_id
          AND gm.status = 'active'
        LIMIT 1
      ) m
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.coach_athlete_detail(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
