-- Deduplicate rate_limits before adding unique constraint
-- Keep the row with the highest request_count for each (function_name, user_id) pair
DELETE FROM rate_limits a
USING rate_limits b
WHERE a.function_name = b.function_name
  AND a.user_id = b.user_id
  AND a.id < b.id;

-- Ensure unique constraint on rate_limits for atomic upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rate_limits_function_user_unique'
  ) THEN
    ALTER TABLE rate_limits
      ADD CONSTRAINT rate_limits_function_user_unique
      UNIQUE (function_name, user_id);
  END IF;
END $$;

-- Atomic AI usage check-and-increment function
-- Returns JSON: { allowed: bool, is_premium: bool, used: int, limit: int }
CREATE OR REPLACE FUNCTION check_ai_usage_and_increment(
  p_user_id UUID,
  p_max_requests INT DEFAULT 1
) RETURNS JSONB AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_tier TEXT;
  v_expires_at TIMESTAMPTZ;
  v_count INT;
BEGIN
  -- Check subscription status
  SELECT subscription_tier, subscription_expires_at
  INTO v_tier, v_expires_at
  FROM profiles
  WHERE id = p_user_id;

  -- Premium user with valid (or null = lifetime) expiry => unlimited
  IF v_tier IS NOT NULL AND v_tier != 'free' THEN
    IF v_expires_at IS NULL OR v_expires_at > NOW() THEN
      RETURN jsonb_build_object(
        'allowed', true,
        'is_premium', true,
        'used', 0,
        'limit', -1
      );
    END IF;
    -- Expired subscription — treat as free
  END IF;

  -- Free user: atomic upsert into rate_limits
  INSERT INTO rate_limits (function_name, user_id, request_count, window_start)
  VALUES ('ai_daily', p_user_id, 1, v_today::text)
  ON CONFLICT ON CONSTRAINT rate_limits_function_user_unique
  DO UPDATE SET
    request_count = CASE
      WHEN rate_limits.window_start::date < v_today THEN 1
      ELSE rate_limits.request_count + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start::date < v_today THEN v_today::text
      ELSE rate_limits.window_start
    END
  RETURNING request_count INTO v_count;

  IF v_count > p_max_requests THEN
    -- Roll back the over-increment
    UPDATE rate_limits
    SET request_count = request_count - 1
    WHERE function_name = 'ai_daily' AND user_id = p_user_id;

    RETURN jsonb_build_object(
      'allowed', false,
      'is_premium', false,
      'used', v_count - 1,
      'limit', p_max_requests
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'is_premium', false,
    'used', v_count,
    'limit', p_max_requests
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
