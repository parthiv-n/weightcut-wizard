-- Add additional columns to hydration_logs table for comprehensive tracking
ALTER TABLE public.hydration_logs
ADD COLUMN sodium_mg integer,
ADD COLUMN sweat_loss_percent numeric,
ADD COLUMN training_weight_pre numeric,
ADD COLUMN training_weight_post numeric,
ADD COLUMN notes text;

-- Create index for faster date-based queries
CREATE INDEX idx_hydration_logs_user_date ON public.hydration_logs(user_id, date DESC);