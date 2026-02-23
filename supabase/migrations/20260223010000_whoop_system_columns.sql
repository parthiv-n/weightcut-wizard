-- Add new columns for WHOOP intelligence system
-- intensity_level: 1-5 scale replacing text-based intensity
-- fatigue_level: rest day fatigue score
-- sleep_quality: rest day sleep quality
-- mobility_done: rest day mobility work flag

ALTER TABLE public.fight_camp_calendar
  ADD COLUMN IF NOT EXISTS intensity_level integer CHECK (intensity_level >= 1 AND intensity_level <= 5),
  ADD COLUMN IF NOT EXISTS fatigue_level integer CHECK (fatigue_level >= 1 AND fatigue_level <= 10),
  ADD COLUMN IF NOT EXISTS sleep_quality text CHECK (sleep_quality IN ('good', 'poor')),
  ADD COLUMN IF NOT EXISTS mobility_done boolean DEFAULT false;
