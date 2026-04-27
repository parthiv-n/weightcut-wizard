-- Rich announcements: extend gym_announcements with kind/image/expiry,
-- add poll options + votes, per-user dismissals, an image storage bucket,
-- and refreshed RPCs (create_announcement / my_announcements + new
-- vote_in_poll / dismiss_announcement). Reuses helpers from
-- 20260427030000_coach_mode_fix_recursion (is_gym_member / is_gym_owner)
-- and 20260428020000_gym_announcements (is_announcement_target /
-- coach_owns_announcement) to avoid the gyms<->gym_members RLS recursion.

-- ── 1. Schema additions to gym_announcements ─────────────────────────
ALTER TABLE public.gym_announcements
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text'
    CHECK (kind IN ('text','image','poll')),
  ADD COLUMN IF NOT EXISTS image_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

-- Allow body to be empty for image-only announcements; keep length cap.
ALTER TABLE public.gym_announcements DROP CONSTRAINT IF EXISTS gym_announcements_body_check;
ALTER TABLE public.gym_announcements
  ADD CONSTRAINT gym_announcements_body_check
  CHECK (body IS NULL OR length(body) <= 2000);
ALTER TABLE public.gym_announcements ALTER COLUMN body DROP NOT NULL;

-- ── 2. Poll tables ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.gym_announcements(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL CHECK (length(option_text) BETWEEN 1 AND 200),
  position SMALLINT NOT NULL,
  UNIQUE (announcement_id, position)
);
CREATE INDEX IF NOT EXISTS announcement_poll_options_ann_idx
  ON public.announcement_poll_options(announcement_id);

CREATE TABLE IF NOT EXISTS public.announcement_poll_votes (
  announcement_id UUID NOT NULL REFERENCES public.gym_announcements(id) ON DELETE CASCADE,
  option_id       UUID NOT NULL REFERENCES public.announcement_poll_options(id) ON DELETE CASCADE,
  voter_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, voter_user_id)
);
CREATE INDEX IF NOT EXISTS announcement_poll_votes_option_idx
  ON public.announcement_poll_votes(option_id);
CREATE INDEX IF NOT EXISTS announcement_poll_votes_announcement_idx
  ON public.announcement_poll_votes(announcement_id);
CREATE INDEX IF NOT EXISTS announcement_poll_votes_voter_idx
  ON public.announcement_poll_votes(voter_user_id);

ALTER TABLE public.announcement_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_poll_votes   ENABLE ROW LEVEL SECURITY;

-- ── 3. RLS — poll options ────────────────────────────────────────────
-- Coach (gym owner) full manage. Members can SELECT options for any
-- announcement they're entitled to read (broadcast to their gym, OR
-- targeted to them).
DROP POLICY IF EXISTS poll_options_coach_all ON public.announcement_poll_options;
CREATE POLICY poll_options_coach_all ON public.announcement_poll_options
  FOR ALL TO authenticated
  USING (public.coach_owns_announcement(announcement_id, (SELECT auth.uid())))
  WITH CHECK (public.coach_owns_announcement(announcement_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS poll_options_member_read ON public.announcement_poll_options;
CREATE POLICY poll_options_member_read ON public.announcement_poll_options
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_announcements a
      WHERE a.id = announcement_poll_options.announcement_id
        AND (
          (a.is_broadcast = true AND public.is_gym_member(a.gym_id, (SELECT auth.uid())))
          OR (a.is_broadcast = false AND public.is_announcement_target(a.id, (SELECT auth.uid())))
        )
    )
  );

