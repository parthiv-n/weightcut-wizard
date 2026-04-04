# WeightCut Wizard — Production Audit & App Store Launch Checklist

Last updated: 2026-04-05

Status: `[x]` done | `[ ]` todo | `[~]` partial

---

## 1. LEGAL (App Store Blockers)

- [ ] **Privacy Policy** — write and host at a public HTTPS URL
  - Must cover: Supabase data storage, Sentry crash reporting, xAI/Grok API (meal analysis, coaching), user account data, health/fitness data collection
  - Link in: Auth.tsx (line 430), ProfileDropdown.tsx (line 141), App Store Connect
- [ ] **Terms of Service** — write and host at a public HTTPS URL
  - Link in: Auth.tsx (line 434), ProfileDropdown.tsx (line 145), App Store Connect
- [ ] **Medical disclaimers** — add to all health-related pages:
  - [ ] Weight Tracker
  - [ ] Nutrition / Diet Analysis
  - [ ] Fight Week planning
  - [x] Hydration / Rehydration (already has one)
  - [ ] Recovery dashboard
  - [ ] Daily Wisdom (AI health advice)
- [ ] **Apple Privacy Nutrition Labels** — complete in App Store Connect:
  - Health & Fitness data (weight, nutrition, hydration)
  - Contact info (email for auth)
  - Usage data (Sentry crash reports)
  - User content (meal descriptions, training notes)

---

## 2. iOS BUILD & CONFIG

- [x] Bundle ID: `com.weightcutwizard.app`
- [x] App name: `Weightcut Wizard`
- [x] URL scheme: `weightcutwizard://`
- [x] Sign in with Apple entitlement enabled
- [x] App icon (1024x1024) in Assets.xcassets
- [x] Splash screen configured (LaunchScreen.storyboard)
- [x] Info.plist permission descriptions (camera, photos, microphone, photo library save)
- [ ] **Set minimum iOS deployment target to 16.0** in Xcode project settings
- [ ] **Increment CFBundleVersion** (currently `2`) — must be higher for each submission
- [ ] **Verify Release build** — ensure `debug.xcconfig` is NOT included in Release configuration
- [ ] **Privacy manifest** — create `ios/App/App/PrivacyInfo.xcprivacy` declaring all APIs used
- [ ] **Remove `meal-planner-test`** edge function from production

---

## 3. AUTH & SECURITY

- [x] Apple Sign-In — native iOS flow + web OAuth fallback
- [x] Email/password auth with verification
- [x] Password reset flow
- [x] Account deletion (edge function + UI + cascade deletes)
- [x] Supabase RLS on all tables
- [x] Auth tokens stored in localStorage with auto-refresh
- [x] Redirect URI fixed to correct Supabase project
- [ ] **Apple Sign-In** — enable provider in Supabase dashboard + set Authorized Client IDs to `com.weightcutwizard.app`
- [x] `.env` in `.gitignore`

---

## 4. APP STORE CONNECT SETUP

- [ ] **App description** — compelling copy highlighting key features
- [ ] **Keywords** — research and set (max 100 chars, comma-separated)
- [ ] **Subtitle** — max 30 characters
- [ ] **Category** — Health & Fitness (primary), Sports (secondary)
- [ ] **Age rating** — complete the questionnaire (medical/health content = 17+?)
- [ ] **Screenshots** — 6.7" (iPhone 15 Pro Max), 6.1" (iPhone 15), 5.5" (iPhone 8 Plus)
  - Dashboard, Nutrition, Weight Tracker, Training Calendar, Fight Week, AI Coach
- [ ] **App preview video** (optional but recommended)
- [ ] **Support URL** — link to support email or page
- [ ] **Marketing URL** (optional)
- [ ] **What's New** text for version 1.0

---

## 5. MONETIZATION

Current state: all features are free, `is_premium` flag exists in code but no enforcement.

### To launch as FREE app (fastest path to App Store):
- [x] No in-app purchases needed
- [x] No paywall needed
- [ ] Set price to Free in App Store Connect
- [ ] Consider adding "Tip Jar" later via StoreKit2

