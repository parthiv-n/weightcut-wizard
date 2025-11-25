-- Add manual nutrition override flag to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS manual_nutrition_override BOOLEAN DEFAULT false;

-- Add comment to clarify the field's purpose
COMMENT ON COLUMN public.profiles.manual_nutrition_override IS 'When true, ai_recommended_* fields contain manually set values instead of AI recommendations';


