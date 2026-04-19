-- Add normal_daily_carbs_g to profiles for fight-week protocol generation.
-- The fight-week AI analysis uses this baseline to plan the carb taper
-- (days 7-5 at 80%, days 4-3 at 50%, days 2-1 under 50g depletion).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS normal_daily_carbs_g INT;
