-- Per-user announcement dismissal — clean up cluttered feeds without
-- affecting other recipients. Reuses the announcement_dismissals table from
-- the rich-announcements migration (20260428040000). Restores the
-- dismiss_announcement RPC and updates my_announcements to filter out
-- dismissed rows for the calling user.

-- ── Restore dismiss_announcement RPC (was dropped in revert) ─────────
CREATE OR REPLACE FUNCTION public.dismiss_announcement(p_announcement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'dismiss_announcement: not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Permission: caller must currently be a recipient of this announcement.
  -- (Either active gym member when broadcast, or in the targets table.)
  IF NOT EXISTS (
    SELECT 1
    FROM public.gym_announcements a
    LEFT JOIN public.gym_members gm
      ON gm.gym_id = a.gym_id AND gm.user_id = auth.uid() AND gm.status = 'active'
    LEFT JOIN public.gym_announcement_targets t
      ON t.announcement_id = a.id AND t.user_id = auth.uid()
    WHERE a.id = p_announcement_id
      AND (
        (a.is_broadcast = true AND gm.user_id IS NOT NULL)
        OR (a.is_broadcast = false AND t.user_id IS NOT NULL)
      )
  ) THEN
    RAISE EXCEPTION 'dismiss_announcement: not a recipient' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.announcement_dismissals (announcement_id, user_id)
  VALUES (p_announcement_id, auth.uid())
  ON CONFLICT (announcement_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_announcement(UUID) TO authenticated;

-- ── my_announcements: filter out dismissed rows for the caller ──────
-- Re-issue with the same return shape as the text-only version.
DROP FUNCTION IF EXISTS public.my_announcements(UUID, INT);
CREATE OR REPLACE FUNCTION public.my_announcements(p_user_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID, gym_id UUID, gym_name TEXT,
  sender_user_id UUID, sender_name TEXT,
  body TEXT, is_broadcast BOOLEAN, created_at TIMESTAMPTZ
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'my_announcements: forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH visible AS (
    SELECT a.* FROM public.gym_announcements a
    JOIN public.gym_members gm
      ON gm.gym_id = a.gym_id AND gm.user_id = p_user_id AND gm.status = 'active'
    WHERE a.is_broadcast = true
    UNION
    SELECT a.* FROM public.gym_announcements a
    JOIN public.gym_announcement_targets t
      ON t.announcement_id = a.id AND t.user_id = p_user_id
    JOIN public.gym_members gm
      ON gm.gym_id = a.gym_id AND gm.user_id = p_user_id AND gm.status = 'active'
    WHERE a.is_broadcast = false
  ),
  not_dismissed AS (
    SELECT v.* FROM visible v
    WHERE NOT EXISTS (
      SELECT 1 FROM public.announcement_dismissals d
      WHERE d.announcement_id = v.id AND d.user_id = p_user_id
    )
  )
  SELECT v.id, v.gym_id, g.name AS gym_name,
         v.sender_user_id,
         COALESCE(NULLIF(p.display_name,''), NULLIF(p.athlete_type,''), 'Coach') AS sender_name,
         v.body, v.is_broadcast, v.created_at
  FROM not_dismissed v
  JOIN public.gyms g ON g.id = v.gym_id
  LEFT JOIN public.profiles p ON p.id = v.sender_user_id
  ORDER BY v.created_at DESC
  LIMIT p_limit;
END $$;
GRANT EXECUTE ON FUNCTION public.my_announcements(UUID, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
