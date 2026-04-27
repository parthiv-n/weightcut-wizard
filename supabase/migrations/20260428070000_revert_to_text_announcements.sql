-- Revert announcements to the original text-only version. The rich
-- (poll/image/dismiss) machinery added in 20260428040000 added latency to
-- the read path. Drops the new RPC signatures and restores the simple
-- text-only my_announcements + create_announcement.
--
-- Tables added by 20260428040000 (announcement_poll_options /
-- announcement_poll_votes / announcement_dismissals / announcement-images
-- bucket) are LEFT IN PLACE — they're empty and harmless, and dropping
-- them would force more cascade risk than it's worth.

-- ── 1. Drop the rich RPC variants ────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_announcement(UUID, TEXT, UUID[], TEXT, TEXT, TEXT[], TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.my_announcements(UUID, INT);
DROP FUNCTION IF EXISTS public.vote_in_poll(UUID, UUID);
DROP FUNCTION IF EXISTS public.dismiss_announcement(UUID);

-- ── 2. Restore text-only create_announcement (3 args) ────────────────
CREATE OR REPLACE FUNCTION public.create_announcement(
  p_gym_id UUID, p_body TEXT, p_target_user_ids UUID[]
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_broadcast BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> (SELECT owner_user_id FROM public.gyms WHERE id = p_gym_id) THEN
    RAISE EXCEPTION 'create_announcement: forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_body IS NULL OR length(p_body) = 0 OR length(p_body) > 2000 THEN
    RAISE EXCEPTION 'create_announcement: invalid body' USING ERRCODE = '22023';
  END IF;

  v_broadcast := (p_target_user_ids IS NULL OR array_length(p_target_user_ids, 1) IS NULL);

  IF NOT v_broadcast AND array_length(p_target_user_ids, 1) = 0 THEN
    RAISE EXCEPTION 'create_announcement: empty targets' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.gym_announcements (gym_id, sender_user_id, body, is_broadcast, kind)
  VALUES (p_gym_id, auth.uid(), p_body, v_broadcast, 'text')
  RETURNING id INTO v_id;

  IF NOT v_broadcast THEN
    INSERT INTO public.gym_announcement_targets (announcement_id, user_id)
    SELECT v_id, t
    FROM unnest(p_target_user_ids) AS t
    WHERE EXISTS (
      SELECT 1 FROM public.gym_members
      WHERE gym_id = p_gym_id AND user_id = t AND status = 'active'
    );
  END IF;

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_announcement(UUID, TEXT, UUID[]) TO authenticated;

-- ── 3. Restore text-only my_announcements ────────────────────────────
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
  )
  SELECT v.id, v.gym_id, g.name AS gym_name,
         v.sender_user_id,
         COALESCE(NULLIF(p.display_name,''), NULLIF(p.athlete_type,''), 'Coach') AS sender_name,
         v.body, v.is_broadcast, v.created_at
  FROM visible v
  JOIN public.gyms g ON g.id = v.gym_id
  LEFT JOIN public.profiles p ON p.id = v.sender_user_id
  ORDER BY v.created_at DESC
  LIMIT p_limit;
END $$;
GRANT EXECUTE ON FUNCTION public.my_announcements(UUID, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
