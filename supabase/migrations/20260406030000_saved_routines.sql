-- Saved workout routines table
CREATE TABLE IF NOT EXISTS saved_routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT NOT NULL, -- 'hypertrophy', 'strength', 'explosiveness', 'conditioning'
  sport TEXT, -- 'mma', 'bjj', 'boxing', 'muay_thai', 'wrestling', 'general'
  training_days_per_week INT,
  exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- exercises: [{ exercise_id, name, muscle_group, sets, reps, rpe, rest_seconds, notes }]
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE saved_routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own routines"
  ON saved_routines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own routines"
  ON saved_routines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routines"
  ON saved_routines FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own routines"
  ON saved_routines FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_saved_routines_user_id ON saved_routines(user_id);
CREATE INDEX idx_saved_routines_goal ON saved_routines(user_id, goal);