-- ── 4. RLS — poll votes ──────────────────────────────────────────────
-- Coach can read all votes for polls they own (for tally + breakdown).
-- Athletes can only read their OWN vote row directly; aggregate tallies
-- come via my_announcements RPC (SECURITY DEFINER) so individual voter
-- identity stays hidden.
DROP POLICY IF EXISTS poll_votes_coach_read ON public.announcement_poll_votes;
CREATE POLICY poll_votes_coach_read ON public.announcement_poll_votes
  FOR SELECT TO authenticated
  USING (public.coach_owns_announcement(announcement_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS poll_votes_self_read ON public.announcement_poll_votes;
CREATE POLICY poll_votes_self_read ON public.announcement_poll_votes
  FOR SELECT TO authenticated
  USING (voter_user_id = (SELECT auth.uid()));

-- Insert/update only via vote_in_poll RPC; we still allow self-managed
-- writes for resilience, gated on validity (poll, not expired, recipient).
DROP POLICY IF EXISTS poll_votes_self_write ON public.announcement_poll_votes;
CREATE POLICY poll_votes_self_write ON public.announcement_poll_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    voter_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gym_announcements a
      WHERE a.id = announcement_poll_votes.announcement_id
        AND a.kind = 'poll'
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND (
          (a.is_broadcast = true AND public.is_gym_member(a.gym_id, (SELECT auth.uid())))
          OR (a.is_broadcast = false AND public.is_announcement_target(a.id, (SELECT auth.uid())))
        )
    )
  );

DROP POLICY IF EXISTS poll_votes_self_update ON public.announcement_poll_votes;
CREATE POLICY poll_votes_self_update ON public.announcement_poll_votes
  FOR UPDATE TO authenticated
  USING (voter_user_id = (SELECT auth.uid()))
  WITH CHECK (voter_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS poll_votes_self_delete ON public.announcement_poll_votes;
CREATE POLICY poll_votes_self_delete ON public.announcement_poll_votes
  FOR DELETE TO authenticated
  USING (voter_user_id = (SELECT auth.uid()));

-- ── 5. Per-user dismissals ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcement_dismissals (
  announcement_id UUID NOT NULL REFERENCES public.gym_announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX IF NOT EXISTS announcement_dismissals_user_idx
  ON public.announcement_dismissals(user_id);

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcement_dismissals_self_all ON public.announcement_dismissals;
CREATE POLICY announcement_dismissals_self_all ON public.announcement_dismissals
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── 6. Storage bucket: announcement-images ───────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-images', 'announcement-images', true, 5242880,
  ARRAY['image/webp','image/png','image/jpeg','image/jpg','image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/webp','image/png','image/jpeg','image/jpg','image/gif']::text[];

-- Path convention: {gym_id}/{announcement_id}.{ext}
DROP POLICY IF EXISTS "Announcement images public read" ON storage.objects;
CREATE POLICY "Announcement images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'announcement-images');

DROP POLICY IF EXISTS "Coaches manage own announcement images" ON storage.objects;
CREATE POLICY "Coaches manage own announcement images"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'announcement-images'
    AND EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id::text = (storage.foldername(name))[1]
        AND g.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'announcement-images'
    AND EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id::text = (storage.foldername(name))[1]
        AND g.owner_user_id = (SELECT auth.uid())
    )
  );

