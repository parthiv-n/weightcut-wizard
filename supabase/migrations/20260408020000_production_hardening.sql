-- Production hardening: missing indexes + AI function fix

-- Index on chat_messages for user queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_date
  ON chat_messages(user_id, created_at DESC);

-- Index on user_technique_progress for skill tree lookups
CREATE INDEX IF NOT EXISTS idx_user_technique_progress_user
  ON user_technique_progress(user_id);

-- Fix check_ai_usage_and_increment: make rate limit rollback atomic
-- The original function increments then rolls back in a separate UPDATE,
-- which is racy under concurrent requests. Fix: use a CTE or conditional increment.
CREATE OR REPLACE FUNCTION check_ai_usage_and_increment(
  p_user_id UUID,
  p_max_requests INT DEFAULT 1
) RETURNS JSONB AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_tier TEXT;
  v_expires_at TIMESTAMPTZ;
  v_count INT;
  v_prev_count INT;
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
  END IF;

  -- Get current count before incrementing
  SELECT request_count INTO v_prev_count
  FROM rate_limits
  WHERE function_name = 'ai_daily' AND user_id = p_user_id
    AND window_start::date = v_today
  FOR UPDATE;

  -- If already at or over limit, deny without incrementing
  IF v_prev_count IS NOT NULL AND v_prev_count >= p_max_requests THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'is_premium', false,
      'used', v_prev_count,
      'limit', p_max_requests
    );
  END IF;

  -- Safe to increment (or insert if new day/user)
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

  RETURN jsonb_build_object(
    'allowed', true,
    'is_premium', false,
    'used', v_count,
    'limit', p_max_requests
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
