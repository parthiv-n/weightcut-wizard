# FightCamp Wizard — Business Strategy & Launch Plan

> **App:** FightCamp Wizard — AI-powered fight camp management for combat sport athletes
> **Current State:** 17 pages, 19 Supabase edge functions, iOS Capacitor app, zero monetization
> **Last Updated:** April 2026

---

## 1. Executive Summary

FightCamp Wizard is a deeply specialized AI platform for combat sport athletes — covering nutrition, weight cutting, training load, recovery, fight week protocols, and rehydration. The combat sports market has **no dominant all-in-one digital solution**. Every fighter cuts weight, tracks training, and manages nutrition — most do it with spreadsheets, generic apps, or gym folklore.

**What we have that nobody else does:**

| Capability | What It Does |
|---|---|
| AI meal analysis (text, voice, barcode, search) | 4 input modalities for logging food — no combat sports app offers this |
| Science-based fight week engine | Deterministic water/sodium/carb manipulation with AI interpretation |
| WHOOP-style training load tracking | Acute:chronic load ratio, readiness scores, strain — without hardware |
| Post-weigh-in rehydration protocols | Hourly fluid/electrolyte/carb schedule personalized to the athlete |
| Persistent AI coach (FightCamp Wizard chat) | Knows the athlete's full history — weight, meals, hydration, training, fight week |
| Fight camp history and comparison | Track performance across camps, learn what worked |
| 7 shareable card types | Branded social cards for weigh-ins, training, nutrition, camps |
| Voice dictation for session notes | Speak training notes instead of typing post-session |
| Gamification badges | Achievement system to drive daily engagement |

**Recommended model:** Freemium at **$9.99/month** with a generous free tier to drive adoption.

---

## 2. Current Feature Inventory (April 2026)

### Pages (17)

| Page | Description | Status |
|---|---|---|
| Dashboard | Weight progress, consistency ring, daily wisdom, badges, training widget | Complete |
| Weight Tracker | Daily weigh-ins, chart filtering, AI weight analysis | Complete |
| Nutrition | Meal logging (barcode, search, AI, manual), diet analysis, meal planner | Complete |
| Hydration | Rehydration protocol generator with hourly scheduling | Complete |
| Training Calendar | Session logging with voice dictation, weekly AI summaries | Complete |
| Recovery | Readiness scores, strain charts, wellness check-ins, acute:chronic load | Complete |
| Fight Camps | Camp organization, weight tracking, photo uploads, comparison | Complete |
| Fight Camp Detail | Individual camp deep-dive | Complete |
| Fight Week | Day-by-day weight cut protocol with water loading and sodium manipulation | Complete |
| Gym Tracker | Strength training with exercise library, sets/reps, PRs | Complete |
| Skill Tree | BJJ/MMA technique progression tree | Complete |
| Goals | Goal setting and achievement tracking | Complete |
| Settings | Profile, theme, Fighter Mode, reminders, legal, delete account | Complete |
| Onboarding | 11-step guided tour with conditional steps | Complete |
| Auth | Login/signup with Apple Sign-In | Complete |
| Legal | Privacy policy and Terms of Service | Complete |
| Landing | Pre-auth landing page | Complete |

### Edge Functions (19)

`analyze-meal`, `scan-barcode`, `food-search`, `lookup-ingredient`, `transcribe-audio`, `meal-planner`, `meal-planner-test`, `analyse-diet`, `weight-tracker-analysis`, `fight-week-analysis`, `fight-camp-coach`, `hydration-insights`, `daily-wisdom`, `training-summary`, `rehydration-protocol`, `wizard-chat`, `generate-technique-chains`, `delete-account`, plus `_shared` utilities.

### Infrastructure

| Component | Status |
|---|---|
| Sentry error tracking | Implemented |
| Push notifications (weight reminder) | Implemented (iOS native) |
| 7 shareable card types | Implemented |
| Gamification badges | Implemented |
| 11-step onboarding | Implemented |
| Settings panel with Fighter Mode | Implemented |
| Local caching (localStorage + in-memory) | Implemented |
| Offline sync queue | Implemented |
| Rate limiting | **Not implemented** |
| Subscription billing | **Stub only** (`is_premium` field exists) |
| Analytics/event tracking | **Not implemented** (Sentry only) |

---

## 3. Pricing & Subscription Tiers

### 3.1 Tier Structure

