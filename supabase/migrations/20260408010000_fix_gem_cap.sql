-- Fix 1: Cap daily free gem grant — only grant if gems < 2
CREATE OR REPLACE FUNCTION grant_daily_free_gem(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_gems INTEGER;
BEGIN
  UPDATE profiles
  SET
    gems = CASE
      WHEN (last_free_gem_date IS NULL OR last_free_gem_date < CURRENT_DATE) AND gems < 2
      THEN gems + 1
      ELSE gems
    END,
    last_free_gem_date = CURRENT_DATE
  WHERE id = p_user_id
  RETURNING gems INTO v_gems;

  RETURN COALESCE(v_gems, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix 2: New users start with 2 gems (the daily cap)
ALTER TABLE profiles ALTER COLUMN gems SET DEFAULT 2;
