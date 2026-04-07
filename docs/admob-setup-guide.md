# AdMob Production Setup Guide

Everything is coded and wired. Follow these steps to go live with real ads.

## 1. Create AdMob Account

1. Go to [admob.google.com](https://admob.google.com)
2. Sign in with your Google account
3. Complete business info and payment setup
4. Accept the AdMob terms

## 2. Register Your iOS App

1. In AdMob dashboard → Apps → **Add App**
2. Select **iOS**
3. Enter your App Store URL or add manually:
   - App name: FightCamp Wizard
   - Bundle ID: `com.weightcutwizard.app`
4. Note your **App ID** (format: `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`)

## 3. Create Rewarded Ad Unit

1. In your app → Ad units → **Add Ad Unit**
2. Select **Rewarded**
3. Configure:
   - Name: `AI Gem Reward`
   - Reward amount: `1`
   - Reward item: `gem`
4. Note your **Ad Unit ID** (format: `ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ`)

## 4. Update Code with Production IDs

### File: `src/lib/admob.ts`

Replace the test ad unit ID (line 8):
```typescript
// BEFORE (test):
const REWARDED_AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';

// AFTER (production):
const REWARDED_AD_UNIT_ID = 'ca-app-pub-YOUR_APP_ID/YOUR_AD_UNIT_ID';
```

Also change `isTesting: true` to `isTesting: false` in two places:
- `initializeAdMob()` → `initializeForTesting: false`
- `prepareRewardedAd()` → `isTesting: false`

### File: `ios/App/App/Info.plist`

Replace the test App ID:
```xml
<!-- BEFORE (test): -->
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-3940256099942544~1458002511</string>

<!-- AFTER (production): -->
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-YOUR_REAL_APP_ID</string>
```

## 5. App Store Connect Settings

1. Go to App Store Connect → Your App → **App Information**
2. Under **Advertising**: Set "Uses Advertising Identifier (IDFA)" to **Yes**
3. Check: "Serve advertisements within the app"
4. Check: "Attribute an installation to a previously served advertisement"

## 6. Privacy Policy Update

Add this section to your privacy policy:

> **Advertising**
> We use Google AdMob to display rewarded video advertisements. AdMob may collect device identifiers and usage data to serve relevant ads. You can opt out of personalized advertising in your device settings. For more information, see [Google's Privacy Policy](https://policies.google.com/privacy).

## 7. App Tracking Transparency (ATT)

The ATT prompt is already configured:
- `Info.plist` has `NSUserTrackingUsageDescription`
- iOS will show the prompt automatically when AdMob requests tracking

If the user declines:
- Ads still show (non-personalized)
- eCPM will be lower (~30-50% less revenue)
- No action needed from your code

## 8. GDPR (EU Users)

If you serve EU users, you need a consent dialog before personalized ads:

```typescript
// Add to admob.ts initializeAdMob():
import { AdMob } from '@capacitor-community/admob';

// Before initialize:
const consentInfo = await AdMob.requestConsentInfoUpdate();
if (consentInfo.isConsentFormAvailable) {
  await AdMob.showConsentForm();
}
```

This is optional for initial launch but required for EU compliance.

## 9. Build & Deploy

```bash
npm run build
npx cap sync ios
# Open Xcode and build
```

## 10. Testing Checklist

Before switching to production IDs:
- [ ] Test ad loads and plays on a real device (simulator won't show real ads)
- [ ] Verify gem is granted after watching full ad
- [ ] Verify gem is NOT granted if ad is closed early
- [ ] Verify daily ad cap (5) is enforced
- [ ] Verify premium users never see gem/ad UI

After switching to production IDs:
- [ ] Verify ad impressions appear in AdMob dashboard (may take 24h)
- [ ] Verify eCPM is in expected range ($10-30)
- [ ] Test with a new device/account that hasn't seen test ads

## File Reference

| File | What to change |
|------|----------------|
| `src/lib/admob.ts` | Ad unit ID + `isTesting` flags |
| `ios/App/App/Info.plist` | `GADApplicationIdentifier` |
| Privacy policy | Add AdMob disclosure |
| App Store Connect | Enable advertising identifier |
