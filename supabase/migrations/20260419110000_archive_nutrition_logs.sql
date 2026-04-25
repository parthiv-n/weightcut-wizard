-- Migration: 20260419110000_archive_nutrition_logs.sql
-- (Renamed from 20260419010000 to avoid timestamp collision with add_cut_plan_storage.sql)
-- Archive the legacy nutrition_logs table as part of the 2026-04-19 nutrition overhaul.
-- The archived table retains its existing RLS policies so users can later recover/export
-- their own rows. The client will stop reading from this table directly; a compat view
-- (see 20260419140000_nutrition_logs_compat_view.sql) takes over the public name.

BEGIN;

ALTER TABLE public.nutrition_logs RENAME TO nutrition_logs_v1;

-- Keep RLS enabled and user-scoped SELECT so users can recover their own rows
-- via a future export tool. No app reads this table.

COMMENT ON TABLE public.nutrition_logs_v1 IS
  'Archived 2026-04-19 during nutrition overhaul. Read-only. Not queried by client.';

COMMIT;
