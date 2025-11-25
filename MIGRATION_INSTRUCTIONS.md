# Migration Instructions for Manual Nutrition Override Feature

## Required Migrations

You need to run **TWO** migrations in your Supabase SQL Editor:

### 1. AI Nutrition Targets Migration (if not already run)
**File**: `supabase/migrations/20251122230028_add_ai_nutrition_targets.sql`

Run this SQL in Supabase SQL Editor:
```sql
-- Add AI nutrition recommendation columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS ai_recommended_calories NUMERIC,
ADD COLUMN IF NOT EXISTS ai_recommended_protein_g NUMERIC,
ADD COLUMN IF NOT EXISTS ai_recommended_carbs_g NUMERIC,
ADD COLUMN IF NOT EXISTS ai_recommended_fats_g NUMERIC,
ADD COLUMN IF NOT EXISTS ai_recommendations_updated_at TIMESTAMPTZ;

-- Add comments to clarify purpose
COMMENT ON COLUMN public.profiles.ai_recommended_calories IS 'AI-recommended daily calorie target from weight-tracker-analysis';
COMMENT ON COLUMN public.profiles.ai_recommended_protein_g IS 'AI-recommended daily protein target in grams';
COMMENT ON COLUMN public.profiles.ai_recommended_carbs_g IS 'AI-recommended daily carbs target in grams';
COMMENT ON COLUMN public.profiles.ai_recommended_fats_g IS 'AI-recommended daily fats target in grams';
COMMENT ON COLUMN public.profiles.ai_recommendations_updated_at IS 'Timestamp when AI recommendations were last generated';
```

### 2. Manual Nutrition Override Migration (NEW)
**File**: `supabase/migrations/20251124213104_add_manual_nutrition_override.sql`

Run this SQL in Supabase SQL Editor:
```sql
-- Add manual nutrition override flag to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS manual_nutrition_override BOOLEAN DEFAULT false;

-- Add comment to clarify the field's purpose
COMMENT ON COLUMN public.profiles.manual_nutrition_override IS 'When true, ai_recommended_* fields contain manually set values instead of AI recommendations';
```

## Steps to Apply

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy and paste each migration SQL above (one at a time)
6. Click **Run** to execute
7. Wait a few seconds for PostgREST schema cache to refresh
8. Clear your browser cache and hard refresh the app (Ctrl+Shift+R or Cmd+Shift+R)

## Verify Migrations Were Applied

Run this query to verify all columns exist:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN (
  'ai_recommended_calories',
  'ai_recommended_protein_g',
  'ai_recommended_carbs_g',
  'ai_recommended_fats_g',
  'manual_nutrition_override'
)
ORDER BY column_name;
```

You should see all 5 columns listed.

## If Schema Cache Is Still Stale

If you've run the migrations but still get schema cache errors:

1. Wait 30-60 seconds (PostgREST cache refreshes periodically)
2. Restart your Supabase project (Settings → General → Restart Project)
3. Clear browser cache completely
4. Try again