| Feature | Free | Premium ($9.99/mo) | Coach ($29.99/mo) |
|---|---|---|---|
| Weight logging and history | Unlimited | Unlimited | Unlimited |
| Manual meal logging | Unlimited | Unlimited | Unlimited |
| Hydration tracking | Unlimited | Unlimited | Unlimited |
| Training session logging | Unlimited | Unlimited | Unlimited |
| Basic fight camp logging | Unlimited | Unlimited | Unlimited |
| Daily Wisdom card | Yes | Yes | Yes |
| AI meal analysis (text/voice) | 3/day | Unlimited | Unlimited |
| Barcode scanning | 5/day | Unlimited | Unlimited |
| USDA food search | 10/day | Unlimited | Unlimited |
| AI weight analysis | 1/day | Unlimited | Unlimited |
| AI diet analysis | -- | Unlimited | Unlimited |
| AI meal planner | -- | Unlimited | Unlimited |
| Fight week protocols | Preview only | Full access | Full access |
| Rehydration protocols | -- | Full access | Full access |
| AI coach chat | 5 msgs/day | Unlimited | Unlimited |
| Training load analytics | -- | Full access | Full access |
| Fight camp comparison | -- | Full access | Full access |
| Voice dictation (session notes) | Yes | Yes | Yes |
| Shareable cards | With watermark | No watermark | No watermark |
| Streak freeze | -- | 1/week | 1/week |
| Multi-athlete dashboard | -- | -- | Up to 30 athletes |
| Team management | -- | -- | Full access |

### 3.2 Pricing Plans

| Plan | Price | Target |
|---|---|---|
| **Monthly** | $9.99/mo | Standard subscription. Below CUTCHECK ($14.99) and MacroFactor ($11.99). |
| **Annual** | $59.99/yr ($5.00/mo) | 50% discount. For year-round competitors. |
| **Fight Camp Pass** | $24.99 one-time (90 days) | For casual competitors (1-2 fights/year). Lower barrier to entry. |
| **Coach** | $29.99/mo | Multi-athlete management. Gym owners and coaches. |

**Launch offer:** "Founding Member" — **$4.99/mo locked for life** for the first 100 subscribers. Creates urgency, generates testimonials.

### 3.3 Revenue Projections

**Assumptions:** 3-5% free-to-premium conversion, 8% monthly churn, $7.50 blended ARPU.

| Metric | Conservative | Moderate | Aggressive |
|---|---|---|---|
| Free users (Month 12) | 2,000 | 5,000 | 15,000 |
| Premium subscribers (Month 12) | 60 | 200 | 750 |
| Monthly revenue (Month 12) | $450 | $1,500 | $5,625 |
| Year 1 cumulative revenue | $2,500 | $10,000 | $40,000 |
| Year 2 annual revenue | $12,000 | $50,000 | $175,000 |

### 3.4 Cost Structure

| Cost | Monthly | Notes |
|---|---|---|
| Supabase Pro | $25 | Auth, DB, storage, edge functions |
| xAI / Grok API | $50-300 | Scales with premium users. Rate limiting free tier is critical. |
| Apple Developer Program | $8.25 ($99/yr) | Required for App Store |
| Domain and hosting | $10-15 | Vercel or Netlify |
| **Total fixed** | **~$95/mo** | Before significant scale |
| **Total at 200 subs** | **~$250/mo** | Revenue ~$1,500/mo. Margin ~83%. |

**Break-even: ~13 paying subscribers.**

---

## 4. Competitive Landscape (April 2026)

| Competitor | Price | Strengths | Our Advantage |
|---|---|---|---|
| **CUTCHECK** | $14.99/mo | Purpose-built for weight cuts | We're a full platform (nutrition + training + recovery + AI) at a lower price |
| **MacroFactor** | $11.99/mo | Excellent macro tracking, adaptive TDEE | Zero combat sports awareness — no fight week, water loading, or rehydration |
| **RP Diet** | $15.99/mo | Science reputation in strength sports | Template-based. We adapt in real-time to the athlete's data |
| **MyFitnessPal** | $19.99/mo | Massive food database | Generic fitness — no fight week, no training load, no combat sports |
| **WHOOP** | $30/mo + hardware | Best-in-class recovery tracking | We provide similar metrics via manual input at 1/3 the cost, no hardware |

**No single competitor** combines nutrition + fight week + training load + recovery + AI coaching. We own the intersection.

---

## 5. Marketing Strategy

### 5.1 Target Personas

| Persona | Description | Premium Trigger |
|---|---|---|
| **First-time competitor** | 18-25, first fight in 6-8 weeks, scared of weight cut | Fight week protocol + AI guidance |
| **Serious amateur** | 22-30, 3-4 fights/year, trains 5-6x/week | All-in-one platform that speaks their sport |
| **Weekend warrior** | 28-40, competes 1-2x/year, prioritizes health | Safety-focused AI + Fight Camp Pass pricing |
| **Coach** | Runs a gym/team, manages multiple cuts | Multi-athlete dashboard |
| **Professional** | 25-35, fights on major cards, needs precision | Rehydration protocols, camp comparison |

### 5.2 Growth Channels

**Tier 1 — Organic (launch priority)**

