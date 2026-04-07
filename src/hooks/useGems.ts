import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { useSubscription } from '@/hooks/useSubscription';
import { showRewardedAd, prepareRewardedAd } from '@/lib/admob';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

export function useGems() {
  const { userId, profile } = useUser();
  const { isPremium } = useSubscription();
  const { toast } = useToast();
  const [gems, setGems] = useState(profile?.gems ?? 1);
  const [adsRemaining, setAdsRemaining] = useState(5);
  const [loading, setLoading] = useState(false);

  // Sync from profile
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

  // Grant daily free gem on mount
  useEffect(() => {
    if (!userId || isPremium) return;
    (supabase.rpc as any)('grant_daily_free_gem', { p_user_id: userId })
      .then(({ data }: any) => { if (data !== null && data !== undefined) setGems(data); })
      .catch(() => {});
  }, [userId, isPremium]);

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
      toast({ title: 'Gem earned!', description: `You now have ${data.gems} gems.` });
      return true;
    } catch (err) {
      logger.error('Ad reward error', err);
      toast({ title: 'Error', description: 'Could not process reward.', variant: 'destructive' });
      return false;
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  const refreshGems = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await (supabase.rpc as any)('grant_daily_free_gem', { p_user_id: userId });
      if (data !== null && data !== undefined) setGems(data);
    } catch {}
  }, [userId]);

  return {
    gems,
    adsRemaining,
    loading,
    hasGems: isPremium || gems > 0,
    canWatchAd: !isPremium && adsRemaining > 0,
    isPremium,
    watchAdForGem,
    refreshGems,
  };
}
