-- Create fight_camps table
CREATE TABLE public.fight_camps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  event_name TEXT,
  fight_date DATE NOT NULL,
  profile_pic_url TEXT,
  starting_weight_kg NUMERIC,
  end_weight_kg NUMERIC,
  total_weight_cut NUMERIC,
  weight_via_dehydration NUMERIC,
  weight_via_carb_reduction NUMERIC,
  weigh_in_timing TEXT CHECK (weigh_in_timing IN ('day_before', 'day_of')),
  rehydration_notes TEXT,
  performance_feeling TEXT,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fight_camps ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for fight_camps
CREATE POLICY "Users can view their own fight camps"
  ON public.fight_camps
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fight camps"
  ON public.fight_camps
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fight camps"
  ON public.fight_camps
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fight camps"
  ON public.fight_camps
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add fight_camp_id to fight_week_plans
ALTER TABLE public.fight_week_plans
ADD COLUMN fight_camp_id UUID REFERENCES public.fight_camps(id) ON DELETE CASCADE;

-- Create trigger for updated_at
CREATE TRIGGER update_fight_camps_updated_at
  BEFORE UPDATE ON public.fight_camps
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create index for better performance
CREATE INDEX idx_fight_camps_user_id ON public.fight_camps(user_id);
CREATE INDEX idx_fight_camps_fight_date ON public.fight_camps(fight_date);