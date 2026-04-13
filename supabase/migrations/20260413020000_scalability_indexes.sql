-- Scalability indexes for 2000+ users
-- Covers all frequently-queried tables missing composite indexes

-- Gym sessions: filtered by user + status (history queries)
CREATE INDEX IF NOT EXISTS idx_gym_sessions_user_status
  ON public.gym_sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_gym_sessions_user_date
  ON public.gym_sessions(user_id, date DESC);

-- Gym sets: joined via session_id, also queried by exercise for PRs/analytics
CREATE INDEX IF NOT EXISTS idx_gym_sets_session
  ON public.gym_sets(session_id);

CREATE INDEX IF NOT EXISTS idx_gym_sets_exercise_user
  ON public.gym_sets(exercise_id, user_id);

-- Exercise PRs: loaded on every gym page mount
CREATE INDEX IF NOT EXISTS idx_exercise_prs_user
  ON public.exercise_prs(user_id);

-- Exercises: custom exercises filtered by user_id
CREATE INDEX IF NOT EXISTS idx_exercises_user
  ON public.exercises(user_id);

-- Sleep logs: queried by user + date range
CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_date
  ON public.sleep_logs(user_id, date DESC);

-- Fight week logs: queried in wizard-chat by user + date range
CREATE INDEX IF NOT EXISTS idx_fight_week_logs_user_date
  ON public.fight_week_logs(user_id, log_date DESC);

-- Fight week plans: queried by user + upcoming fight date
CREATE INDEX IF NOT EXISTS idx_fight_week_plans_user_date
  ON public.fight_week_plans(user_id, fight_date);

-- Nutrition logs: covering index for count queries (head:true scans)
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_id
  ON public.nutrition_logs(user_id);
