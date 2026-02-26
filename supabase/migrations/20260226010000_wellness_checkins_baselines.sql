-- Phase 1: Enhanced Recovery & Readiness Algorithm
-- Creates daily_wellness_checkins (Hooper Index) and personal_baselines tables

-- ─── daily_wellness_checkins ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_wellness_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  -- Hooper Index core (1-7 scale)
  sleep_quality INT NOT NULL CHECK (sleep_quality BETWEEN 1 AND 7),
  stress_level INT NOT NULL CHECK (stress_level BETWEEN 1 AND 7),
  fatigue_level INT NOT NULL CHECK (fatigue_level BETWEEN 1 AND 7),
  soreness_level INT NOT NULL CHECK (soreness_level BETWEEN 1 AND 7),
  -- Optional extras
  energy_level INT CHECK (energy_level BETWEEN 1 AND 7),
  motivation_level INT CHECK (motivation_level BETWEEN 1 AND 7),
  sleep_hours NUMERIC,
  hydration_feeling INT CHECK (hydration_feeling BETWEEN 1 AND 5),
  appetite_level INT CHECK (appetite_level BETWEEN 1 AND 5),
  -- Computed Hooper Index: sleep_quality + (8-stress) + (8-fatigue) + (8-soreness) → 4-28
  hooper_index NUMERIC GENERATED ALWAYS AS (
    sleep_quality + (8 - stress_level) + (8 - fatigue_level) + (8 - soreness_level)
  ) STORED,
  -- Stored after computation for autoregressive smoothing
  readiness_score INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

-- RLS
ALTER TABLE public.daily_wellness_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wellness check-ins"
  ON public.daily_wellness_checkins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wellness check-ins"
  ON public.daily_wellness_checkins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wellness check-ins"
  ON public.daily_wellness_checkins FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wellness check-ins"
  ON public.daily_wellness_checkins FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_wellness_checkins_user_date
  ON public.daily_wellness_checkins (user_id, date DESC);


-- ─── personal_baselines ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.personal_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  baseline_date DATE NOT NULL,
  -- 14-day rolling statistics
  sleep_hours_mean_14d NUMERIC,
  sleep_hours_std_14d NUMERIC,
  soreness_mean_14d NUMERIC,
  soreness_std_14d NUMERIC,
  fatigue_mean_14d NUMERIC,
  fatigue_std_14d NUMERIC,
  stress_mean_14d NUMERIC,
  stress_std_14d NUMERIC,
  hooper_mean_14d NUMERIC,
  hooper_std_14d NUMERIC,
  daily_load_mean_14d NUMERIC,
  daily_load_std_14d NUMERIC,
  -- 60-day rolling statistics
  sleep_hours_mean_60d NUMERIC,
  sleep_hours_std_60d NUMERIC,
  soreness_mean_60d NUMERIC,
  soreness_std_60d NUMERIC,
  fatigue_mean_60d NUMERIC,
  fatigue_std_60d NUMERIC,
  stress_mean_60d NUMERIC,
  stress_std_60d NUMERIC,
  hooper_mean_60d NUMERIC,
  hooper_std_60d NUMERIC,
  daily_load_mean_60d NUMERIC,
  daily_load_std_60d NUMERIC,
  -- Stability metric
  hooper_cv_14d NUMERIC,
  -- Caloric deficit averages
  avg_deficit_7d NUMERIC,
  avg_deficit_14d NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, baseline_date)
);

-- RLS
ALTER TABLE public.personal_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own baselines"
  ON public.personal_baselines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own baselines"
  ON public.personal_baselines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own baselines"
  ON public.personal_baselines FOR UPDATE
  USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_personal_baselines_user_date
  ON public.personal_baselines (user_id, baseline_date DESC);
