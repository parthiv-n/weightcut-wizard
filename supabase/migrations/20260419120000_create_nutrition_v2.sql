-- Migration: 20260419120000_create_nutrition_v2.sql
-- (Renamed from 20260419020000 to preserve ordering after the archive migration.)
-- Nutrition v2 schema: foods catalog + meal header + meal_items.
-- Adds FK integrity, CHECK constraints, trigram/b-tree indexes, RLS policies,
-- and registers meals / meal_items with the supabase_realtime publication.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Foods catalog (shared, growing over time)
CREATE TABLE public.foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  brand TEXT,
  barcode TEXT UNIQUE,
  calories_per_100g NUMERIC(7,2) NOT NULL CHECK (calories_per_100g >= 0),
  protein_per_100g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (protein_per_100g >= 0),
  carbs_per_100g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (carbs_per_100g >= 0),
  fats_per_100g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (fats_per_100g >= 0),
  default_serving_g NUMERIC(6,2),
  source TEXT NOT NULL CHECK (source IN ('usda','openfoodfacts','user','ai')),
  source_ref TEXT,                           -- e.g. USDA fdcId, OFF barcode
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_ref)
);

CREATE INDEX idx_foods_name_trgm ON public.foods USING gin (name gin_trgm_ops);
CREATE INDEX idx_foods_barcode ON public.foods (barcode) WHERE barcode IS NOT NULL;

-- Meal header
CREATE TABLE public.meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'snack'
    CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  meal_name TEXT NOT NULL CHECK (char_length(trim(meal_name)) > 0),
  notes TEXT,
  is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meals_user_date ON public.meals (user_id, date DESC);
CREATE INDEX idx_meals_user_created ON public.meals (user_id, created_at DESC);

-- Meal items (foods with grams; either catalog food_id or ad-hoc)
CREATE TABLE public.meal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id UUID NOT NULL REFERENCES public.meals(id) ON DELETE CASCADE,
  food_id UUID REFERENCES public.foods(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  grams NUMERIC(7,2) NOT NULL CHECK (grams > 0),
  calories NUMERIC(7,2) NOT NULL CHECK (calories >= 0),
  protein_g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fats_g NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (fats_g >= 0),
  position INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_meal_items_meal ON public.meal_items (meal_id, position);
CREATE INDEX idx_meal_items_food ON public.meal_items (food_id) WHERE food_id IS NOT NULL;

-- RLS
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_items ENABLE ROW LEVEL SECURITY;

-- foods: everyone reads, authenticated users insert their own
CREATE POLICY "foods_read_all" ON public.foods FOR SELECT USING (TRUE);
CREATE POLICY "foods_insert_authed" ON public.foods FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (created_by IS NULL OR created_by = auth.uid()));
CREATE POLICY "foods_update_own_unverified" ON public.foods FOR UPDATE
  USING (auth.uid() = created_by AND verified = FALSE);

-- meals: owner only
CREATE POLICY "meals_select_own" ON public.meals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "meals_insert_own" ON public.meals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meals_update_own" ON public.meals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "meals_delete_own" ON public.meals FOR DELETE USING (auth.uid() = user_id);

-- meal_items: via parent meal
CREATE POLICY "meal_items_select_own" ON public.meal_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = auth.uid()));
CREATE POLICY "meal_items_insert_own" ON public.meal_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = auth.uid()));
CREATE POLICY "meal_items_update_own" ON public.meal_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = auth.uid()));
CREATE POLICY "meal_items_delete_own" ON public.meal_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_id AND m.user_id = auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.meals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_items;

COMMIT;
