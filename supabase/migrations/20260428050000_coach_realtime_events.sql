-- Coach realtime sync (Option B: fan-out event table).
-- AFTER INSERT triggers on athlete activity tables write one row per
-- coach who has the athlete in an active+sharing membership. Coach
-- subscribes to ONE realtime channel filtered by coach_user_id.

-- ── 1. Event-type enum + table ───────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coach_event_type') THEN
    CREATE TYPE public.coach_event_type AS ENUM ('weight','meal','training','sleep');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.coach_realtime_events (
  id              BIGSERIAL PRIMARY KEY,
  coach_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type      public.coach_event_type NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_events_coach_created_idx
  ON public.coach_realtime_events (coach_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_events_created_idx
  ON public.coach_realtime_events (created_at);

ALTER TABLE public.coach_realtime_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_events_self_read ON public.coach_realtime_events;
CREATE POLICY coach_events_self_read ON public.coach_realtime_events
  FOR SELECT TO authenticated
  USING (coach_user_id = (SELECT auth.uid()));
-- No INSERT policy → only SECURITY DEFINER triggers can write.

-- ── 2. Shared fan-out helper ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fanout_event_to_coaches(
  p_athlete UUID,
  p_type public.coach_event_type,
  p_payload JSONB
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.coach_realtime_events
    (coach_user_id, athlete_user_id, event_type, payload)
  SELECT g.owner_user_id, p_athlete, p_type, p_payload
  FROM public.gym_members gm
  JOIN public.gyms g ON g.id = gm.gym_id
  WHERE gm.user_id = p_athlete
    AND gm.status = 'active'
    AND gm.share_data = true
    AND gm.member_role = 'athlete';
$$;

-- ── 3. Per-table triggers ────────────────────────────────────────────

-- weight_logs
CREATE OR REPLACE FUNCTION public.tg_fanout_weight() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fanout_event_to_coaches(
    NEW.user_id, 'weight'::public.coach_event_type,
    jsonb_build_object('weight_kg', NEW.weight_kg, 'date', NEW.date)
  );
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS weight_logs_fanout ON public.weight_logs;
CREATE TRIGGER weight_logs_fanout AFTER INSERT ON public.weight_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_fanout_weight();

-- meals
CREATE OR REPLACE FUNCTION public.tg_fanout_meal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fanout_event_to_coaches(
    NEW.user_id, 'meal'::public.coach_event_type,
    jsonb_build_object('meal_id', NEW.id, 'meal_type', NEW.meal_type, 'date', NEW.date)
  );
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS meals_fanout ON public.meals;
CREATE TRIGGER meals_fanout AFTER INSERT ON public.meals
  FOR EACH ROW EXECUTE FUNCTION public.tg_fanout_meal();

-- fight_camp_calendar (training sessions) — guarded by table existence
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='fight_camp_calendar') THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.tg_fanout_training() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
      BEGIN
        PERFORM public.fanout_event_to_coaches(
          NEW.user_id, 'training'::public.coach_event_type,
          jsonb_build_object('session_type', NEW.session_type, 'rpe', NEW.rpe, 'date', NEW.date)
        );
        RETURN NEW;
      END $f$;
    $body$;
    EXECUTE 'DROP TRIGGER IF EXISTS fight_camp_calendar_fanout ON public.fight_camp_calendar';
    EXECUTE 'CREATE TRIGGER fight_camp_calendar_fanout AFTER INSERT ON public.fight_camp_calendar FOR EACH ROW EXECUTE FUNCTION public.tg_fanout_training()';
  END IF;
END $$;

-- sleep_logs — guarded by table existence
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='sleep_logs') THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.tg_fanout_sleep() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
      BEGIN
        PERFORM public.fanout_event_to_coaches(
          NEW.user_id, 'sleep'::public.coach_event_type,
          jsonb_build_object('hours', NEW.hours, 'date', NEW.date)
        );
        RETURN NEW;
      END $f$;
    $body$;
    EXECUTE 'DROP TRIGGER IF EXISTS sleep_logs_fanout ON public.sleep_logs';
    EXECUTE 'CREATE TRIGGER sleep_logs_fanout AFTER INSERT ON public.sleep_logs FOR EACH ROW EXECUTE FUNCTION public.tg_fanout_sleep()';
  END IF;
END $$;

-- ── 4. Auto-prune via pg_cron (only if extension is enabled) ─────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'prune-coach-events',
      '0 * * * *',
      'DELETE FROM public.coach_realtime_events WHERE created_at < now() - interval ''24 hours'''
    );
  END IF;
END $$;

-- ── 5. Realtime publication (idempotent) ─────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'coach_realtime_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.coach_realtime_events';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
