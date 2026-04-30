-- Diagnostic probe: print live state of the gym-logos infrastructure to
-- the migration log. Read-only — no schema changes. Re-runnable.

DO $$
DECLARE
  r RECORD;
  cnt INT;
BEGIN
  RAISE NOTICE '====== PROBE: gym-logos infrastructure ======';

  -- 1. Bucket config
  RAISE NOTICE '--- Bucket config ---';
  FOR r IN SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'gym-logos' LOOP
    RAISE NOTICE 'bucket: id=%, public=%, size_limit=%, mimes=%', r.id, r.public, r.file_size_limit, r.allowed_mime_types;
  END LOOP;
  SELECT count(*) INTO cnt FROM storage.buckets WHERE id = 'gym-logos';
  IF cnt = 0 THEN RAISE NOTICE 'BUCKET MISSING'; END IF;

  -- 2. logo_url column
  RAISE NOTICE '--- gyms.logo_url column ---';
  FOR r IN SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_schema='public' AND table_name='gyms' AND column_name='logo_url' LOOP
    RAISE NOTICE 'column: name=%, type=%, nullable=%', r.column_name, r.data_type, r.is_nullable;
  END LOOP;
  SELECT count(*) INTO cnt FROM information_schema.columns
    WHERE table_schema='public' AND table_name='gyms' AND column_name='logo_url';
  IF cnt = 0 THEN RAISE NOTICE 'COLUMN MISSING'; END IF;

  -- 3. Storage RLS policies on objects for gym-logos
  RAISE NOTICE '--- Storage RLS policies ---';
  FOR r IN SELECT policyname, cmd FROM pg_policies
           WHERE schemaname='storage' AND tablename='objects'
             AND (policyname LIKE 'gym_logos%' OR policyname LIKE 'Gym logos%' OR policyname LIKE 'Coaches%') LOOP
    RAISE NOTICE 'policy: name=%, cmd=%', r.policyname, r.cmd;
  END LOOP;

  -- 4. gyms RLS
  RAISE NOTICE '--- gyms RLS ---';
  FOR r IN SELECT policyname, cmd FROM pg_policies
           WHERE schemaname='public' AND tablename='gyms' LOOP
    RAISE NOTICE 'policy: name=%, cmd=%', r.policyname, r.cmd;
  END LOOP;

  -- 5. foldername parsing
  RAISE NOTICE '--- foldername parsing ---';
  RAISE NOTICE 'first segment of "abc-uuid/logo.webp" = %',
    (storage.foldername('abc-uuid/logo.webp'))[1];

  -- 6. Realtime publication
  RAISE NOTICE '--- Realtime publication for gyms ---';
  SELECT count(*) INTO cnt FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='gyms';
  RAISE NOTICE 'gyms in supabase_realtime: %', cnt;

  RAISE NOTICE '====== PROBE COMPLETE ======';
END $$;
