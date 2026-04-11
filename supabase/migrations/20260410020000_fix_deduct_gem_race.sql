-- Fix race condition: concurrent deduct_gem calls can double-deduct.
-- Uses FOR UPDATE to serialize concurrent reads on the same user row.
CREATE OR REPLACE FUNCTION deduct_gem(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_gems INTEGER;
BEGIN
  -- Lock the row to prevent concurrent reads
  SELECT gems INTO v_gems FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF v_gems IS NULL OR v_gems <= 0 THEN
    RETURN -1;
  END IF;

  UPDATE profiles SET gems = gems - 1
  WHERE id = p_user_id
  RETURNING gems INTO v_gems;

  RETURN v_gems;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