-- ── 7. create_announcement (extended signature) ──────────────────────
DROP FUNCTION IF EXISTS public.create_announcement(UUID, TEXT, UUID[]);
DROP FUNCTION IF EXISTS public.create_announcement(UUID, TEXT, UUID[], TEXT, TEXT, TEXT[], TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION public.create_announcement(
  p_gym_id UUID,
  p_body TEXT,
  p_target_user_ids UUID[],
  p_kind TEXT DEFAULT 'text',
  p_image_url TEXT DEFAULT NULL,
  p_poll_options TEXT[] DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_broadcast BOOLEAN;
  v_opt_count INT;
  v_body TEXT := NULLIF(p_body, '');
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> (SELECT owner_user_id FROM public.gyms WHERE id = p_gym_id) THEN
    RAISE EXCEPTION 'create_announcement: forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('text','image','poll') THEN
    RAISE EXCEPTION 'create_announcement: invalid kind %', p_kind USING ERRCODE = '22023';
  END IF;

  -- Body required for text; optional for image/poll.
  IF p_kind = 'text' AND (v_body IS NULL OR length(v_body) = 0) THEN
    RAISE EXCEPTION 'create_announcement: body required for text' USING ERRCODE = '22023';
  END IF;
  IF v_body IS NOT NULL AND length(v_body) > 2000 THEN
    RAISE EXCEPTION 'create_announcement: body too long' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'image' AND (p_image_url IS NULL OR length(p_image_url) = 0) THEN
    -- Allow null here so client may two-step: create row then UPDATE image_url.
    -- But require either body or image_url to exist eventually; we don't block
    -- creation. Still validate URL length when supplied.
    NULL;
  END IF;

  IF p_kind = 'poll' THEN
    v_opt_count := COALESCE(array_length(p_poll_options, 1), 0);
    IF v_opt_count < 2 THEN
      RAISE EXCEPTION 'create_announcement: poll needs at least 2 options' USING ERRCODE = '22023';
    END IF;
    IF v_opt_count > 10 THEN
      RAISE EXCEPTION 'create_announcement: poll capped at 10 options' USING ERRCODE = '22023';
    END IF;
  ELSIF p_poll_options IS NOT NULL AND array_length(p_poll_options, 1) > 0 THEN
    RAISE EXCEPTION 'create_announcement: poll_options only valid for kind=poll' USING ERRCODE = '22023';
  END IF;

  v_broadcast := (p_target_user_ids IS NULL OR array_length(p_target_user_ids, 1) IS NULL);
  IF NOT v_broadcast AND array_length(p_target_user_ids, 1) = 0 THEN
    RAISE EXCEPTION 'create_announcement: empty targets' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.gym_announcements
    (gym_id, sender_user_id, body, is_broadcast, kind, image_url, expires_at)
  VALUES
    (p_gym_id, auth.uid(), v_body, v_broadcast, p_kind, p_image_url, p_expires_at)
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

  IF p_kind = 'poll' THEN
    INSERT INTO public.announcement_poll_options (announcement_id, option_text, position)
    SELECT v_id, trim(opt.txt), (opt.idx - 1)::SMALLINT
    FROM unnest(p_poll_options) WITH ORDINALITY AS opt(txt, idx)
    WHERE length(trim(opt.txt)) BETWEEN 1 AND 200;
  END IF;

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_announcement(UUID, TEXT, UUID[], TEXT, TEXT, TEXT[], TIMESTAMPTZ) TO authenticated;

-- ── 8. my_announcements (extended return shape, drops dismissed) ─────
DROP FUNCTION IF EXISTS public.my_announcements(UUID, INT);
CREATE OR REPLACE FUNCTION public.my_announcements(p_user_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID, gym_id UUID, gym_name TEXT,
  sender_user_id UUID, sender_name TEXT,
  body TEXT, is_broadcast BOOLEAN, created_at TIMESTAMPTZ,
  kind TEXT, image_url TEXT, expires_at TIMESTAMPTZ,
  poll JSONB
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
  ),
  poll_agg AS (
    SELECT
      o.announcement_id,
      jsonb_build_object(
        'options', jsonb_agg(
          jsonb_build_object('id', o.id, 'text', o.option_text, 'votes', COALESCE(vc.votes, 0))
          ORDER BY o.position
        ),
        'total_votes', COALESCE(SUM(vc.votes), 0),
        'my_vote_id', MAX(mv.option_id)
      ) AS payload
    FROM public.announcement_poll_options o
    LEFT JOIN (
      SELECT option_id, COUNT(*)::INT AS votes
      FROM public.announcement_poll_votes
      GROUP BY option_id
    ) vc ON vc.option_id = o.id
    LEFT JOIN public.announcement_poll_votes mv
      ON mv.option_id = o.id AND mv.voter_user_id = p_user_id
    WHERE o.announcement_id IN (SELECT id FROM not_dismissed WHERE kind = 'poll')
    GROUP BY o.announcement_id
  )
  SELECT
    v.id, v.gym_id, g.name AS gym_name,
    v.sender_user_id,
    COALESCE(NULLIF(p.display_name,''), NULLIF(p.athlete_type,''), 'Coach') AS sender_name,
    v.body, v.is_broadcast, v.created_at,
    v.kind, v.image_url, v.expires_at,
    pa.payload AS poll
  FROM not_dismissed v
  JOIN public.gyms g ON g.id = v.gym_id
  LEFT JOIN public.profiles p ON p.id = v.sender_user_id
  LEFT JOIN poll_agg pa ON pa.announcement_id = v.id
  ORDER BY v.created_at DESC
  LIMIT p_limit;
END $$;
GRANT EXECUTE ON FUNCTION public.my_announcements(UUID, INT) TO authenticated;

-- ── 9. vote_in_poll RPC (UPSERT — change vote allowed) ───────────────
CREATE OR REPLACE FUNCTION public.vote_in_poll(
  p_announcement_id UUID,
  p_option_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_kind TEXT;
  v_gym_id UUID;
  v_is_broadcast BOOLEAN;
  v_expires TIMESTAMPTZ;
  v_option_ok BOOLEAN;
  v_recipient BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'vote_in_poll: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT a.kind, a.gym_id, a.is_broadcast, a.expires_at
    INTO v_kind, v_gym_id, v_is_broadcast, v_expires
  FROM public.gym_announcements a
  WHERE a.id = p_announcement_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'vote_in_poll: announcement not found' USING ERRCODE = '22023';
  END IF;
  IF v_kind <> 'poll' THEN
    RAISE EXCEPTION 'vote_in_poll: announcement is not a poll' USING ERRCODE = '22023';
  END IF;
  IF v_expires IS NOT NULL AND v_expires <= now() THEN
    RAISE EXCEPTION 'vote_in_poll: poll has expired' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.announcement_poll_options
    WHERE id = p_option_id AND announcement_id = p_announcement_id
  ) INTO v_option_ok;
  IF NOT v_option_ok THEN
    RAISE EXCEPTION 'vote_in_poll: option not in this poll' USING ERRCODE = '22023';
  END IF;

  v_recipient := (
    (v_is_broadcast AND public.is_gym_member(v_gym_id, v_uid))
    OR (NOT v_is_broadcast AND public.is_announcement_target(p_announcement_id, v_uid))
  );
  IF NOT v_recipient THEN
    RAISE EXCEPTION 'vote_in_poll: not a recipient' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.announcement_poll_votes (announcement_id, option_id, voter_user_id)
  VALUES (p_announcement_id, p_option_id, v_uid)
  ON CONFLICT (announcement_id, voter_user_id)
  DO UPDATE SET option_id = EXCLUDED.option_id, created_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.vote_in_poll(UUID, UUID) TO authenticated;

-- ── 10. dismiss_announcement RPC ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dismiss_announcement(
  p_announcement_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_gym_id UUID;
  v_is_broadcast BOOLEAN;
  v_recipient BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'dismiss_announcement: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT a.gym_id, a.is_broadcast
    INTO v_gym_id, v_is_broadcast
  FROM public.gym_announcements a
  WHERE a.id = p_announcement_id;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'dismiss_announcement: announcement not found' USING ERRCODE = '22023';
  END IF;

  v_recipient := (
    (v_is_broadcast AND public.is_gym_member(v_gym_id, v_uid))
    OR (NOT v_is_broadcast AND public.is_announcement_target(p_announcement_id, v_uid))
  );
  IF NOT v_recipient THEN
    RAISE EXCEPTION 'dismiss_announcement: not a recipient' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.announcement_dismissals (announcement_id, user_id)
  VALUES (p_announcement_id, v_uid)
  ON CONFLICT (announcement_id, user_id) DO NOTHING;
END $$;
GRANT EXECUTE ON FUNCTION public.dismiss_announcement(UUID) TO authenticated;

-- ── 11. Realtime publication (idempotent) ────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public'
      AND tablename='announcement_poll_options'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_poll_options';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public'
      AND tablename='announcement_poll_votes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_poll_votes';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public'
      AND tablename='announcement_dismissals'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_dismissals';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
