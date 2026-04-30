-- Remove sleep_7d_avg from coach_athlete_detail RPC. Not needed on the coach
-- dashboard — drops one sub-query and keeps RLS surface tighter.

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
