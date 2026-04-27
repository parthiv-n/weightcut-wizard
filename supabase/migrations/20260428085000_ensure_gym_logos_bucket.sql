-- Ensure the `gym-logos` storage bucket exists with the right config.
--
-- The original bucket creation lives in `20260428010000_gym_logos.sql`, but
-- if that migration was somehow skipped on a deployed environment the iOS
-- upload surfaces a cryptic `TypeError: Load failed` instead of a friendly
-- "Bucket not found". This migration is intentionally narrow + idempotent —
-- it ONLY creates/updates the bucket. RLS policies and RPCs from the
-- original migration are left untouched.
--
-- Adds `image/heic` + `image/heif` to allowed_mime_types because iOS Camera
-- now produces HEIC by default. The client always resizes to webp/jpeg
-- before upload so this is belt-and-suspenders, not a hard requirement.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gym-logos',
  'gym-logos',
  true,
  5242880,
  ARRAY[
    'image/webp',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/heic',
    'image/heif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY[
        'image/webp',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/heic',
        'image/heif'
      ]::text[];

-- Add public.gyms to the supabase_realtime publication so athletes get
-- live logo updates the moment their coach uploads/changes one. Without
-- this, the client-side realtime subscription in useMyGyms.ts silently
-- never fires.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gyms'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.gyms';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
