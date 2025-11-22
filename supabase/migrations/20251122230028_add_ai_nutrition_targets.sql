-- Add AI nutrition recommendation columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS ai_recommended_calories NUMERIC,
ADD COLUMN IF NOT EXISTS ai_recommended_protein_g NUMERIC,
ADD COLUMN IF NOT EXISTS ai_recommended_carbs_g NUMERIC,
ADD COLUMN IF NOT EXISTS ai_recommended_fats_g NUMERIC,
ADD COLUMN IF NOT EXISTS ai_recommendations_updated_at TIMESTAMPTZ;

-- Add comments to clarify purpose
COMMENT ON COLUMN public.profiles.ai_recommended_calories IS 'AI-recommended daily calorie target from weight-tracker-analysis';
COMMENT ON COLUMN public.profiles.ai_recommended_protein_g IS 'AI-recommended daily protein target in grams';
COMMENT ON COLUMN public.profiles.ai_recommended_carbs_g IS 'AI-recommended daily carbs target in grams';
COMMENT ON COLUMN public.profiles.ai_recommended_fats_g IS 'AI-recommended daily fats target in grams';
COMMENT ON COLUMN public.profiles.ai_recommendations_updated_at IS 'Timestamp when AI recommendations were last generated';

