-- Add gems currency columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gems INTEGER NOT NULL DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_free_gem_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ads_watched_today INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ads_watched_date DATE;

-- Grant daily free gem (idempotent)
CREATE OR REPLACE FUNCTION grant_daily_free_gem(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_gems INTEGER;
BEGIN
  UPDATE profiles
  SET
    gems = CASE
      WHEN last_free_gem_date IS NULL OR last_free_gem_date < CURRENT_DATE
      THEN gems + 1
      ELSE gems
    END,
    last_free_gem_date = CURRENT_DATE
  WHERE id = p_user_id
  RETURNING gems INTO v_gems;

  RETURN COALESCE(v_gems, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Deduct 1 gem atomically (returns -1 if insufficient)
CREATE OR REPLACE FUNCTION deduct_gem(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_gems INTEGER;
BEGIN
  UPDATE profiles
  SET gems = gems - 1
  WHERE id = p_user_id AND gems > 0
  RETURNING gems INTO v_gems;

  IF v_gems IS NULL THEN
    RETURN -1;
  END IF;

  RETURN v_gems;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reward gem for watching ad (with daily cap of 5)
CREATE OR REPLACE FUNCTION reward_ad_gem(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_gems INTEGER;
  v_ads INTEGER;
BEGIN
  -- Reset counter if new day
  UPDATE profiles
  SET
    ads_watched_today = CASE
      WHEN ads_watched_date IS NULL OR ads_watched_date < CURRENT_DATE THEN 0
      ELSE ads_watched_today
    END,
    ads_watched_date = CURRENT_DATE
  WHERE id = p_user_id;

  -- Check daily ad cap
  SELECT ads_watched_today INTO v_ads FROM profiles WHERE id = p_user_id;
  IF v_ads >= 5 THEN
    SELECT gems INTO v_gems FROM profiles WHERE id = p_user_id;
    RETURN jsonb_build_object('success', false, 'reason', 'daily_cap', 'gems', v_gems, 'ads_remaining', 0);
  END IF;

  -- Grant gem and increment ad counter
  UPDATE profiles
  SET
    gems = gems + 1,
    ads_watched_today = ads_watched_today + 1
  WHERE id = p_user_id
  RETURNING gems, ads_watched_today INTO v_gems, v_ads;

  RETURN jsonb_build_object('success', true, 'gems', v_gems, 'ads_remaining', 5 - v_ads);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
