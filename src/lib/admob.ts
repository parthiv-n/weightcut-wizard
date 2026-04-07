import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';
import { isNativePlatform } from '@/hooks/useIsNative';
import { logger } from '@/lib/logger';

let initialized = false;

// Google test ad unit ID — replace with production ID before release
const REWARDED_AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';

export async function initializeAdMob(): Promise<void> {
  if (!isNativePlatform || initialized) return;
  try {
    await AdMob.initialize({ initializeForTesting: true });
    initialized = true;
    logger.info('AdMob initialized');
  } catch (err) {
    logger.error('AdMob init failed', err);
  }
}

export async function prepareRewardedAd(): Promise<void> {
  if (!isNativePlatform || !initialized) return;
  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_UNIT_ID, isTesting: true });
  } catch (err) {
    logger.error('Failed to prepare rewarded ad', err);
  }
}

export async function showRewardedAd(): Promise<boolean> {
  if (!isNativePlatform || !initialized) return false;

  return new Promise((resolve) => {
    let rewarded = false;
    const listeners: { remove: () => void }[] = [];

    const cleanup = () => {
      listeners.forEach(l => l.remove());
      listeners.length = 0;
    };

    listeners.push(
      AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
        rewarded = true;
      })
    );

    listeners.push(
      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        cleanup();
        resolve(rewarded);
        prepareRewardedAd().catch(() => {});
      })
    );

    listeners.push(
      AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => {
        cleanup();
        resolve(false);
      })
    );

    AdMob.showRewardVideoAd().catch(() => {
      cleanup();
      resolve(false);
    });
  });
}
