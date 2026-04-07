import { isNativePlatform } from '@/hooks/useIsNative';
import { logger } from '@/lib/logger';

let initialized = false;
let AdMobRef: any = null;

async function getAdMob(): Promise<any> {
  if (AdMobRef) return AdMobRef;
  if (!isNativePlatform) return null;
  try {
    // Access via Capacitor plugin registry to avoid bundler resolution
    const { Capacitor } = await import('@capacitor/core');
    const plugins = (Capacitor as any).Plugins;
    if (plugins?.AdMob) {
      AdMobRef = plugins.AdMob;
      return AdMobRef;
    }
    // Plugin not registered
    return null;
  } catch {
    logger.warn('AdMob plugin not available');
    return null;
  }
}

// Google test ad unit ID — replace with production ID before release
const REWARDED_AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';

export async function initializeAdMob(): Promise<void> {
  if (!isNativePlatform || initialized) return;
  const adMob = await getAdMob();
  if (!adMob) return;
  try {
    await adMob.initialize({ initializeForTesting: true });
    initialized = true;
  } catch (err) {
    logger.error('AdMob init failed', err);
  }
}

export async function prepareRewardedAd(): Promise<void> {
  if (!initialized) return;
  const adMob = await getAdMob();
  if (!adMob) return;
  try {
    await adMob.prepareRewardVideoAd({ adId: REWARDED_AD_UNIT_ID, isTesting: true });
  } catch (err) {
    logger.error('Failed to prepare rewarded ad', err);
  }
}

export async function showRewardedAd(): Promise<boolean> {
  if (!initialized) return false;
  const adMob = await getAdMob();
  if (!adMob) return false;

  return new Promise((resolve) => {
    let rewarded = false;
    const listeners: any[] = [];

    const cleanup = () => listeners.forEach(l => l?.remove?.());

    if (adMob.addListener) {
      listeners.push(
        adMob.addListener('onRewardedVideoAdReward', () => { rewarded = true; })
      );
      listeners.push(
        adMob.addListener('onRewardedVideoAdDismissed', () => { cleanup(); resolve(rewarded); prepareRewardedAd().catch(() => {}); })
      );
      listeners.push(
        adMob.addListener('onRewardedVideoAdFailedToLoad', () => { cleanup(); resolve(false); })
      );
    }

    adMob.showRewardVideoAd().catch(() => { cleanup(); resolve(false); });
  });
}
