-- Migration: 20260419025000_nutrition_v2_rls_hardening.sql
-- Purpose: Close RLS holes identified in the security-architect audit of
-- 20260419020000_create_nutrition_v2.sql and 20260419030000_meals_with_totals.sql.
--
-- This is a PATCH migration — it does NOT modify the architect's migrations
-- in place; it augments them. Apply AFTER the v2 create migration.
--
-- Findings addressed:
--   H1. meals UPDATE policy had no WITH CHECK — allowed re-attribution of user_id.
--   H2. meal_items UPDATE policy had no WITH CHECK — allowed moving items across
--       tenants by editing meal_id.
--   H3. foods UPDATE policy had no WITH CHECK — allowed flipping verified=true
--       or reassigning created_by.
--   H4. foods INSERT WITH CHECK allowed created_by IS NULL for authed users —
--       tightened to require created_by = auth.uid() strictly from client.
--   H5. meals_with_totals and (separately) the nutrition_logs compat view must
--       use security_invoker=true explicitly so they inherit the caller's RLS
--       rather than running with the view owner's privileges.

BEGIN;

-- ============================================================================
-- H1. meals UPDATE WITH CHECK
-- ============================================================================
DROP POLICY IF EXISTS "meals_update_own" ON public.meals;
CREATE POLICY "meals_update_own" ON public.meals
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- H2. meal_items UPDATE WITH CHECK
-- ============================================================================
DROP POLICY IF EXISTS "meal_items_update_own" ON public.meal_items;
CREATE POLICY "meal_items_update_own" ON public.meal_items
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = auth.uid())
  );

-- ============================================================================
-- H3. foods UPDATE WITH CHECK (prevent verified flip + created_by reassignment)
-- ============================================================================
DROP POLICY IF EXISTS "foods_update_own_unverified" ON public.foods;
CREATE POLICY "foods_update_own_unverified" ON public.foods
  FOR UPDATE
  USING (auth.uid() = created_by AND verified = FALSE)
  WITH CHECK (auth.uid() = created_by AND verified = FALSE);

-- ============================================================================
-- H4. foods INSERT: require created_by = auth.uid() (drop the IS NULL branch).
--     Service-role writes bypass RLS, so server-side seed jobs still work.
-- ============================================================================
DROP POLICY IF EXISTS "foods_insert_authed" ON public.foods;
CREATE POLICY "foods_insert_authed" ON public.foods
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

-- Optional explicit DENY on DELETE — not strictly needed (absence of policy
-- already denies under RLS), but makes intent auditable.
DROP POLICY IF EXISTS "foods_no_client_delete" ON public.foods;
CREATE POLICY "foods_no_client_delete" ON public.foods
  FOR DELETE
  USING (FALSE);

-- ============================================================================
-- H5. Explicit security_invoker on views so RLS of underlying tables applies
-- to the calling user (not the view owner). Default in PG 15+, but Supabase
-- managed projects have historically shipped mixed defaults — be explicit.
-- ============================================================================
ALTER VIEW public.meals_with_totals SET (security_invoker = true);

-- The compat view is created in 20260419040000_nutrition_logs_compat_view.sql.
-- Guard with an IF EXISTS so this patch can land before or after that migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'nutrition_logs'
  ) THEN
    EXECUTE 'ALTER VIEW public.nutrition_logs SET (security_invoker = true)';
  END IF;
END $$;

COMMIT;
