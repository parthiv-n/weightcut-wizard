-- Extend nutrition_logs table for comprehensive meal tracking
ALTER TABLE public.nutrition_logs 
ADD COLUMN IF NOT EXISTS protein_g numeric,
ADD COLUMN IF NOT EXISTS carbs_g numeric,
ADD COLUMN IF NOT EXISTS fats_g numeric,
ADD COLUMN IF NOT EXISTS meal_type text CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
ADD COLUMN IF NOT EXISTS portion_size text,
ADD COLUMN IF NOT EXISTS is_ai_generated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recipe_notes text,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create meal_plans table for AI-generated multi-day plans
CREATE TABLE IF NOT EXISTS public.meal_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  plan_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  daily_calorie_target integer NOT NULL,
  dietary_preferences text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on meal_plans
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

-- Create policies for meal_plans
CREATE POLICY "Users can view their own meal plans"
ON public.meal_plans FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own meal plans"
ON public.meal_plans FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meal plans"
ON public.meal_plans FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meal plans"
ON public.meal_plans FOR DELETE
USING (auth.uid() = user_id);

-- Create user_preferences table for dietary preferences
CREATE TABLE IF NOT EXISTS public.user_dietary_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  dietary_restrictions text[],
  favorite_cuisines text[],
  disliked_foods text[],
  meal_preferences text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on user_dietary_preferences
ALTER TABLE public.user_dietary_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for user_dietary_preferences
CREATE POLICY "Users can view their own dietary preferences"
ON public.user_dietary_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dietary preferences"
ON public.user_dietary_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dietary preferences"
ON public.user_dietary_preferences FOR UPDATE
USING (auth.uid() = user_id);

-- Add trigger for updated_at on nutrition_logs
DROP TRIGGER IF EXISTS update_nutrition_logs_updated_at ON public.nutrition_logs;
CREATE TRIGGER update_nutrition_logs_updated_at
BEFORE UPDATE ON public.nutrition_logs
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Add trigger for updated_at on meal_plans
DROP TRIGGER IF EXISTS update_meal_plans_updated_at ON public.meal_plans;
CREATE TRIGGER update_meal_plans_updated_at
BEFORE UPDATE ON public.meal_plans
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Add trigger for updated_at on user_dietary_preferences
DROP TRIGGER IF EXISTS update_user_dietary_preferences_updated_at ON public.user_dietary_preferences;
CREATE TRIGGER update_user_dietary_preferences_updated_at
BEFORE UPDATE ON public.user_dietary_preferences
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();