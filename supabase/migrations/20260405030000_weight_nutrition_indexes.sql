-- Index for fast user+date queries on weight_logs
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date
  ON public.weight_logs(user_id, date DESC);

-- Index for fast user+date queries on nutrition_logs
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date
  ON public.nutrition_logs(user_id, date DESC);
