# Ads & Gems Implementation Plan

## Overview

Add an in-app currency ("Gems") that gates AI calls. Free users get 1 gem/day. They can watch rewarded video ads to earn more gems. Pro subscribers bypass gems entirely.

---

## 1. AdMob Account & Configuration

### 1.1 Create AdMob Account
- Go to [admob.google.com](https://admob.google.com)
- Sign in with your Google account
- Complete business details and payment info

### 1.2 Register iOS App
- In AdMob dashboard: Apps → Add App → iOS
- Enter your App Store URL (or add manually with bundle ID: `com.weightcutwizard.app`)
- Note the **App ID** (format: `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`)

### 1.3 Create Rewarded Ad Unit
- In your app's ad units: Add Ad Unit → Rewarded
- Name it: "AI Gem Reward"
- Set reward: Amount = 1, Type = "gem"
- Note the **Ad Unit ID** (format: `ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ`)
- Also create a **test ad unit** for development (or use Google's test IDs)

### 1.4 iOS Configuration
Add to `ios/App/App/Info.plist`:
```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY</string>
<key>SKAdNetworkItems</key>
<array>
  <dict>
    <key>SKAdNetworkIdentifier</key>
    <string>cstr6suwn9.skadnetwork</string>
  </dict>
</array>
<key>NSUserTrackingUsageDescription</key>
<string>This identifier will be used to deliver personalized ads to you.</string>
```

### 1.5 App Tracking Transparency (iOS 14.5+)
Apple requires an ATT prompt before showing personalized ads. You'll need to:
- Install `@capacitor/app-tracking-transparency` or handle via AdMob's built-in ATT support
- Show the prompt on first app launch (before initializing ads)
- If user declines, ads still show but are non-personalized (lower eCPM)

---

## 2. Install Dependencies

```bash
npm install @capacitor-community/admob
npx cap sync ios
```

After sync, open Xcode and verify the AdMob pod is installed:
```
ios/App/Podfile → should include CapacitorCommunityAdmob
```

Run `pod install` in `ios/App/` if needed.

---

## 3. Database Schema Changes

### 3.1 Add Gems Columns to Profiles

Create a new Supabase migration:

```sql
-- Migration: add_gems_to_profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gems INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_free_gem_date DATE,
  ADD COLUMN IF NOT EXISTS ads_watched_today INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ads_watched_date DATE;

-- Ensure existing users get 1 gem
UPDATE profiles SET gems = 1 WHERE gems IS NULL;

COMMENT ON COLUMN profiles.gems IS 'Current gem balance for AI calls';
COMMENT ON COLUMN profiles.last_free_gem_date IS 'Last date the daily free gem was granted';
COMMENT ON COLUMN profiles.ads_watched_today IS 'Number of rewarded ads watched today';
COMMENT ON COLUMN profiles.ads_watched_date IS 'Date of the ads_watched_today counter';
```

### 3.2 Server-Side Functions

Create Supabase RPC functions for atomic gem operations:

```sql
-- Grant daily free gem (idempotent — safe to call multiple times)
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

  RETURN v_gems;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Deduct 1 gem (returns new balance, -1 if insufficient)
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
    RETURN -1; -- insufficient gems
  END IF;

  RETURN v_gems;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add gem from ad reward (with daily cap of 5)
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
```

### 3.3 Update Edge Function Guard

File: `supabase/functions/_shared/subscriptionGuard.ts`

The existing `checkAIUsage()` function checks subscription status and daily limits. Extend it:

```typescript
// Current flow:
// 1. Check if user is premium → unlimited
// 2. Check daily AI usage count → allow if under limit
//
// New flow:
// 1. Check if user is premium → unlimited (no gems needed)
// 2. Check gems balance → if gems > 0, deduct 1 and proceed
// 3. If no gems → return { allowed: false, reason: "no_gems", gems: 0 }
//
// The client will show the "Watch Ad or Go Pro" dialog when reason === "no_gems"
```

Modify `checkAIUsage` to:
- Call `grant_daily_free_gem(user_id)` first (ensures daily gem is granted)
- Then call `deduct_gem(user_id)` to consume 1 gem
- If deduct returns -1, block the request with `{ allowed: false, reason: "no_gems" }`
- Pro users skip all gem logic entirely

---

## 4. Client-Side Implementation

### 4.1 AdMob Service

Create `src/lib/admob.ts`:

```typescript
import { AdMob, RewardAdOptions, AdLoadInfo, RewardAdPluginEvents } from '@capacitor-community/admob';
import { isNativePlatform } from '@/hooks/useIsNative';
import { logger } from '@/lib/logger';

// Replace with your actual ad unit IDs
const REWARDED_AD_UNIT_ID = __DEV__
  ? 'ca-app-pub-3940256099942544/5224354917'  // Google test ID
  : 'ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ'; // Your production ID

let initialized = false;

export async function initializeAdMob(): Promise<void> {
  if (!isNativePlatform || initialized) return;
  try {
    await AdMob.initialize({
      // Request non-personalized ads by default (GDPR safe)
      // Switch to personalized after ATT consent
      initializeForTesting: __DEV__,
    });
    initialized = true;
    logger.info('AdMob initialized');
  } catch (err) {
    logger.error('AdMob init failed', err);
  }
}

export async function prepareRewardedAd(): Promise<void> {
  if (!isNativePlatform || !initialized) return;
  try {
    const options: RewardAdOptions = {
      adId: REWARDED_AD_UNIT_ID,
      isTesting: __DEV__,
    };
    await AdMob.prepareRewardVideoAd(options);
  } catch (err) {
    logger.error('Failed to prepare rewarded ad', err);
  }
}

export async function showRewardedAd(): Promise<boolean> {
  if (!isNativePlatform || !initialized) return false;
  return new Promise((resolve) => {
    let rewarded = false;

    // Listen for reward event
    const rewardListener = AdMob.addListener(
      RewardAdPluginEvents.Rewarded,
      () => {
        rewarded = true;
      }
    );

    // Listen for ad dismiss
    const dismissListener = AdMob.addListener(
      RewardAdPluginEvents.Dismissed,
      () => {
        rewardListener.remove();
        dismissListener.remove();
        resolve(rewarded);
        // Preload next ad
        prepareRewardedAd().catch(() => {});
      }
    );

    // Listen for failure
    const failListener = AdMob.addListener(
      RewardAdPluginEvents.FailedToLoad,
      () => {
        rewardListener.remove();
        dismissListener.remove();
        failListener.remove();
        resolve(false);
      }
    );

    AdMob.showRewardVideoAd().catch(() => {
      rewardListener.remove();
      dismissListener.remove();
      failListener.remove();
      resolve(false);
    });
  });
}
```

### 4.2 Gems Hook

Create `src/hooks/useGems.ts`:

```typescript
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { useSubscription } from '@/hooks/useSubscription';
import { showRewardedAd, prepareRewardedAd } from '@/lib/admob';
import { useToast } from '@/hooks/use-toast';

interface GemsState {
  gems: number;
  adsRemaining: number;
  loading: boolean;
}

export function useGems() {
  const { userId, profile } = useUser();
  const { isPremium } = useSubscription();
  const { toast } = useToast();
  const [state, setState] = useState<GemsState>({
    gems: profile?.gems ?? 1,
    adsRemaining: 5 - (profile?.ads_watched_today ?? 0),
    loading: false,
  });

  // Sync gems from profile
  useEffect(() => {
    if (profile) {
      setState(prev => ({
        ...prev,
        gems: profile.gems ?? 1,
        adsRemaining: 5 - (profile.ads_watched_today ?? 0),
      }));
    }
  }, [profile?.gems, profile?.ads_watched_today]);

  // Grant daily free gem on mount
  useEffect(() => {
    if (!userId || isPremium) return;
    supabase.rpc('grant_daily_free_gem', { p_user_id: userId }).catch(() => {});
  }, [userId, isPremium]);

  // Preload rewarded ad
  useEffect(() => {
    if (!isPremium && state.adsRemaining > 0) {
      prepareRewardedAd().catch(() => {});
    }
  }, [isPremium, state.adsRemaining]);

  const watchAdForGem = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    setState(prev => ({ ...prev, loading: true }));

    try {
      const adWatched = await showRewardedAd();
      if (!adWatched) {
        toast({ title: 'Ad not available', description: 'Please try again in a moment.' });
        return false;
      }

      // Server-side reward
      const { data, error } = await supabase.rpc('reward_ad_gem', { p_user_id: userId });
      if (error) throw error;

      const result = data as any;
      if (!result.success) {
        toast({ title: 'Daily limit reached', description: 'You can watch more ads tomorrow.' });
        return false;
      }

      setState(prev => ({
        ...prev,
        gems: result.gems,
        adsRemaining: result.ads_remaining,
      }));

      toast({ title: 'Gem earned!', description: `You now have ${result.gems} gems.` });
      return true;
    } catch (err) {
      toast({ title: 'Error', description: 'Could not process reward.', variant: 'destructive' });
      return false;
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [userId, toast]);

  const hasGems = isPremium || state.gems > 0;
  const canWatchAd = !isPremium && state.adsRemaining > 0;

  return {
    gems: state.gems,
    adsRemaining: state.adsRemaining,
    loading: state.loading,
    hasGems,
    canWatchAd,
    isPremium,
    watchAdForGem,
  };
}
```

### 4.3 No Gems Dialog

Create `src/components/subscription/NoGemsDialog.tsx`:

This dialog shows when the user tries to use an AI feature but has 0 gems:

```
┌─────────────────────────────┐
│        [Gem icon]           │
│     Out of AI Calls         │
│                             │
│  Watch a short video to     │
│  earn 1 gem and continue.   │
│                             │
│  [▶ Watch Ad for 1 Gem]     │  ← Primary button
│  [⭐ Go Pro - Unlimited]    │  ← Secondary, opens paywall
│                             │
│  X ads remaining today      │
└─────────────────────────────┘
```

Props:
- `open: boolean`
- `onOpenChange: (open: boolean) => void`
- `onWatchAd: () => Promise<void>`
- `onGoPro: () => void`
- `adsRemaining: number`
- `loading: boolean`

Use the existing `Dialog` component from shadcn/ui. Match the dark theme.

### 4.4 Gem Display in UI

Add a small gem counter to the navigation or header. Show it only for free users.

Options:
- **Bottom nav**: Small gem badge on the active tab or in the nav area
- **Page headers**: Show `💎 3` next to page titles on AI-enabled pages
- **AI buttons**: Show gem cost on each AI button: "Analyse Diet (💎1)"

Recommended: Add gem count to the AI buttons themselves. When a user taps an AI button:
1. If Pro → proceed immediately
2. If has gems → show "Using 1 gem (X remaining)" briefly, proceed
3. If no gems → show NoGemsDialog

### 4.5 Integration Points

Every AI feature currently calls `checkAIAccess()` from `useSubscription`. The integration point is here:

**Current flow** (in each AI hook):
```typescript
if (!checkAIAccess()) {
  openPaywall();
  return;
}
```

**New flow**:
```typescript
if (isPremium) {
  // proceed
} else if (gems > 0) {
  // gem will be deducted server-side in the edge function
  // proceed
} else {
  // show NoGemsDialog
  openNoGemsDialog();
  return;
}
```

Files to update:
- `src/hooks/nutrition/useDietAnalysis.ts` — `handleAnalyseDiet`
- `src/hooks/nutrition/useAIMealAnalysis.ts` — `handleAiAnalyzeMeal`
- `src/hooks/nutrition/useMealPlanGeneration.ts` — `handleGenerateMealPlan`
- `src/hooks/weight/useWeightAnalysis.ts` — `getAIAnalysis`
- `src/hooks/gym/useRoutines.ts` — `generateRoutine`
- `src/hooks/hydration/useRehydrationProtocol.ts` — (if applicable)
- `src/components/fightcamp/TrainingSummarySection.tsx` — `handleGenerateOrUpdate`

---

## 5. AdMob Initialization

In `src/App.tsx`, initialize AdMob after auth is resolved:

```typescript
import { initializeAdMob } from '@/lib/admob';

// Inside UserProvider or after auth resolves:
useEffect(() => {
  initializeAdMob();
}, []);
```

Place this in the `AppLayout` component or similar, so it runs once on app start.

---

## 6. Edge Function Changes

### 6.1 Update `subscriptionGuard.ts`

File: `supabase/functions/_shared/subscriptionGuard.ts`

```typescript
export async function checkAIUsage(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  gems?: number;
  isPremium?: boolean;
}> {
  // 1. Check premium status
  const isPremium = await checkPremiumStatus(userId);
  if (isPremium) {
    return { allowed: true, isPremium: true };
  }

  // 2. Grant daily free gem (idempotent)
  await supabaseAdmin.rpc('grant_daily_free_gem', { p_user_id: userId });

  // 3. Try to deduct a gem
  const { data: remainingGems } = await supabaseAdmin.rpc('deduct_gem', { p_user_id: userId });

  if (remainingGems === -1) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('gems')
      .eq('id', userId)
      .single();
    return {
      allowed: false,
      reason: 'no_gems',
      gems: profile?.gems ?? 0,
      isPremium: false,
    };
  }

  return { allowed: true, gems: remainingGems, isPremium: false };
}
```

### 6.2 Update Client Response Handling

When an edge function returns `{ allowed: false, reason: "no_gems" }`, the client should:
1. NOT show a toast about "subscriptions available"
2. Instead, open the `NoGemsDialog`
3. The dialog offers "Watch Ad" or "Go Pro"

Update the error handling in `useSubscription` or each hook:

```typescript
if (!usage.allowed) {
  if (usage.reason === 'no_gems') {
    // Open no-gems dialog instead of paywall
    openNoGemsDialog();
  } else {
    openPaywall();
  }
  return;
}
```

---

## 7. Profiles Table Update

Add gems fields to the `ProfileData` TypeScript type.

File: `src/contexts/UserContext.tsx` (or wherever `ProfileData` is defined)

```typescript
interface ProfileData {
  // ... existing fields ...
  gems: number;
  last_free_gem_date: string | null;
  ads_watched_today: number;
  ads_watched_date: string | null;
}
```

Also update the profile SELECT query to include these new columns (it currently does `select("*")` so it should pick them up automatically).

---

## 8. App Store Review Notes

### 8.1 Required Disclosures
- In App Store Connect → App Information → Advertising: Set "Uses Advertising Identifier" to YES
- In "Advertising" section, check: "Serve advertisements within the app"
- Add App Tracking Transparency purpose string (already covered in Info.plist above)

### 8.2 Review Guidelines
- Rewarded ads are explicitly allowed by Apple (user-initiated, user receives clear value)
- Do NOT show ads to Pro subscribers (Apple considers this a poor experience)
- Do NOT show interstitial/banner ads (only rewarded — keeps the app clean)
- Do NOT make the app unusable without watching ads (1 free call/day is sufficient base)

### 8.3 GDPR/Privacy
- Add AdMob to your privacy policy
- If serving in EU: show a GDPR consent dialog before personalized ads
- The `@capacitor-community/admob` plugin supports consent forms via `AdMob.requestConsentInfoUpdate()`

---

## 9. Testing Checklist

### 9.1 Development Testing
- [ ] Use Google's test ad unit IDs during development
- [ ] Verify rewarded ad loads and plays on iOS simulator/device
- [ ] Verify reward callback fires after ad completion
- [ ] Verify gem is added server-side after reward
- [ ] Verify gem is NOT added if user closes ad early
- [ ] Verify daily ad cap (5) is enforced
- [ ] Verify daily free gem grants correctly at day boundary
- [ ] Verify Pro users never see ads or gem prompts

### 9.2 Edge Cases
- [ ] No internet: ad fails to load → show "Ad not available" message
- [ ] User force-quits during ad → no gem granted (correct behavior)
- [ ] User watches ad but server call fails → show error, don't grant gem
- [ ] Midnight rollover: gems and ad counter reset correctly
- [ ] User upgrades to Pro mid-session → gems UI disappears immediately

### 9.3 Production Testing
- [ ] Switch to production ad unit IDs
- [ ] Test with real AdMob account (no test flags)
- [ ] Verify ad impressions appear in AdMob dashboard
- [ ] Verify eCPM is reasonable ($10-30 range)

---

## 10. Revenue Projections

| Metric | Conservative | Moderate | Optimistic |
|--------|-------------|----------|------------|
| Free DAU | 500 | 1,000 | 3,000 |
| Ads/user/day | 1.5 | 2.5 | 3.5 |
| eCPM | $10 | $20 | $30 |
| Daily revenue | $7.50 | $50 | $315 |
| Monthly revenue | $225 | $1,500 | $9,450 |

Rewarded video eCPMs vary by region. UK/US typically $15-30. Emerging markets $3-8.

---

## 11. File Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/XXXX_add_gems.sql` | CREATE | Add gems columns + RPC functions |
| `src/lib/admob.ts` | CREATE | AdMob initialization, preload, show rewarded ad |
| `src/hooks/useGems.ts` | CREATE | Gems state, daily grant, ad reward flow |
| `src/components/subscription/NoGemsDialog.tsx` | CREATE | "Watch Ad or Go Pro" dialog |
| `supabase/functions/_shared/subscriptionGuard.ts` | MODIFY | Add gem deduction to `checkAIUsage` |
| `src/contexts/UserContext.tsx` | MODIFY | Add gems fields to ProfileData type |
| `src/contexts/SubscriptionContext.tsx` | MODIFY | Add `openNoGemsDialog` alongside `openPaywall` |
| `src/hooks/useSubscription.ts` | MODIFY | Expose gems state, handle `no_gems` response |
| `src/hooks/nutrition/useDietAnalysis.ts` | MODIFY | Use gems check instead of direct paywall |
| `src/hooks/nutrition/useAIMealAnalysis.ts` | MODIFY | Same |
| `src/hooks/nutrition/useMealPlanGeneration.ts` | MODIFY | Same |
| `src/hooks/weight/useWeightAnalysis.ts` | MODIFY | Same |
| `src/hooks/gym/useRoutines.ts` | MODIFY | Same |
| `src/components/fightcamp/TrainingSummarySection.tsx` | MODIFY | Same |
| `ios/App/App/Info.plist` | MODIFY | Add GADApplicationIdentifier + SKAdNetwork |
| `src/App.tsx` | MODIFY | Initialize AdMob on app start |

---

## 12. Implementation Order

1. Database migration (gems columns + RPC functions)
2. Update `subscriptionGuard.ts` in edge functions
3. Deploy edge functions
4. Create `src/lib/admob.ts`
5. Create `src/hooks/useGems.ts`
6. Create `NoGemsDialog` component
7. Update `SubscriptionContext` to support no-gems flow
8. Update all AI hooks to use new gems check
9. Add AdMob initialization to App.tsx
10. Update Info.plist with AdMob App ID
11. `npx cap sync ios` + test on device
12. Submit to App Store review
