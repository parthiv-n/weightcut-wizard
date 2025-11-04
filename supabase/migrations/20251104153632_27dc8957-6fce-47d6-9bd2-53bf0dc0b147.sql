-- Create fight week plans table
CREATE TABLE public.fight_week_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fight_date DATE NOT NULL,
  starting_weight_kg NUMERIC NOT NULL,
  target_weight_kg NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, fight_date)
);

-- Create fight week daily logs table
CREATE TABLE public.fight_week_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  weight_kg NUMERIC,
  carbs_g NUMERIC,
  fluid_intake_ml INTEGER,
  sweat_session_min INTEGER,
  supplements TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, log_date)
);

-- Enable RLS
ALTER TABLE public.fight_week_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fight_week_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for fight_week_plans
CREATE POLICY "Users can view their own fight week plans"
ON public.fight_week_plans FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fight week plans"
ON public.fight_week_plans FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fight week plans"
ON public.fight_week_plans FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fight week plans"
ON public.fight_week_plans FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- RLS Policies for fight_week_logs
CREATE POLICY "Users can view their own fight week logs"
ON public.fight_week_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fight week logs"
ON public.fight_week_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fight week logs"
ON public.fight_week_logs FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fight week logs"
ON public.fight_week_logs FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Add triggers for updated_at
CREATE TRIGGER update_fight_week_plans_updated_at
BEFORE UPDATE ON public.fight_week_plans
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_fight_week_logs_updated_at
BEFORE UPDATE ON public.fight_week_logs
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();