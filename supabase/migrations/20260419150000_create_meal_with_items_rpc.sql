-- Migration: 20260419150000_create_meal_with_items_rpc.sql
-- (Renamed from 20260419050000 to preserve ordering after the compat view.)
-- Atomic meal-header + meal-items insert in a single round trip. All writes are
-- constrained to the calling user via SECURITY INVOKER (RLS on `meals` / `meal_items`
-- applies). Accepts a JSONB array of items so edge functions (analyze-meal,
-- scan-barcode, lookup-ingredient) and client hooks can insert N items in one call.

CREATE OR REPLACE FUNCTION public.create_meal_with_items(
  p_date DATE,
  p_meal_type TEXT,
  p_meal_name TEXT,
  p_notes TEXT DEFAULT NULL,
  p_is_ai_generated BOOLEAN DEFAULT FALSE,
  p_items JSONB DEFAULT '[]'::jsonb
) RETURNS TABLE(meal_id UUID, item_ids UUID[])
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_meal_id UUID;
  v_item_ids UUID[] := '{}';
  v_item JSONB;
  v_item_id UUID;
  v_position INT := 0;
BEGIN
  INSERT INTO public.meals(user_id, date, meal_type, meal_name, notes, is_ai_generated)
  VALUES (auth.uid(), p_date, p_meal_type, p_meal_name, p_notes, p_is_ai_generated)
  RETURNING id INTO v_meal_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.meal_items(meal_id, food_id, name, grams, calories, protein_g, carbs_g, fats_g, position)
    VALUES (
      v_meal_id,
      NULLIF(v_item->>'food_id','')::uuid,
      v_item->>'name',
      (v_item->>'grams')::NUMERIC,
      (v_item->>'calories')::NUMERIC,
      COALESCE((v_item->>'protein_g')::NUMERIC, 0),
      COALESCE((v_item->>'carbs_g')::NUMERIC, 0),
      COALESCE((v_item->>'fats_g')::NUMERIC, 0),
      v_position
    )
    RETURNING id INTO v_item_id;
    v_item_ids := array_append(v_item_ids, v_item_id);
    v_position := v_position + 1;
  END LOOP;

  RETURN QUERY SELECT v_meal_id, v_item_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.create_meal_with_items FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_meal_with_items TO authenticated;
