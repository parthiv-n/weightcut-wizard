-- Composite indexes for cold-start query speed.
-- All idempotent (IF NOT EXISTS) so they're safe to run on environments that
-- already have these indexes from earlier migrations.

-- Nutrition page filters meals by user_id + date — full table scan as the
-- table grows without this composite index.
CREATE INDEX IF NOT EXISTS idx_meals_user_date
  ON public.meals (user_id, date DESC);

-- Time-series gym sessions filtered by user — same pattern as meals.
CREATE INDEX IF NOT EXISTS idx_gym_sessions_user_date
  ON public.gym_sessions (user_id, date DESC);
