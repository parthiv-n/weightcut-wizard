-- Add fight_week_target_kg to profiles table
ALTER TABLE public.profiles
ADD COLUMN fight_week_target_kg NUMERIC;

-- Add comment to clarify the difference
COMMENT ON COLUMN public.profiles.goal_weight_kg IS 'Fight night/weigh-in weight (competition weight class)';
COMMENT ON COLUMN public.profiles.fight_week_target_kg IS 'Weight target before dehydration cut (diet-down goal)';

-- Update existing profiles to set fight_week_target to be 5kg above goal_weight if not set
-- This is a reasonable default assumption for the dehydration cut
UPDATE public.profiles
SET fight_week_target_kg = goal_weight_kg + 5
WHERE fight_week_target_kg IS NULL;