### To launch with PREMIUM tier (requires more work):
- [ ] Add `is_premium` column to profiles table (migration)
- [ ] Create `rate_limits` table for AI usage tracking
- [ ] Integrate RevenueCat or StoreKit2 for subscriptions
- [ ] Build paywall UI
- [ ] Gate premium features (unlimited AI, advanced protocols)
- [ ] Add restore purchases flow
- [ ] Test sandbox purchases

---

## 6. FEATURES WORKING

- [x] Dashboard — weight progress, consistency ring, daily wisdom, weight history chart, training widget, achievements
- [x] Nutrition — meal logging (AI, barcode, search, manual), diet analysis, meal plan generation
- [x] Weight Tracker — daily weigh-ins, chart, AI analysis
- [x] Training Calendar — session logging, monthly view, training summaries
- [x] Fight Camps — camp management, photo upload
- [x] Fight Week — day-by-day protocol with AI advice
- [x] Hydration — rehydration calculator with AI protocol
- [x] Recovery — training load analytics, AI coach
- [x] Gym Tracker — exercise logging, sets, PRs
- [x] Skill Tree — technique progression
- [x] AI Chat — floating wizard chatbot
- [x] Settings — theme toggle, profile edit, weight reminders, account deletion
- [x] Tutorial — onboarding flow across all pages
- [x] Share cards — training, nutrition, fight week

---

## 7. EDGE FUNCTIONS (17 production + 1 test)

| Function | Status | Rate Limit Handling |
|----------|--------|-------------------|
| analyze-meal | Production | 429 handled |
| analyse-diet | Production | 429 handled |
| meal-planner | Production | Missing 429 handling |
| scan-barcode | Production | Cached 30 days |
| lookup-ingredient | Production | No limit |
| food-search | Production | 1hr cache |
| daily-wisdom | Production | Cached 25hrs |
| weight-tracker-analysis | Production | 429 handled |
| fight-week-analysis | Production | 429 handled |
| fight-camp-coach | Production | No limit |
| rehydration-protocol | Production | 429 handled |
| training-summary | Production | No limit |
| wizard-chat | Production | 429 handled |
| generate-technique-chains | Production | No limit |
| delete-account | Production | N/A |
| transcribe-audio | Production | No limit |
| hydration-insights | Production | No limit |
| meal-planner-test | **TEST — remove** | N/A |

---

## 8. TESTING BEFORE SUBMISSION

- [ ] Test on physical iPhone (not just simulator)
- [ ] Cold start — app loads within 2-3 seconds
- [ ] Apple Sign-In — full flow (sign up, sign in, token refresh)
- [ ] Email sign up — verification email received and works
- [ ] Account deletion — data actually removed from Supabase
- [ ] Deep links — `weightcutwizard://dashboard` opens correctly
- [ ] Camera permissions — prompt appears, photo capture works
- [ ] Notification permissions — weight reminder schedules correctly
- [ ] Offline behavior — app doesn't crash, shows appropriate messages
- [ ] All AI features — generation + cancel buttons work
- [ ] All pages load without crashes
- [ ] Landscape orientation — doesn't break layout (or lock to portrait)
- [ ] Dark mode — all screens render correctly
- [ ] VoiceOver accessibility — basic screen reader support
- [ ] Memory — no leaks on extended use (check Xcode Instruments)

---

## 9. POST-LAUNCH PRIORITIES

1. Monitor Sentry for crash reports (first 48 hours critical)
2. Monitor Supabase usage / API costs
3. Respond to App Store reviews promptly
4. Push notifications for engagement (infrastructure ready)
5. Implement premium tier when ready to monetize
6. Add rate limiting to unprotected edge functions
7. HealthKit integration (Phase 3)
8. iPad optimization

---

## LAUNCH ORDER

```
1. Legal docs (privacy policy, ToS)           ← BLOCKING
2. Medical disclaimers on all health pages     ← BLOCKING  
3. Apple Sign-In provider enabled              ← BLOCKING
4. Privacy manifest created                    ← BLOCKING
5. App Store Connect metadata + screenshots    ← BLOCKING
6. Build config verified (Release mode)        ← BLOCKING
7. Physical device testing                     ← BLOCKING
8. Submit for review
9. Respond to any review feedback
10. Go live
```
