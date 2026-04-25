-- Performance migration:
--   1) Composite index on fight_camps(user_id, fight_date DESC) for FightCamps listings.
--   2) Rewrite RLS policies on hot tables so auth.uid() runs once per query (initPlan)
--      instead of once per row. Per Supabase docs this is up to ~10x faster on
--      RLS-heavy reads. Pattern: replace `auth.uid() = user_id` with
--      `(SELECT auth.uid()) = user_id`. Names are kept identical to the originals
--      so the policies remain idempotent across redeploys.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Missing composite index
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fight_camps_user_date
  ON public.fight_camps(user_id, fight_date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) RLS initPlan rewrites
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id);

-- weight_logs
DROP POLICY IF EXISTS "Users can view their own weight logs" ON public.weight_logs;
CREATE POLICY "Users can view their own weight logs"
  ON public.weight_logs FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own weight logs" ON public.weight_logs;
CREATE POLICY "Users can insert their own weight logs"
  ON public.weight_logs FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own weight logs" ON public.weight_logs;
CREATE POLICY "Users can update their own weight logs"
  ON public.weight_logs FOR UPDATE
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own weight logs" ON public.weight_logs;
CREATE POLICY "Users can delete their own weight logs"
  ON public.weight_logs FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- nutrition_logs is now a VIEW over meals + meal_items (see 20260419140000) and
-- inherits RLS from `meals` via security-invoker semantics — no policies to
-- rewrite here.

-- hydration_logs
DROP POLICY IF EXISTS "Users can view their own hydration logs" ON public.hydration_logs;
CREATE POLICY "Users can view their own hydration logs"
  ON public.hydration_logs FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own hydration logs" ON public.hydration_logs;
CREATE POLICY "Users can insert their own hydration logs"
  ON public.hydration_logs FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own hydration logs" ON public.hydration_logs;
CREATE POLICY "Users can update their own hydration logs"
  ON public.hydration_logs FOR UPDATE
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own hydration logs" ON public.hydration_logs;
CREATE POLICY "Users can delete their own hydration logs"
  ON public.hydration_logs FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- meals (nutrition v2)
DROP POLICY IF EXISTS "meals_select_own" ON public.meals;
CREATE POLICY "meals_select_own" ON public.meals
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "meals_insert_own" ON public.meals;
CREATE POLICY "meals_insert_own" ON public.meals
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "meals_update_own" ON public.meals;
CREATE POLICY "meals_update_own" ON public.meals
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "meals_delete_own" ON public.meals;
CREATE POLICY "meals_delete_own" ON public.meals
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- meal_items (nutrition v2 — indirect ownership via meals)
DROP POLICY IF EXISTS "meal_items_select_own" ON public.meal_items;
CREATE POLICY "meal_items_select_own" ON public.meal_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "meal_items_insert_own" ON public.meal_items;
CREATE POLICY "meal_items_insert_own" ON public.meal_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "meal_items_update_own" ON public.meal_items;
CREATE POLICY "meal_items_update_own" ON public.meal_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "meal_items_delete_own" ON public.meal_items;
CREATE POLICY "meal_items_delete_own" ON public.meal_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = (SELECT auth.uid()))
  );

-- sleep_logs
DROP POLICY IF EXISTS "Users can view own sleep logs" ON public.sleep_logs;
CREATE POLICY "Users can view own sleep logs"
  ON public.sleep_logs FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own sleep logs" ON public.sleep_logs;
CREATE POLICY "Users can insert own sleep logs"
  ON public.sleep_logs FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own sleep logs" ON public.sleep_logs;
CREATE POLICY "Users can update own sleep logs"
  ON public.sleep_logs FOR UPDATE
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own sleep logs" ON public.sleep_logs;
CREATE POLICY "Users can delete own sleep logs"
  ON public.sleep_logs FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- exercises (custom only)
DROP POLICY IF EXISTS "Users can read own custom exercises" ON public.exercises;
CREATE POLICY "Users can read own custom exercises"
  ON public.exercises FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own custom exercises" ON public.exercises;
CREATE POLICY "Users can insert own custom exercises"
  ON public.exercises FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id AND is_custom = true);

DROP POLICY IF EXISTS "Users can update own custom exercises" ON public.exercises;
CREATE POLICY "Users can update own custom exercises"
  ON public.exercises FOR UPDATE
  USING ((SELECT auth.uid()) = user_id AND is_custom = true);

DROP POLICY IF EXISTS "Users can delete own custom exercises" ON public.exercises;
CREATE POLICY "Users can delete own custom exercises"
  ON public.exercises FOR DELETE
  USING ((SELECT auth.uid()) = user_id AND is_custom = true);
