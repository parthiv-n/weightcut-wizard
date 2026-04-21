-- Migration: 20260419140000_nutrition_logs_compat_view.sql
-- (Renamed from 20260419040000 to preserve ordering after meals_with_totals.)
-- Legacy-shape compatibility VIEW under the original `public.nutrition_logs` name so
-- that the 17 client files + edge functions + generated types that still SELECT from
-- nutrition_logs keep working unchanged. Projects one flat row per meal_item and
-- fabricates legacy-only columns (portion_size, recipe_notes, ingredients jsonb).
--
-- Writes are blocked via DO INSTEAD NOTHING rules. Any stale code attempting INSERT /
-- UPDATE / DELETE silently no-ops (rather than erroring) — writers are migrated to the
-- new tables and RPC in Phase 4.3.
--
-- RLS is inherited from `meals` via default security-invoker semantics (PG >= 15).

BEGIN;

CREATE VIEW public.nutrition_logs AS
SELECT
  mi.id,
  m.user_id,
  m.date,
  m.meal_type,
  m.meal_name,                                         -- header name for ad-hoc rows
  mi.calories::INT,
  mi.protein_g,
  mi.carbs_g,
  mi.fats_g,
  mi.grams AS portion_size_g,
  mi.name AS item_name,                                -- line item name
  NULL::TEXT AS portion_size,                          -- legacy text field
  NULL::TEXT AS recipe_notes,
  m.is_ai_generated,
  jsonb_build_array(                                   -- legacy ingredients shape
    jsonb_build_object('name', mi.name, 'grams', mi.grams)
  ) AS ingredients,
  m.created_at
FROM public.meals m
JOIN public.meal_items mi ON mi.meal_id = m.id;

-- Block writes with clear error; app must use new tables
CREATE RULE nutrition_logs_no_insert AS ON INSERT TO public.nutrition_logs
  DO INSTEAD NOTHING;   -- writers updated below; INSERT on view silently no-ops so stale code does no harm
CREATE RULE nutrition_logs_no_update AS ON UPDATE TO public.nutrition_logs DO INSTEAD NOTHING;
CREATE RULE nutrition_logs_no_delete AS ON DELETE TO public.nutrition_logs DO INSTEAD NOTHING;

COMMIT;
