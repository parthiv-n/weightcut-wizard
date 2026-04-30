-- Fix: infinite recursion between gyms <-> gym_members RLS policies.
-- Root cause:
--   gyms.gyms_member_read       -> EXISTS (SELECT FROM gym_members ...)
--   gym_members.gym_members_coach_read -> EXISTS (SELECT FROM gyms ...)
-- Each cross-table EXISTS re-evaluates the *other* table's policies, looping.
-- Fix: replace cross-table EXISTS checks with SECURITY DEFINER helpers that
-- bypass RLS internally (same pattern as coach_can_view_athlete).

-- ── 1. Helpers (bypass RLS via SECURITY DEFINER) ──────────────────────
CREATE OR REPLACE FUNCTION public.is_gym_member(p_gym_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.gym_members
    WHERE gym_id = p_gym_id
      AND user_id = p_user_id
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_gym_owner(p_gym_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.gyms
    WHERE id = p_gym_id
      AND owner_user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_gym_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_gym_owner(UUID, UUID) TO authenticated;

-- ── 2. Rewrite gyms policies ──────────────────────────────────────────
DROP POLICY IF EXISTS gyms_member_read ON public.gyms;
CREATE POLICY gyms_member_read ON public.gyms
  FOR SELECT TO authenticated
  USING (public.is_gym_member(gyms.id, (SELECT auth.uid())));

-- gyms_owner_all and gyms_lookup_by_invite have no cross-table refs — leave them.

-- ── 3. Rewrite gym_members policies ───────────────────────────────────
DROP POLICY IF EXISTS gym_members_coach_read ON public.gym_members;
CREATE POLICY gym_members_coach_read ON public.gym_members
  FOR SELECT TO authenticated
  USING (public.is_gym_owner(gym_members.gym_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS gym_members_coach_manage ON public.gym_members;
CREATE POLICY gym_members_coach_manage ON public.gym_members
  FOR ALL TO authenticated
  USING (public.is_gym_owner(gym_members.gym_id, (SELECT auth.uid())))
  WITH CHECK (public.is_gym_owner(gym_members.gym_id, (SELECT auth.uid())));

-- gym_members_self_read / _self_join / _self_update don't cross tables.

NOTIFY pgrst, 'reload schema';
