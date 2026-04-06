-- Add subscription columns to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS revenuecat_customer_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ NULL;

-- Index for webhook lookups by RevenueCat customer ID
CREATE INDEX IF NOT EXISTS idx_profiles_revenuecat_customer_id
  ON profiles (revenuecat_customer_id)
  WHERE revenuecat_customer_id IS NOT NULL;

-- RLS: users can read their own subscription columns (already covered by existing row-level SELECT policy)
-- but cannot update subscription columns directly — only service role (webhooks) can write them.
-- We achieve this by creating a restrictive UPDATE policy for subscription columns.
-- Note: if an existing UPDATE policy allows all column updates, we add a trigger-based guard instead.

CREATE OR REPLACE FUNCTION prevent_subscription_self_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow service_role to update anything
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- For authenticated users, prevent direct subscription field changes
  IF OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier
     OR OLD.subscription_expires_at IS DISTINCT FROM NEW.subscription_expires_at
     OR OLD.revenuecat_customer_id IS DISTINCT FROM NEW.revenuecat_customer_id
     OR OLD.subscription_updated_at IS DISTINCT FROM NEW.subscription_updated_at
  THEN
    -- Reset subscription fields to old values
    NEW.subscription_tier := OLD.subscription_tier;
    NEW.subscription_expires_at := OLD.subscription_expires_at;
    NEW.revenuecat_customer_id := OLD.revenuecat_customer_id;
    NEW.subscription_updated_at := OLD.subscription_updated_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_prevent_subscription_self_update ON profiles;
CREATE TRIGGER tr_prevent_subscription_self_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_subscription_self_update();
