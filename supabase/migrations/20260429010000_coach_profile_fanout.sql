-- Coach realtime: fan out PROFILE updates (fight date, target weight, goal
-- type, weight class) to coaches whenever an athlete changes them in Goals.
-- Without this, target changes only show up after a 30s freshness expiry or
-- a tab focus event.
--
-- target_date and fight_week_target_kg are already returned by
-- coach_athletes_overview — this trigger just makes the dashboard refetch
-- live within ~400ms instead of waiting for the freshness window.

-- Add 'profile' to the existing coach_event_type enum (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.coach_event_type'::regtype
      AND enumlabel = 'profile'
  ) THEN
    ALTER TYPE public.coach_event_type ADD VALUE 'profile';
  END IF;
END $$;

-- AFTER UPDATE trigger on profiles — fans out only when fight-relevant
-- columns change, so coaches don't get spammed by gem/ads/streak updates.
CREATE OR REPLACE FUNCTION public.tg_fanout_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only fire when at least one fight-relevant field actually changed.
  IF (NEW.target_date IS DISTINCT FROM OLD.target_date)
     OR (NEW.fight_week_target_kg IS DISTINCT FROM OLD.fight_week_target_kg)
     OR (NEW.goal_weight_kg IS DISTINCT FROM OLD.goal_weight_kg)
     OR (NEW.goal_type IS DISTINCT FROM OLD.goal_type) THEN
    PERFORM public.fanout_event_to_coaches(
      NEW.id,
      'profile'::public.coach_event_type,
      jsonb_build_object(
        'target_date', NEW.target_date,
        'fight_week_target_kg', NEW.fight_week_target_kg,
        'goal_weight_kg', NEW.goal_weight_kg,
        'goal_type', NEW.goal_type
      )
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_coach_fanout ON public.profiles;
CREATE TRIGGER profiles_coach_fanout
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_fanout_profile();

NOTIFY pgrst, 'reload schema';
