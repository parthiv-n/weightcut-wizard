ALTER TABLE profiles
  ADD COLUMN goal_type TEXT NOT NULL DEFAULT 'cutting'
  CHECK (goal_type IN ('cutting', 'losing'));
