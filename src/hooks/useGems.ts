import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { useSubscription } from '@/hooks/useSubscription';
import { showRewardedAd, prepareRewardedAd } from '@/lib/admob';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export function useGems() {
  const { userId, profile, refreshProfile } = useUser();
  const { isPremium } = useSubscription();
  const { toast } = useToast();
  const [gems, setGems] = useState(0);
  const [adsRemaining, setAdsRemaining] = useState(5);
  const [loading, setLoading] = useState(false);

  // Sync gems from profile — this is the single source of truth
  useEffect(() => {
    if (profile?.gems !== undefined) setGems(profile.gems);
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

  // Listen for gem consumption events — decrement locally for instant UI,
  // then refresh profile to sync with server
  useEffect(() => {
    const handler = () => {
      if (!isPremium) {
        setGems(prev => Math.max(0, prev - 1));
        // Refresh profile after a short delay to get actual server state
        setTimeout(() => refreshProfile(), 1500);
      }
    };
    window.addEventListener('gem-consumed', handler);
    return () => window.removeEventListener('gem-consumed', handler);
  }, [isPremium, refreshProfile]);

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
