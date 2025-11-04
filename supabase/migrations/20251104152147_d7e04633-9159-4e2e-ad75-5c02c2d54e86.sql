-- Add ingredients column to nutrition_logs for storing ingredient breakdowns
ALTER TABLE public.nutrition_logs 
ADD COLUMN IF NOT EXISTS ingredients jsonb;

-- The ingredients will be stored as JSON array like:
-- [{"name": "Chicken breast", "grams": 200}, {"name": "Brown rice", "grams": 150}]

COMMENT ON COLUMN public.nutrition_logs.ingredients IS 'Array of ingredients with name and gram weight: [{"name": "ingredient", "grams": 100}]';