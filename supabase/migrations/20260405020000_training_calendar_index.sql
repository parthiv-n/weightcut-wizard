-- Index for fast user+date range queries on fight_camp_calendar
CREATE INDEX IF NOT EXISTS idx_fcc_user_date
  ON public.fight_camp_calendar(user_id, date DESC);
