-- Prevent accidental duplicate camps created by double-clicks / retries.
-- Same user + same name + same fight_date = treated as the same camp.
-- First delete existing exact-duplicates, keeping the oldest row per group.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, name, fight_date
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.fight_camps
)
DELETE FROM public.fight_camps
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS fight_camps_user_name_date_key
  ON public.fight_camps (user_id, name, fight_date);
