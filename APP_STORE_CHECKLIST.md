# iOS App Store Readiness Checklist

Status legend: `[x]` done | `[ ]` todo | `[~]` partial

---

## Current App State (already done)

- [x] Bundle ID set: `com.weightcutwizard.app` (version 1.0.0)
- [x] App icons in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- [x] Splash screen & launch screen configured
- [x] Info.plist permission usage descriptions (camera, photos, microphone)
- [x] Account deletion implemented (`delete-account` edge function + UI in SettingsPanel)
- [x] HTTPS everywhere — no insecure transport exceptions
- [x] Email/password auth only (no social login → Apple Sign-In not strictly required)
- [x] No in-app purchases (free app; `is_premium` field exists but no StoreKit integration)

---

## Blockers

### Legal / Privacy (Critical)

- [ ] **Privacy Policy** — Host at a public URL. Link it in:
  - [ ] App Store Connect → App Information → Privacy Policy URL
  - [ ] In-app Settings page
  - Must cover: data collected (health/fitness metrics, email, weight, meals), Supabase storage, Sentry error reporting, AI meal analysis via Grok, data retention, user rights
- [ ] **Terms of Service** — Required for account-based apps. Host publicly and link in App Store Connect + in-app Settings
- [ ] **App Privacy Details** — Complete the data collection disclosure in App Store Connect. Categories to declare:
  - Health & Fitness (weight, body metrics, nutrition)
  - Contact Info (email address)
  - Usage Data (Sentry crash reports)
  - User Content (meal photos, training logs)

### Health & Safety

- [~] **Medical disclaimers** — Currently only Hydration page has one. Add disclaimers to:
  - [ ] Weight Tracker
  - [ ] Nutrition / Diet Analysis
  - [ ] Fight Week planning
  - [ ] Recovery / Rehydration Protocol
  - [ ] Daily Wisdom (AI health advice)
  - Suggested text: *"This app is for informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment."*
- [ ] **App Store description** — Must state the app does not provide medical advice

### Build Configuration

- [ ] **Disable debug mode for Release** — `ios/debug.xcconfig` has `CAPACITOR_DEBUG = true`. Ensure the Release build configuration does not include this flag
- [ ] **Minimum iOS deployment target** — Set to iOS 16.0+ (recommended for Capacitor 8 compatibility)
- [ ] **Increment `CFBundleVersion`** — Must be incremented for every submission to App Store Connect (even rejected resubmissions)

### App Store Connect Setup

- [ ] **Screenshots** — Required sizes:
  - [ ] 6.7" iPhone (iPhone 15 Pro Max / 16 Pro Max) — 1290 × 2796 px
  - [ ] 6.5" iPhone (iPhone 14 Plus / 15 Plus) — 1284 × 2778 px
  - [ ] 12.9" iPad Pro (if supporting iPad) — 2048 × 2732 px
- [ ] **App description** — Clear explanation of features (weight tracking, nutrition, fight camp planning, AI analysis)
- [ ] **Keywords** — e.g. weight cut, MMA, boxing, wrestling, nutrition, fight week, weigh-in
- [ ] **Subtitle** — Short tagline (max 30 chars), e.g. "Smart Weight Cutting for Fighters"
- [ ] **Support URL** — Public webpage or email for user support
- [ ] **App category** — Health & Fitness
- [ ] **Age rating** — Likely 4+ (no objectionable content, no user-generated public content)
- [ ] **Marketing URL** — Optional but recommended

---

## Recommended Enhancements (not blocking but worth considering)

- [ ] **Apple Sign-In** — Not required (no third-party social logins), but improves signup conversion on iOS
- [ ] **App Tracking Transparency (ATT)** — Not needed if no third-party tracking. Sentry is first-party error reporting and does not require ATT
- [ ] **Privacy manifest (`PrivacyInfo.xcprivacy`)** — Apple now requires this for apps using certain system APIs (UserDefaults, file timestamp, etc.). Check if any Capacitor plugins trigger this requirement

---

## Testing Before Submission

- [ ] Test full app flow on a **physical device** (not just Simulator)
- [ ] Verify **account deletion** end-to-end (Settings → Delete Account → confirm data is removed from Supabase)
- [ ] Test **deep links** (`weightcutwizard://`) open correctly and don't crash
- [ ] Test **offline behavior** — app should degrade gracefully, not crash or show blank screens
- [ ] Verify **no crashes on cold start** (kill app, reopen, check auth flow resolves cleanly)
- [ ] Run through **every tab and feature** to check for obvious bugs or placeholder content
- [ ] Confirm **camera and photo permissions** prompt correctly on first use (meal scanning)
- [ ] Test on oldest supported iOS version (whatever deployment target is set to)
