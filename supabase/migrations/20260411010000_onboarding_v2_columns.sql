-- Add new onboarding v2 profile columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS athlete_type text DEFAULT 'mma',
  ADD COLUMN IF NOT EXISTS experience_level text DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS training_types text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sleep_hours text,
  ADD COLUMN IF NOT EXISTS primary_struggle text,
  ADD COLUMN IF NOT EXISTS plan_aggressiveness text DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS food_budget text DEFAULT 'flexible',
  ADD COLUMN IF NOT EXISTS body_fat_pct numeric;
