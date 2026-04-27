-- Defensive RLS reset for gym-logos storage uploads.
-- The original "Coaches manage own gym logo" FOR ALL policy can be
-- difficult to debug when one specific operation (INSERT vs UPDATE vs
-- DELETE) is failing — Supabase Studio shows a single combined denial.
-- This migration splits it into four explicit per-operation policies so
-- failures are granular and observable, and re-issues the public read
-- policy idempotently.
--
-- Path layout (unchanged): gym-logos/{gym_id}/logo.{ext}
-- (storage.foldername(name))[1] = '{gym_id}' as TEXT.

-- ── 1. Drop existing policies cleanly ────────────────────────────────
DROP POLICY IF EXISTS "Coaches manage own gym logo" ON storage.objects;
DROP POLICY IF EXISTS "Gym logos public read" ON storage.objects;
DROP POLICY IF EXISTS "gym_logos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "gym_logos_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "gym_logos_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "gym_logos_owner_delete" ON storage.objects;

-- ── 2. Public read — anyone can fetch a logo URL ─────────────────────
CREATE POLICY "gym_logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gym-logos');

-- ── 3. Coach (gym owner) can INSERT — first-time logo upload ─────────
CREATE POLICY "gym_logos_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gym-logos'
    AND EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id::text = (storage.foldername(name))[1]
        AND g.owner_user_id = (SELECT auth.uid())
    )
  );

-- ── 4. Coach can UPDATE existing object metadata ─────────────────────
CREATE POLICY "gym_logos_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'gym-logos'
    AND EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id::text = (storage.foldername(name))[1]
        AND g.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'gym-logos'
    AND EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id::text = (storage.foldername(name))[1]
        AND g.owner_user_id = (SELECT auth.uid())
    )
  );

-- ── 5. Coach can DELETE (replace flow + remove logo flow) ────────────
CREATE POLICY "gym_logos_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'gym-logos'
    AND EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id::text = (storage.foldername(name))[1]
        AND g.owner_user_id = (SELECT auth.uid())
    )
  );

-- ── 6. Re-affirm bucket config (idempotent) ──────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gym-logos', 'gym-logos', true, 5242880,
  ARRAY['image/webp','image/png','image/jpeg','image/jpg','image/heic','image/heif']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/webp','image/png','image/jpeg','image/jpg','image/heic','image/heif']::text[];

NOTIFY pgrst, 'reload schema';
