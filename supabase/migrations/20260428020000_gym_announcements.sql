-- Gym announcements: coach broadcasts + targeted DMs to gym athletes.
-- Mirrors the SECURITY DEFINER helper pattern from 20260427030000 to avoid
-- the gyms <-> gym_members RLS recursion class.

-- ── 1. Tables ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gym_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) >= 1 AND length(body) <= 2000),
  is_broadcast BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gym_announcements_gym_created_idx
  ON public.gym_announcements(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gym_announcements_sender_idx
  ON public.gym_announcements(sender_user_id);

CREATE TABLE IF NOT EXISTS public.gym_announcement_targets (
  announcement_id UUID NOT NULL REFERENCES public.gym_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX IF NOT EXISTS gym_announcement_targets_user_idx
  ON public.gym_announcement_targets(user_id);

ALTER TABLE public.gym_announcements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_announcement_targets ENABLE ROW LEVEL SECURITY;

-- ── 2. SECURITY DEFINER helpers (bypass RLS, prevent recursion) ──────
CREATE OR REPLACE FUNCTION public.is_announcement_target(p_announcement_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gym_announcement_targets
    WHERE announcement_id = p_announcement_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.coach_owns_announcement(p_announcement_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.gym_announcements a
    JOIN public.gyms g ON g.id = a.gym_id
    WHERE a.id = p_announcement_id AND g.owner_user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_announcement_target(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coach_owns_announcement(UUID, UUID) TO authenticated;

-- ── 3. RLS: gym_announcements ────────────────────────────────────────
DROP POLICY IF EXISTS gym_announcements_coach_all ON public.gym_announcements;
CREATE POLICY gym_announcements_coach_all ON public.gym_announcements
  FOR ALL TO authenticated
  USING (public.is_gym_owner(gym_id, (SELECT auth.uid())))
  WITH CHECK (public.is_gym_owner(gym_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS gym_announcements_member_read_broadcast ON public.gym_announcements;
CREATE POLICY gym_announcements_member_read_broadcast ON public.gym_announcements
  FOR SELECT TO authenticated
  USING (is_broadcast = true AND public.is_gym_member(gym_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS gym_announcements_member_read_targeted ON public.gym_announcements;
CREATE POLICY gym_announcements_member_read_targeted ON public.gym_announcements
  FOR SELECT TO authenticated
  USING (is_broadcast = false AND public.is_announcement_target(id, (SELECT auth.uid())));

-- ── 4. RLS: gym_announcement_targets ─────────────────────────────────
DROP POLICY IF EXISTS targets_coach_manage ON public.gym_announcement_targets;
CREATE POLICY targets_coach_manage ON public.gym_announcement_targets
  FOR ALL TO authenticated
  USING (public.coach_owns_announcement(announcement_id, (SELECT auth.uid())))
  WITH CHECK (public.coach_owns_announcement(announcement_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS targets_self_read ON public.gym_announcement_targets;
CREATE POLICY targets_self_read ON public.gym_announcement_targets
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ── 5. Atomic create RPC ─────────────────────────────────────────────
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

  INSERT INTO public.gym_announcements (gym_id, sender_user_id, body, is_broadcast)
  VALUES (p_gym_id, auth.uid(), p_body, v_broadcast)
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

-- ── 6. Read RPC ──────────────────────────────────────────────────────
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

-- ── 7. Realtime publication (idempotent) ─────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gym_announcements'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.gym_announcements';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gym_announcement_targets'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.gym_announcement_targets';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
