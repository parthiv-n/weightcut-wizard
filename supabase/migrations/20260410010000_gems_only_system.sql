-- Switch to gems-only AI access system.
-- rate_limits table and check_ai_usage_and_increment are no longer used.
-- Gems are the sole currency: 1 gem = 1 AI call.
-- Daily free gem caps at 2. Ad gems stack on top with no cap.

-- Drop the unused RPC function (had type mismatch bug with window_start)
DROP FUNCTION IF EXISTS check_ai_usage_and_increment(UUID, INT);