| Channel | Strategy |
|---|---|
| **TikTok / Instagram Reels** | 30-60s clips: "I used AI to plan my weight cut," fight week day-by-day timelapses, before/after weigh-in content, shareable card demos. Post 3-5x/week. |
| **YouTube** | Tutorial series: "How to cut weight for BJJ/MMA/boxing." Show the app in action. Long-tail keywords with low competition. |
| **Reddit** | Active in r/bjj (420K), r/MMA (2.2M), r/amateur_boxing (95K), r/wrestling (110K). Answer weight cut questions, share app naturally. |
| **Combat sports podcasts** | Guest spots discussing the science of weight cutting. Free premium codes for listeners. |

**Tier 2 — Partnerships**

| Channel | Strategy |
|---|---|
| **Gym partnerships** | Partner with 10-20 BJJ/MMA gyms. 30-day free premium for members. Coaches get free premium. |
| **Competition sponsorships** | Sponsor local BJJ/MMA events. QR code on banners. Fight Camp Pass discount for competitors. |
| **Fighter ambassadors** | 5-10 competitive fighters. Free premium + content in exchange for posts and referrals. |

**Tier 3 — Paid (Phase 3+)**

| Channel | Expected CAC |
|---|---|
| Google Ads ("weight cut app", "BJJ diet") | $8-15/user |
| Meta Ads (interest: BJJ, MMA, boxing) | $10-20/user |

### 5.3 Brand Positioning

**Name:** FightCamp Wizard
**Tagline:** "Your corner, in your pocket."
**Voice:** Authoritative but approachable — the experienced corner coach who's also read every sports science paper.
**Visual:** Dark premium UI (Apple Fitness aesthetic) signals quality. Differentiates from bright, generic fitness apps.

---

## 6. App Store Launch Checklist

### Must-Have Before Publishing

| Item | Status | Priority |
|---|---|---|
| Rate limiting on all 19 edge functions | Not done | P0 |
| RevenueCat + Apple StoreKit 2 integration | Not done | P0 |
| `useSubscription()` hook + paywall modals | Stub only | P0 |
| App Store screenshots (6.7" and 6.1" iPhone) | Not done | P0 |
| App Store description and keywords | Not done | P0 |
| App Store review guidelines compliance check | Not done | P0 |
| Privacy nutrition label (App Store Connect) | Not done | P0 |
| Subscription metadata in App Store Connect | Not done | P0 |
| Update support email from weightcutwizard@gmail.com | Not done | P1 |
| Event analytics (PostHog or Mixpanel) | Not done | P1 |
| Additional push notifications (meal, hydration, fight week) | Partial (weight only) | P1 |
| Streak counter (weight logging streak) | Partial (badges only) | P2 |

### Already Complete

| Item | Status |
|---|---|
| Sentry error tracking | Done |
| Settings page with delete account | Done |
| Onboarding flow (11 steps) | Done |
| 7 shareable card types | Done |
| Gamification badges | Done |
| Legal (Privacy Policy + Terms of Service) | Done |
| Voice dictation for session notes | Done |
| Apple Sign-In | Done |
| Offline sync queue | Done |

---

## 7. Implementation Roadmap

### Phase 1: Launch Prep (Weeks 1-4)

| Task | Effort | Details |
|---|---|---|
| Enforce rate limiting | 3 days | Add checks to all 19 edge functions. Return 429 with upgrade CTA for exceeded free users. |
| Integrate RevenueCat + StoreKit 2 | 5 days | iOS subscription lifecycle. Webhook writes `subscription_tier` to `profiles`. |
| Build `useSubscription()` hook | 1 day | `isPremium`, `remainingAICalls`, `tier` from `profiles`. |
| Gate premium features with paywall modals | 4 days | Fight week, rehydration, AI coach (>5 msgs), training analytics, diet analysis, meal planner. |
| App Store assets (screenshots, description) | 2 days | 6.7" + 6.1" screenshots, keyword-optimized description. |
| Submit to App Store | 1 day | Review takes 1-3 days typically. |

### Phase 2: Launch & Early Growth (Weeks 5-10)

| Task | Effort | Details |
|---|---|---|
| "Founding Member" campaign | 1 day | Landing page, social posts, $4.99/mo locked for first 100. |
| Content marketing kickoff | Ongoing | TikTok/Reels 3-5x/week, YouTube 1x/week, Reddit daily. |
| Add event analytics (PostHog) | 2 days | Track onboarding completion, AI usage, feature retention, conversion funnel. |
| Additional push notifications | 3 days | Meal logging nudge, hydration checkpoint, fight week countdown, streak protection. |
| Weight logging streak counter | 2 days | Display on Dashboard, streak freeze for premium. |
| Gym partnership pilot | Ongoing | 5 gyms, 30-day free premium, feedback collection. |

### Phase 3: Growth (Months 3-6)

