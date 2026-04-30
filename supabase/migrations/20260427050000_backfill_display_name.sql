-- Backfill profiles.display_name for users who set their name BEFORE the
-- display_name column existed. Their name lives only in client localStorage,
-- so the best server-side guess is the email-derived name (matches the
-- UserContext cold-start fallback).
--
-- Users will see their localStorage name on their own device immediately, and
-- the next time they save their name in Settings, the DB will get the real
-- value. This backfill just stops the coach dashboard from falling through
-- to athlete_type ("MMA") for existing rows.

UPDATE public.profiles AS p
SET display_name = INITCAP(SPLIT_PART(u.email, '@', 1))
FROM auth.users AS u
WHERE p.id = u.id
  AND (p.display_name IS NULL OR p.display_name = '')
  AND u.email IS NOT NULL;

NOTIFY pgrst, 'reload schema';
