-- my_gyms_overview: collapse the useMyGyms two-query waterfall (gym_members
-- + embedded gyms, then profiles for coach name) into one round-trip.
-- Pattern mirrors coach_athletes_overview: SECURITY DEFINER, server-side
-- join, COALESCE for coach display name, callable only for self.

CREATE OR REPLACE FUNCTION public.my_gyms_overview(p_user_id UUID)
RETURNS TABLE (
  member_id UUID,
  gym_id UUID,
  gym_name TEXT,
  gym_location TEXT,
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
  -- Permission gate: athletes may only call this for themselves.
  IF p_user_id IS NULL OR p_user_id <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'my_gyms_overview: forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    gm.id              AS member_id,
    gm.gym_id          AS gym_id,
    g.name             AS gym_name,
    g.location         AS gym_location,
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