| Task | Effort | Details |
|---|---|---|
| HealthKit / Apple Health sync | 5 days | Auto-import weight, export hydration. Major retention driver. |
| Fighter ambassador program | Ongoing | 5-10 fighters, free premium + content creation. |
| Referral program | 3 days | "Give 1 month, get 1 month" tracked via referral codes. |
| Affiliate integrations | 3 days | Electrolyte supplements (LMNT), protein, gear. Contextual recommendations in-app. |
| Web Stripe checkout | 3 days | Avoid Apple's 30% cut for web sign-ups. |
| Android release | 5 days | Capacitor already supports Android. Play Store submission. |

### Phase 4: Scale (Months 7-12)

| Task | Effort | Details |
|---|---|---|
| Coach dashboard | 15 days | Multi-athlete view. New `teams` + `team_members` tables. |
| Team/gym subscription | 5 days | Bulk pricing at $7.99/athlete/mo. |
| Internationalization | 5 days | Spanish, Portuguese (huge BJJ markets). |
| Paid acquisition | Ongoing | Google Ads, Meta Ads on weight cut keywords. |

---

## 8. Key Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **AI provider lock-in (xAI/Grok)** | High | Abstract LLM calls into shared utility. Test fallback to OpenAI/Anthropic monthly. |
| **Subscription fatigue / high churn** | High | Annual pricing (50% discount), Fight Camp Pass for casuals, streaks for retention, push notifications for habit loops. |
| **Free tier too generous** | Medium | Key gates: AI usage (3/day feels limiting fast) and fight week protocols (highest-value, most urgent feature). Monitor and adjust. |
| **App Store rejection** | Medium | Follow Apple subscription guidelines exactly. No external payment links from iOS app. Frame as "fitness tracking" not "health advice." |
| **Health advice liability** | Medium | Disclaimers on every AI recommendation. Safety guardrails in fight week engine (flags >5% dehydration). Consider professional liability insurance ($500-1500/yr). |
| **CUTCHECK expands features** | Medium | Move fast. Our 19 AI functions + full platform gives significant head start. Focus on features they can't easily replicate. |
| **Rate limit gaming (multiple accounts)** | Low | Rate limit by device fingerprint + user ID. Flag suspicious patterns. |

---

## 9. Payment Infrastructure

| Component | Tool |
|---|---|
| iOS subscriptions | RevenueCat + Apple StoreKit 2 |
| Web subscriptions | Stripe Checkout + RevenueCat |
| Subscription state | RevenueCat webhook writes to `profiles.subscription_tier` |
| Feature gating | `useSubscription()` React hook |

**Apple's cut strategy:** App Store price $12.99/mo (nets ~$9.09 after 30%). Web price $9.99/mo. Encourage web sign-ups to maximize margin.

---

## 10. Affiliate & Partnership Revenue

| Partner Category | Commission | Integration Point | Est. Revenue (200 subs) |
|---|---|---|---|
| Electrolyte supplements (LMNT, Liquid IV) | 15-20% | Hydration page recommendations | $100-300/mo |
| Digital scales (Withings, Renpho) | 8-12% | Weight Tracker "sync with smart scale" | $50-150/mo |
| Protein / meal prep services | 10-15% | Nutrition page meal plan suggestions | $75-200/mo |
| BJJ/MMA gear (Hayabusa, Sanabul) | 8-10% | Fight Camps contextual recommendations | $50-100/mo |
| **Total affiliate potential** | | | **$275-750/mo** |

---

## Appendix: Key File Reference

| Area | Key Files |
|---|---|
| Auth and Profile | `src/contexts/UserContext.tsx`, `src/pages/Auth.tsx` |
| Dashboard | `src/pages/Dashboard.tsx`, badge and ring components |
| Weight Tracking | `src/pages/WeightTracker.tsx` |
| Nutrition | `src/pages/Nutrition.tsx`, `src/components/nutrition/` |
| Hydration | `src/pages/Hydration.tsx` |
| Fight Week | `src/pages/FightWeek.tsx`, `src/utils/fightWeekEngine.ts` |
| Fight Camps | `src/pages/FightCamps.tsx`, `src/pages/FightCampDetail.tsx` |
| Training | `src/pages/TrainingCalendar.tsx`, `src/utils/performanceEngine.ts` |
| Recovery | `src/pages/Recovery.tsx`, `src/components/fightcamp/RecoveryDashboard.tsx` |
| Gym Tracker | `src/pages/GymTracker.tsx` |
| AI Chat | `src/components/FloatingWizardChat.tsx`, `supabase/functions/wizard-chat/` |
| Share Cards | `src/components/share/`, 7 card templates |
| Onboarding | `src/tutorial/flows/onboardingFlow.ts` |
| Settings | `src/components/nav/SettingsPanel.tsx` |
| Edge Functions | `supabase/functions/` (19 functions) |
| Styling | `src/index.css` |
