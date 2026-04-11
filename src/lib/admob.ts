import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';
import { isNativePlatform } from '@/hooks/useIsNative';
import { logger } from '@/lib/logger';

let initialized = false;

// Production ID — will work once AdMob account is approved
const PROD_AD_UNIT_ID = 'ca-app-pub-5228937380128191/9961045291';
// Google test ID — use until account is approved
const TEST_AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';

const USE_TEST_ADS = false;
const REWARDED_AD_UNIT_ID = USE_TEST_ADS ? TEST_AD_UNIT_ID : PROD_AD_UNIT_ID;

export async function initializeAdMob(): Promise<void> {
  if (!isNativePlatform || initialized) return;
  try {
    // Request ATT consent before initializing ads
    const consentInfo = await AdMob.requestConsentInfo();
    if (consentInfo.isConsentFormAvailable) {
      await AdMob.showConsentForm();
    }
    await AdMob.initialize({ initializeForTesting: USE_TEST_ADS });
    initialized = true;
    logger.info('AdMob initialized');
  } catch (err) {
    // ATT denied or not available — still initialize AdMob (will show non-personalized ads)
    try {
      await AdMob.initialize({ initializeForTesting: USE_TEST_ADS });
      initialized = true;
    } catch (initErr) {
      logger.error('AdMob init failed', initErr);
    }
  }
}

export async function prepareRewardedAd(): Promise<void> {
  if (!isNativePlatform || !initialized) return;
  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARDED_AD_UNIT_ID, isTesting: USE_TEST_ADS });
  } catch (err) {
    logger.error('Failed to prepare rewarded ad', err);
  }
}

export async function showRewardedAd(): Promise<boolean> {
  if (!isNativePlatform || !initialized) return false;

  const adPromise = new Promise<boolean>((resolve) => {
    let rewarded = false;
    let settled = false;
    const listeners: { remove: () => void }[] = [];

    const cleanup = () => {
      listeners.forEach(l => l.remove());
      listeners.length = 0;
    };

    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    listeners.push(
      AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
        rewarded = true;
      })
    );

    listeners.push(
      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        settle(rewarded);
        prepareRewardedAd().catch(() => {});
      })
    );

    listeners.push(
      AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => {
        settle(false);
      })
    );

    AdMob.showRewardVideoAd().catch(() => {
      settle(false);
    });
  });

  // Timeout: if ad hangs for 30s, resolve false to unblock UI
  return Promise.race([
    adPromise,
    new Promise<boolean>(r => setTimeout(() => r(false), 30000)),
  ]);
}
