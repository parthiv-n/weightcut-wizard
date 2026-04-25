-- Migration: 20260419130000_meals_with_totals.sql
-- (Renamed from 20260419030000 to preserve ordering after create_nutrition_v2.)
-- Aggregated view: one row per meal with summed macro totals and item_count.
-- Used by the Nutrition page for the primary list render (1 row / meal) instead of
-- re-aggregating client-side. Inherits RLS from the underlying `meals` table via the
-- default security-invoker semantics in Postgres >= 15.

CREATE OR REPLACE VIEW public.meals_with_totals AS
SELECT
  m.id, m.user_id, m.date, m.meal_type, m.meal_name, m.notes, m.is_ai_generated, m.created_at,
  COALESCE(SUM(mi.calories), 0)::INT AS total_calories,
  COALESCE(SUM(mi.protein_g), 0)::NUMERIC(7,2) AS total_protein_g,
  COALESCE(SUM(mi.carbs_g), 0)::NUMERIC(7,2) AS total_carbs_g,
  COALESCE(SUM(mi.fats_g), 0)::NUMERIC(7,2) AS total_fats_g,
  COUNT(mi.id)::INT AS item_count
FROM public.meals m
LEFT JOIN public.meal_items mi ON mi.meal_id = m.id
GROUP BY m.id;

-- View inherits RLS from underlying tables via security invoker (default)
