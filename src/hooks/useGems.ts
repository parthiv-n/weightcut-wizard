import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { useSubscription } from '@/hooks/useSubscription';
import { showRewardedAd, prepareRewardedAd } from '@/lib/admob';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export function useGems() {
  const { userId, profile, refreshProfile, syncDailyGem } = useUser();
  const { isPremium } = useSubscription();
  const { toast } = useToast();
  const [gems, setGems] = useState(profile?.gems ?? 0);
  const [adsRemaining, setAdsRemaining] = useState(5);
  const [loading, setLoading] = useState(false);

  // Sync gems from profile — this is the single source of truth.
  // Mirror whatever the server says, even when it's 0, so the UI never
  // lags behind server state after a deduct or grant.
  useEffect(() => {
    if (profile?.gems !== undefined && profile.gems !== null) {
      setGems(profile.gems);
    }
    if (profile?.ads_watched_today !== undefined) {
      const today = new Date().toISOString().split('T')[0];
      const adsDate = profile.ads_watched_date;
      if (adsDate === today) {
        setAdsRemaining(Math.max(0, 5 - (profile.ads_watched_today || 0)));
      } else {
        setAdsRemaining(5);
      }
    }
  }, [profile?.gems, profile?.ads_watched_today, profile?.ads_watched_date]);

  // Listen for gem consumption events — refresh profile to pull the
  // authoritative count from the server.
  useEffect(() => {
    const handler = () => {
      if (!isPremium) refreshProfile();
    };
    window.addEventListener('gem-consumed', handler);
    return () => window.removeEventListener('gem-consumed', handler);
  }, [isPremium, refreshProfile]);

  // Grant-and-refresh when the tab becomes visible. Covers users who
  // leave the app open overnight or switch away and come back after
  // the daily gem becomes available.
  useEffect(() => {
    if (isPremium || !userId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        syncDailyGem().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isPremium, userId, syncDailyGem]);

  // Midnight rollover timer: when the local date changes, ask the
  // server for the daily gem. Re-arms itself each day.
  useEffect(() => {
    if (isPremium || !userId) return;
    let timerId: number | undefined;
    const schedule = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 5, 0); // 5s past midnight to avoid clock skew
      const delay = Math.max(1000, nextMidnight.getTime() - now.getTime());
      timerId = window.setTimeout(() => {
        syncDailyGem().catch(() => {});
        schedule();
      }, delay);
    };
    schedule();
    return () => { if (timerId) window.clearTimeout(timerId); };
  }, [isPremium, userId, syncDailyGem]);

  // Preload ad
  useEffect(() => {
    if (!isPremium && adsRemaining > 0) {
      prepareRewardedAd().catch(() => {});
    }
  }, [isPremium, adsRemaining]);

  const watchAdForGem = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    setLoading(true);
    try {
      const adWatched = await showRewardedAd();
      if (!adWatched) {
        toast({ title: 'Ad not available', description: 'Please try again in a moment.' });
        return false;
      }

      const { data, error } = await (supabase.rpc as any)('reward_ad_gem', { p_user_id: userId });
      if (error) throw error;

      if (!data?.success) {
        toast({ title: 'Daily limit reached', description: 'You can watch more ads tomorrow.' });
        return false;
      }

      setGems(data.gems);
      setAdsRemaining(data.ads_remaining);
      // Update localStorage gem count so SubscriptionContext stays in sync
      localStorage.setItem('wcw_gems', String(data.gems));
      await refreshProfile();
      toast({ title: 'Gem earned!', description: `You now have ${data.gems} gems.` });
      return true;
    } catch (err) {
      logger.error('Ad reward error', err);
      toast({ title: 'Error', description: 'Could not process reward.', variant: 'destructive' });
      return false;
    } finally {
      setLoading(false);
    }
  }, [userId, toast, refreshProfile]);

  const refreshGems = useCallback(async () => {
    await refreshProfile();
  }, [refreshProfile]);

  const consumeGem = useCallback(() => {
    if (isPremium) return;
    setGems(prev => Math.max(0, prev - 1));
  }, [isPremium]);

  return {
    gems,
    adsRemaining,
    loading,
    hasGems: isPremium || gems > 0,
    canWatchAd: !isPremium && adsRemaining > 0,
    isPremium,
    watchAdForGem,
    refreshGems,
    consumeGem,
  };
}
