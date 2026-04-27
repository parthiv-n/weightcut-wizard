-- Coach Mode v2: extra RLS for athlete-detail page + athlete MyGym page.
-- Adds coach read access to fight_camp_calendar; lets athletes read their
-- coach's profile (name only, via existing PROFILE_COLUMNS — no RLS column
-- restriction in PG, so this is acknowledged as part of the trust contract).

-- Coach reads athlete's training calendar entries
DROP POLICY IF EXISTS fight_camp_calendar_coach_read ON public.fight_camp_calendar;
CREATE POLICY fight_camp_calendar_coach_read ON public.fight_camp_calendar
  FOR SELECT TO authenticated
  USING (public.coach_can_view_athlete((SELECT auth.uid()), fight_camp_calendar.user_id));

-- Athlete reads coach profile (display name only — clients project the column they need)
DROP POLICY IF EXISTS profiles_member_read_coach ON public.profiles;
CREATE POLICY profiles_member_read_coach ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_members gm
      JOIN public.gyms g ON g.id = gm.gym_id
      WHERE gm.user_id = (SELECT auth.uid())
        AND gm.status = 'active'
        AND g.owner_user_id = profiles.id
    )
  );

-- Per-athlete detail RPC — single round-trip, server-side joins.
-- Returns a JSON object so clients don't have to issue 5 follow-up queries.
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
  -- Permission: coach must be in a shared gym with athlete (share_data=true)
  SELECT public.coach_can_view_athlete(p_coach_id, p_athlete_id) INTO v_can;
  IF NOT v_can THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'profile', (
      SELECT row_to_json(p) FROM (
        SELECT id, athlete_type, avatar_url, goal_type, current_weight_kg,
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
