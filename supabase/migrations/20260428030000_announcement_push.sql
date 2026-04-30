-- Native push notifications for announcements (iOS via APNs).
-- Adds device_tokens table for storing per-user APNs/FCM tokens, and a
-- DB trigger that invokes the send-announcement-push edge function via
-- pg_net whenever a new announcement is created.

-- ── 1. device_tokens table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  app_version TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON public.device_tokens(user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_tokens_self_all ON public.device_tokens;
CREATE POLICY device_tokens_self_all ON public.device_tokens
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── 2. Helper: invoke edge function with the announcement payload ────
-- Uses pg_net's http_post (available on Supabase by default).
-- The edge function fans out to APNs/FCM and rate-limits as needed.
CREATE OR REPLACE FUNCTION public.notify_announcement_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_anon TEXT;
BEGIN
  -- Resolve the project's edge function URL + service role key from
  -- a config table (provisioned via supabase/secrets) — fallback is
  -- a no-op so the trigger never blocks the insert.
  SELECT current_setting('app.settings.supabase_url', true) INTO v_url;
  SELECT current_setting('app.settings.service_role_key', true) INTO v_anon;

  IF v_url IS NULL OR v_anon IS NULL THEN
    -- Settings not configured yet — silently skip. Push delivery is
    -- best-effort; absence of config must not break announcement creation.
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/send-announcement-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('announcement_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail the parent insert because push dispatch failed.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gym_announcements_push_trigger ON public.gym_announcements;
CREATE TRIGGER gym_announcements_push_trigger
  AFTER INSERT ON public.gym_announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_announcement_push();

-- ── 3. RPC for the edge function: resolve announcement + recipients ──
-- Returns sender_name, gym_name, body, and the recipient user_ids whose
-- device tokens should be hit.
CREATE OR REPLACE FUNCTION public.announcement_push_payload(p_announcement_id UUID)
RETURNS TABLE (
  recipient_user_id UUID,
  device_token TEXT,
  platform TEXT,
  gym_name TEXT,
  sender_name TEXT,
  body TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ann AS (
    SELECT a.id, a.gym_id, a.body, a.is_broadcast, a.sender_user_id,
           g.name AS gym_name,
           COALESCE(NULLIF(p.display_name, ''), NULLIF(p.athlete_type, ''), 'Coach') AS sender_name
    FROM public.gym_announcements a
    JOIN public.gyms g ON g.id = a.gym_id
    LEFT JOIN public.profiles p ON p.id = a.sender_user_id
    WHERE a.id = p_announcement_id
  ),
  recipients AS (
    SELECT gm.user_id
    FROM ann a
    JOIN public.gym_members gm ON gm.gym_id = a.gym_id
    WHERE a.is_broadcast = true
      AND gm.status = 'active'
      AND gm.member_role = 'athlete'
    UNION
    SELECT t.user_id
    FROM ann a
    JOIN public.gym_announcement_targets t ON t.announcement_id = a.id
    WHERE a.is_broadcast = false
  )
  SELECT
    r.user_id AS recipient_user_id,
    dt.token AS device_token,
    dt.platform,
    a.gym_name,
    a.sender_name,
    a.body
  FROM recipients r
  CROSS JOIN ann a
  JOIN public.device_tokens dt ON dt.user_id = r.user_id;
$$;

GRANT EXECUTE ON FUNCTION public.announcement_push_payload(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
