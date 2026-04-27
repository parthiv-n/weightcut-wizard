-- Belt-and-braces: re-affirm gyms.logo_url exists and force PostgREST to
-- reload its schema cache. The silent symptom we're chasing is upload
-- succeeds → gyms.update({ logo_url }) fails with PGRST204 because the
-- API thinks the column doesn't exist (cache stale on managed Supabase).

ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS logo_url TEXT NULL;

-- Force-reload PostgREST: schema + config (some Supabase environments only
-- pick up the schema reload after a config reload).
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
