-- Fix missing CASCADE DELETE on tables that reference auth.users
-- Without these, deleting a user leaves orphaned rows

-- fight_camps: add CASCADE if FK exists, or add FK with CASCADE
DO $$
BEGIN
  -- Drop existing constraint if any, then re-add with CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'fight_camps' AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%user_id%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE fight_camps DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'fight_camps' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%user_id%'
      LIMIT 1
    );
  END IF;
  ALTER TABLE fight_camps
    ADD CONSTRAINT fight_camps_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'fight_camps FK update skipped: %', SQLERRM;
END $$;

-- meal_plans: ensure CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'meal_plans' AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%user_id%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE meal_plans DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'meal_plans' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%user_id%'
      LIMIT 1
    );
  END IF;
  ALTER TABLE meal_plans
    ADD CONSTRAINT meal_plans_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'meal_plans FK update skipped: %', SQLERRM;
END $$;

-- user_dietary_preferences: ensure CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'user_dietary_preferences' AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%user_id%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE user_dietary_preferences DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'user_dietary_preferences' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%user_id%'
      LIMIT 1
    );
  END IF;
  ALTER TABLE user_dietary_preferences
    ADD CONSTRAINT user_dietary_preferences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'user_dietary_preferences FK update skipped: %', SQLERRM;
END $$;
