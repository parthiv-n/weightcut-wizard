-- Nutrition integrity migration
-- 1) Backfill existing NULL meal_type using time-of-day inference from created_at
-- 2) Backfill existing NULL/empty meal_name with a safe default
-- 3) Add NOT NULL + DEFAULT on both columns
-- 4) Ensure nutrition_logs is part of the supabase_realtime publication

BEGIN;

UPDATE public.nutrition_logs
SET meal_type = CASE
  WHEN EXTRACT(HOUR FROM created_at) BETWEEN 4  AND 9  THEN 'breakfast'
  WHEN EXTRACT(HOUR FROM created_at) BETWEEN 10 AND 13 THEN 'lunch'
  WHEN EXTRACT(HOUR FROM created_at) BETWEEN 14 AND 16 THEN 'snack'
  WHEN EXTRACT(HOUR FROM created_at) BETWEEN 17 AND 21 THEN 'dinner'
  ELSE 'snack'
END
WHERE meal_type IS NULL;

UPDATE public.nutrition_logs
SET meal_name = 'Logged meal'
WHERE meal_name IS NULL OR TRIM(meal_name) = '';

ALTER TABLE public.nutrition_logs
  ALTER COLUMN meal_type SET DEFAULT 'snack',
  ALTER COLUMN meal_type SET NOT NULL,
  ALTER COLUMN meal_name SET DEFAULT 'Logged meal',
  ALTER COLUMN meal_name SET NOT NULL;

-- Enable realtime on the table (idempotent: check publication membership first).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'nutrition_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nutrition_logs;
  END IF;
END$$;

COMMIT;
