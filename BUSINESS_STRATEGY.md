# WeightCut Wizard — Business Strategy & Monetization Analysis

> **Prepared by:** Three-perspective panel (Marketing, Product Design, Finance)
> **App:** WeightCut Wizard — AI-powered weight management for combat sport athletes
> **Current State:** 11 feature pages, 17 Supabase edge functions, zero monetization
> **Date:** February 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Marketing Analysis](#2-marketing-analysis)
3. [Product Design Improvements](#3-product-design-improvements)
4. [Finance & Monetization](#4-finance--monetization)
5. [Implementation Roadmap](#5-implementation-roadmap)
6. [Key Risks & Mitigations](#6-key-risks--mitigations)

---

## 1. Executive Summary

### The Opportunity

WeightCut Wizard is a deeply specialized AI-powered weight management platform built for combat sport athletes — a niche with **zero dominant digital solutions** and intense, recurring pain. Every fighter cuts weight. Most do it dangerously, guided by gym folklore and YouTube videos. The app already solves this problem with science-backed protocols (ISSN 2025 Position Stand, Reale et al. 2017), 17 AI functions, and a WHOOP-style performance engine — all currently given away for free.

The combat sports market is large and growing:
- **~20M+ active martial artists** in the US alone (BJJ, MMA, boxing, wrestling, judo, Muay Thai)
- **Competition participation is rising** — IBJJF registered 100K+ competitors in 2024
- Athletes already pay $150-250/mo for gym memberships, making $9.99/mo trivial
- Weight cutting is a **universal, recurring need** — not a one-time purchase

### What We Have (That Competitors Don't)

| Capability | Files/Functions | Competitive Edge |
|---|---|---|
| AI meal analysis (text, voice, barcode) | `analyze-meal`, `scan-barcode`, `VoiceInput.tsx` | 3 input modalities — no combat sports app offers voice-to-macro |
| Science-based fight week protocols | `fightWeekEngine.ts`, `fight-week-analysis` | Deterministic engine + AI interpretation — CUTCHECK charges $14.99/mo for less |
| WHOOP-style training load tracking | `performanceEngine.ts`, `RecoveryDashboard.tsx` | Acute:chronic load ratio, readiness scores — replaces a $30/mo WHOOP subscription for training load |
| Post-weigh-in rehydration protocols | `rehydration-protocol` | Hourly fluid/electrolyte/carb schedule — nobody else offers this |
| Persistent AI coach with full context | `wizard-chat`, `FloatingWizardChat.tsx` | Knows your weight history, meals, hydration, training, fight week plan |
| Fight camp history & comparison | `FightCamps.tsx`, `FightCampDetail.tsx` | Track performance across camps — learn what works |

### Recommended Strategy

**Freemium model at $9.99/month** (annual: $69.99, Fight Camp Pass: $29.99 one-time).

- **Free tier:** Core tracking (weight, meals, hydration) with limited AI (3 analyses/day) — enough to get hooked
- **Premium tier:** Unlimited AI, fight week protocols, rehydration protocols, training load analytics, AI coach chat, PDF export, camp comparison
- **Break-even:** ~14-34 paying subscribers (depending on AI usage patterns)
- **Year 1 target:** 500 premium subscribers = ~$60K ARR

---

## 2. Marketing Analysis

### 2.1 Target Personas

| Persona | Description | Pain Point | Premium Trigger |
|---|---|---|---|
| **"First Cut Freddy"** | Amateur fighter (18-25), first competition in 6-8 weeks, terrified of weight cut | Has no system — Googling "how to cut weight for BJJ" at midnight | Fight week protocol + AI guidance |
| **"Serious Sarah"** | Competitive amateur (22-30), 3-4 fights/year, trains 5-6x/week | Tracks macros in MyFitnessPal but it doesn't understand fight week, water loading, or periodized nutrition | All-in-one platform that speaks her sport |
| **"Coach Carlos"** | Runs a gym/team of 10-30 competitors, manages multiple weight cuts simultaneously | Texts each athlete individually, no centralized view, liability concerns | Coach dashboard (future), team management |
| **"Pro Pete"** | Professional fighter (25-35), sponsored, fights on major cards | Needs precise, science-backed protocols — can't afford a bad cut on fight week | Rehydration protocols, camp comparison, PDF reports for his team |
| **"Weekend Warrior Will"** | Recreational BJJ competitor (28-40), competes 1-2x/year, prioritizes health | Wants to compete without feeling terrible — willing to pay for peace of mind | Safety-focused AI guidance, gentle cut recommendations |

### 2.2 Competitive Landscape

| Competitor | Price | Strengths | Weaknesses | Our Advantage |
|---|---|---|---|---|
| **CUTCHECK** | $14.99/mo | Purpose-built for combat sports weight cuts, established brand | Limited to weight cut only — no nutrition tracking, no training load, no AI coach | We're a full platform (nutrition + training + weight cut + AI) at a lower price |
| **MacroFactor** | $11.99/mo | Excellent macro tracking, adaptive TDEE algorithm | Zero combat sports awareness — doesn't know what fight week, water loading, or rehydration is | We speak the athlete's language and understand their periodized needs |
| **RP Diet** | $15.99/mo | Science-backed, good reputation in strength sports | Template-based, not truly personalized. Emerging AI features but no combat sports specialization | Our AI adapts in real-time to weight log trends + fight timeline |
| **MyFitnessPal** | $19.99/mo | Massive food database, brand recognition | Generic fitness app. No fight week, no weight cut protocols, no training load | We're purpose-built — MFP is a Swiss Army knife, we're a scalpel |
| **WHOOP** | $30/mo + hardware | Best-in-class recovery/strain tracking, hardware wearable | Requires $30/mo + band purchase. No nutrition, no weight cut protocols | Our `performanceEngine.ts` provides similar strain/readiness metrics via manual input at 1/3 the cost |

**Key Insight:** No single competitor combines nutrition tracking + fight week protocols + training load analytics + AI coaching. We own the intersection.

### 2.3 Growth Channels

#### Tier 1 — High-ROI Organic Channels

| Channel | Strategy | Expected CAC |
|---|---|---|
| **YouTube** | "How to cut weight for [BJJ/MMA/boxing]" tutorial series. Show the app in action. Target long-tail keywords with low competition. | $0 (organic) |
| **TikTok / Instagram Reels** | 30-60s clips: "I used AI to plan my weight cut" transformation content. Fight week day-by-day timelapses. Before/after weigh-in content. | $0 (organic) |
| **Reddit** | Active presence in r/bjj (420K), r/MMA (2.2M), r/amateur_boxing (95K), r/wrestling (110K). Answer weight cut questions, link to app naturally. Weekly "Weight Cut Wednesday" engagement posts. | $0 (organic) |
| **Combat Sports Podcasts** | Guest spots on BJJ/MMA podcasts discussing the science of weight cutting. Offer free premium codes to listeners. | $0-50/episode |

#### Tier 2 — Partnership Channels

| Channel | Strategy | Expected CAC |
|---|---|---|
| **Gym Partnerships** | Partner with 10-20 BJJ/MMA gyms. Offer gym members 30-day free premium trial. Coaches get free premium + future coach dashboard. | $2-5/user |
| **Competition Sponsorships** | Sponsor local/regional BJJ and MMA events. QR code on event programs/banners. Offer "Fight Camp Pass" discount to all competitors. | $5-10/user |
| **Fighter Ambassadors** | Recruit 5-10 competitive fighters (amateur or low-level pro) as ambassadors. Free premium + small monthly stipend in exchange for content and referrals. | $3-8/user |

#### Tier 3 — Paid Acquisition (Phase 3+)

| Channel | Strategy | Expected CAC |
|---|---|---|
| **Google Ads** | Target "weight cut app", "BJJ weight cut", "MMA diet plan" keywords. Low competition = low CPC ($0.50-2.00). | $8-15/user |
| **Meta Ads** | Interest-based targeting: BJJ, MMA, boxing + "weight loss" intent. Retarget website visitors and app installers. | $10-20/user |

### 2.4 Brand Positioning

**Tagline options:**
- "Your corner, in your pocket."
- "Cut weight like a pro. Recover like a scientist."
- "The AI coach that knows your fight."

**Brand voice:** Authoritative but approachable. We're the experienced corner coach who's also read every sports science paper. Not a generic fitness bro, not an intimidating academic — the smart training partner who's been through it.

**Visual identity:** The current dark UI (near-black `--background: 0 0% 2%`) with the Apple Fitness aesthetic is already strong. It signals premium quality and aligns with WHOOP/Apple fitness visual language. Lean into this — it differentiates from the bright, generic look of MyFitnessPal and other mass-market apps.

---

## 3. Product Design Improvements

### 3.1 Priority 0 — Foundation (Must-Have Before Monetization)

These are non-negotiable before charging users:

| Item | Why | Implementation Notes |
|---|---|---|
| **Analytics & Error Tracking** | Can't improve what you can't measure. Need crash reports, funnel analysis, feature usage heatmaps. | Add PostHog or Mixpanel. Track: onboarding completion rate, daily active users, AI feature usage per function, feature retention curves. Instrument key events in `UserContext.tsx` and each page component. |
| **Rate Limiting Enforcement** | `rate_limits` table exists but isn't enforced in the frontend or edge functions. Free users could burn through unlimited Grok API calls. | Enforce in each edge function's `index.ts`. Check `rate_limits` table before calling Grok. Return 429 with upgrade CTA for free tier users who exceed limits. |
| **Settings Page** | No way for users to change email, password, units (kg/lb), notification preferences, delete account, or manage subscription. | Create `src/pages/Settings.tsx`. Include: account management, unit preferences (currently a per-component toggle), notification preferences, subscription management, data export, account deletion. |
| **Empty States** | Pages like `FightCamps.tsx`, `FightCampCalendar.tsx`, and `Hydration.tsx` show blank screens when there's no data. New users see nothing. | Add illustrated empty states with clear CTAs. Example: FightCamps empty state → "No camps yet. Create your first fight camp to start tracking." with a prominent button. |
| **Offline Resilience** | Capacitor iOS app has no offline handling. If the user loses signal mid-workout, data could be lost. | Queue mutations in localStorage when offline, sync on reconnect. Critical for gym environments with poor signal. |

### 3.2 Priority 1 — Free Tier Engagement Features

These features keep free users engaged and create upgrade pressure:

#### Streaks & Gamification
- **Daily logging streak** — Track consecutive days of weight logging. Display streak count on Dashboard (`Dashboard.tsx`) next to the greeting. Streak freeze available to premium users.
- **Weekly consistency score** — Percentage of days with complete logs (weight + nutrition + hydration). Show in a ring on Dashboard.
- **Milestone badges** — "7-day streak", "First fight week planned", "100 meals logged", "First camp completed". Display on a profile achievements section.

#### Shareable Cards
- **Fight week summary card** — Beautiful, branded image showing the weight cut plan (start weight → target → methods breakdown). Shareable to Instagram Stories/TikTok. Generated client-side from `FightWeek.tsx` data using `html2canvas`.
- **Weigh-in result card** — "Made weight! 145.0 → 144.8 lbs" with the app branding. Shareable immediately after logging weigh-in weight.
- **Camp comparison card** — Side-by-side stats from two fight camps.
- **Watermark for free users** — Free tier cards include "Made with WeightCut Wizard" watermark. Premium removes it.

#### Push Notifications (Capacitor)
- **Morning weight reminder** — "Time to step on the scale" at user-configured time (default 7am). Drives the core habit loop.
- **Meal logging nudge** — "You haven't logged lunch yet" at 2pm if no afternoon meal logged.
- **Hydration checkpoint** — "You're at 1.2L of your 3L target — keep drinking" at 3pm.
- **Fight week countdown** — "5 days until weigh-in. Today's protocol: reduce sodium to 1000mg." Daily during active fight week.
- **Streak protection** — "Your 14-day streak is about to break! Log your weight before midnight."

### 3.3 Premium Features

These are the features users pay $9.99/mo for:

| Feature | Description | Technical Notes |
|---|---|---|
| **Unlimited AI Analyses** | Free tier: 3 AI calls/day across all functions. Premium: unlimited. | Enforce via `rate_limits` table in each edge function. Frontend shows remaining count + upgrade CTA. |
| **Fight Week Protocols** | Full access to `FightWeek.tsx` — the deterministic engine + AI analysis + day-by-day timeline. Free users see a preview/teaser only. | Gate at page level with a paywall modal. Show the projection chart but blur the daily protocols. |
| **Rehydration Protocols** | Full post-weigh-in rehydration plan generation from `Hydration.tsx`. | Gate the "Generate Rehydration Protocol" button. Show sample output to free users. |
| **AI Coach Chat** | Unlimited access to `FloatingWizardChat.tsx` / `wizard-chat` edge function. Free tier: 5 messages/day. | Track message count in `rate_limits` or `chat_messages` table. |
| **Training Load Analytics** | Full `RecoveryDashboard.tsx` with strain tracking, readiness scores, overtraining risk, acute:chronic load ratio from `performanceEngine.ts`. | Gate the `FightCampCalendar.tsx` recovery dashboard section. Free users see basic session logging only. |
| **PDF Export** | Export fight week plan, nutrition logs, weight history, and camp reports as branded PDF. For coaches, doctors, or personal records. | Use `jsPDF` or `react-pdf` to generate client-side. Include charts via `html2canvas`. |
| **HealthKit / Apple Health Sync** | Auto-import weight from Apple Health scale. Auto-import workouts. Export hydration data. | Capacitor plugin `@capacitor/health`. Reduces manual entry friction — major retention driver. |
| **Camp Comparison** | Side-by-side comparison of two fight camps: weight trajectory, training load, nutrition adherence, performance feeling. "What worked better?" | New component in `FightCamps.tsx`. Query two camps' associated `fight_camp_calendar` and `weight_logs` data. |
| **Advanced Diet Analysis** | Full `DietAnalysisCard.tsx` micronutrient analysis, deficiency detection, optimization suggestions from `analyse-diet` edge function. | Gate the "Analyze Diet" button in `Nutrition.tsx`. Free users see macro totals only. |
| **AI Meal Planner** | Full daily meal plan generation via `meal-planner` edge function. | Gate the meal planner dialog in `Nutrition.tsx`. |
| **Streak Freeze** | Protect your streak — 1 freeze per week for premium users. | Simple boolean check before resetting streak counter. |
| **No Watermark on Shares** | Shareable cards without "Made with WeightCut Wizard" branding. | Conditional render in share card generator. |

### 3.4 Future Premium Features (Post-Launch)

| Feature | Description | Revenue Impact |
|---|---|---|
| **Coach Dashboard** | Multi-athlete management. Coach sees all their athletes' weight, nutrition, training load in one view. Can push meal plans and protocols. | New pricing tier: $29.99/mo for coaches. High LTV — coaches stay subscribed as long as they have athletes. |
| **Team/Gym Plans** | Gym owner purchases bulk premium for their competition team. | $7.99/athlete/mo (discount from individual). Gym pays, athletes benefit. |
| **Supplement Marketplace** | Affiliate links to recommended electrolyte mixes, protein powders, scales. Contextual recommendations ("You need more sodium — here's our recommended electrolyte mix"). | Affiliate revenue (8-15% commission). See Finance section. |
| **Live Fight Week Monitoring** | Real-time dashboard during fight week. Coach and athlete see the same data. Alert system for dangerous dehydration levels. | Safety differentiator. Include in coach tier. |

---

## 4. Finance & Monetization

### 4.1 Tier Gating Table

| Feature | Free | Premium ($9.99/mo) |
|---|---|---|
| Weight logging & history chart | Unlimited | Unlimited |
| Manual meal logging | Unlimited | Unlimited |
| Hydration tracking | Unlimited | Unlimited |
| Basic fight camp logging | Unlimited | Unlimited |
| Training session logging | Unlimited | Unlimited |
| Daily Wisdom card | Yes (with weight log) | Yes |
| AI meal analysis (text) | 3/day | Unlimited |
| AI meal analysis (voice) | 3/day | Unlimited |
| Barcode scanning | 5/day | Unlimited |
| USDA food search | 10/day | Unlimited |
| AI weight analysis | 1/day | Unlimited |
| AI diet analysis | — | Unlimited |
| AI meal planner | — | Unlimited |
| Fight week protocols | Preview only | Full access |
| Rehydration protocols | — | Full access |
| AI coach chat | 5 msgs/day | Unlimited |
| Training load analytics (WHOOP-style) | — | Full access |
| Fight camp comparison | — | Full access |
| PDF export | — | Full access |
| HealthKit sync | — | Full access |
| Shareable cards | With watermark | No watermark |
| Streak freeze | — | 1/week |
| Hydration insights (AI) | 1/day | Unlimited |

### 4.2 Pricing Strategy

| Plan | Price | Rationale |
|---|---|---|
| **Monthly** | $9.99/mo | Below CUTCHECK ($14.99), below MacroFactor ($11.99), well below RP Diet ($15.99). Impulse-buy territory for athletes already spending $150+/mo on training. |
| **Annual** | $69.99/yr ($5.83/mo) | 42% discount. Standard SaaS annual pricing. Targets "Serious Sarah" who competes year-round. |
| **Fight Camp Pass** | $29.99 one-time (90 days) | For "Weekend Warrior Will" who competes 1-2x/year and doesn't want a subscription. Covers a typical 8-12 week fight camp. Lower barrier to entry. Converts some to annual after they see the value. |

**Recommended launch pricing:** Start at $9.99/mo with a **"Founding Member" offer of $4.99/mo (locked for life)** for the first 100 subscribers. Creates urgency, rewards early adopters, generates testimonials.

### 4.3 Revenue Projections

#### Assumptions
- Free-to-premium conversion rate: 3-5% (industry standard for fitness apps)
- Monthly churn: 8% (combat sports has natural retention around competition cycles)
- Average revenue per user (ARPU): $8.50/mo (blended across monthly, annual, and Fight Camp Pass)
- Customer acquisition cost (CAC): $5-15 (primarily organic in Year 1)

#### Projections

| Metric | Conservative | Moderate | Aggressive |
|---|---|---|---|
| **Free users (Month 12)** | 2,000 | 5,000 | 15,000 |
| **Conversion rate** | 3% | 4% | 5% |
| **Premium subscribers (Month 12)** | 60 | 200 | 750 |
| **Monthly revenue (Month 12)** | $510 | $1,700 | $6,375 |
| **Annual revenue (Year 1, cumulative)** | $3,000 | $12,000 | $45,000 |
| **Annual revenue (Year 2)** | $15,000 | $60,000 | $200,000 |
| **Break-even month** | Month 8 | Month 4 | Month 2 |

### 4.4 Cost Structure

| Cost Category | Monthly Estimate | Notes |
|---|---|---|
| **Supabase (Pro)** | $25 | Pro plan covers auth, DB, storage, edge functions. Free tier sufficient until ~500 DAU. |
| **xAI / Grok API** | $50-300 | Currently using `grok-4-1-fast-reasoning`. Cost scales with premium users. At 200 subscribers doing ~10 AI calls/day: ~$150/mo. Rate limiting free tier is critical. |
| **Google Gemini API** | $5-20 | Used for `transcribe-audio` (low volume — most transcription is client-side Whisper). |
| **Apple Developer Program** | $8.25/mo ($99/yr) | Required for iOS App Store distribution. |
| **Domain + hosting** | $10-15 | Vercel or Netlify free tier may suffice initially. |
| **Total fixed costs** | ~$100/mo | Before significant scale. |
| **Total at 200 subscribers** | ~$250/mo | Revenue at 200 subs: ~$1,700/mo. Margin: ~85%. |

#### Break-Even Analysis

| Scenario | Monthly Costs | ARPU | Break-Even Subscribers |
|---|---|---|---|
| **Minimal (Supabase free + low AI)** | $50 | $8.50 | **~6 subscribers** |
| **Standard (Supabase Pro + moderate AI)** | $125 | $8.50 | **~15 subscribers** |
| **Growth (Pro + heavy AI + marketing spend)** | $500 | $8.50 | **~59 subscribers** |

**Key insight:** The business is profitable almost immediately due to near-zero infrastructure costs. Even 15 paying subscribers covers all costs. The challenge is growth, not unit economics.

### 4.5 Affiliate & Partnership Revenue

| Opportunity | Commission | Integration Point | Est. Monthly Revenue (at 200 subs) |
|---|---|---|---|
| **Electrolyte supplements** (LMNT, Liquid IV, Drip Drop) | 15-20% per sale | `Hydration.tsx` — "Recommended for your rehydration protocol" | $100-300 |
| **Digital scales** (Withings, Renpho) | 8-12% per sale | `WeightTracker.tsx` — "Sync with a smart scale" | $50-150 |
| **Protein / meal prep services** | 10-15% per sale | `Nutrition.tsx` — AI meal plan → "Order these ingredients" | $75-200 |
| **BJJ/MMA gear** (Hayabusa, Sanabul) | 8-10% per sale | `FightCamps.tsx` — contextual gear recommendations | $50-100 |
| **Online coaching platforms** (if not building own) | Referral fee | For users who want human coaching in addition to AI | $100-200 |
| **Total affiliate potential** | | | **$375-950/mo** |

Affiliate revenue could represent 20-40% of total revenue at scale, significantly boosting margins without increasing subscription price.

### 4.6 Payment Infrastructure

**Recommended: RevenueCat** for subscription management.

| Component | Tool | Why |
|---|---|---|
| **iOS subscriptions** | RevenueCat + Apple StoreKit 2 | Handles App Store billing, receipt validation, subscription lifecycle. Apple takes 15-30% cut. |
| **Web subscriptions** | Stripe Checkout + RevenueCat | For users who sign up via web (avoids Apple's 30% cut). |
| **Subscription state** | RevenueCat webhook → Supabase | Webhook writes `subscription_tier` and `subscription_expires_at` to `profiles` table. All feature gating checks these fields. |
| **Feature gating** | `useSubscription()` hook | New React hook that reads subscription state from `profiles`. Used by every gated component. |

**Apple's cut strategy:** Encourage web sign-ups (link from app to website for subscription) to avoid the 30% App Store commission. App Store pricing can be $12.99/mo (to net ~$9.09 after Apple's cut), while web pricing is $9.99/mo.

---

## 5. Implementation Roadmap

### Phase 1: Foundation (Months 1-2)

**Goal:** Production-ready infrastructure, analytics, and free tier engagement.

| Task | Priority | Effort | Details |
|---|---|---|---|
| Add analytics (PostHog/Mixpanel) | P0 | 3 days | Instrument `UserContext.tsx`, all page mounts, AI function calls, onboarding funnel |
| Add error tracking (Sentry) | P0 | 1 day | Wrap `App.tsx` in error boundary, add Sentry to all edge functions |
| Enforce rate limiting | P0 | 3 days | Add checks to all 17 edge functions using `rate_limits` table. Return 429 with `{ upgrade: true }` for exceeded free tier |
| Build Settings page | P0 | 4 days | `src/pages/Settings.tsx` — account, units, notifications, data export, delete account |
| Add empty states | P1 | 2 days | Illustrated empty states for FightCamps, FightCampCalendar, Hydration, Nutrition (no meals) |
| Implement streaks | P1 | 3 days | Daily weight logging streak tracked in new `user_streaks` table or `profiles` columns. Display on Dashboard |
| Push notifications (Capacitor) | P1 | 4 days | Morning weight reminder, meal logging nudge, hydration checkpoint, fight week countdown |
| Shareable cards (v1) | P2 | 3 days | Fight week summary card + weigh-in result card. `html2canvas` → share sheet |

### Phase 2: Premium Launch (Months 3-4)

**Goal:** Subscription infrastructure live, first paying users.

| Task | Priority | Effort | Details |
|---|---|---|---|
| Integrate RevenueCat + Stripe | P0 | 5 days | iOS StoreKit 2 + web Stripe Checkout. Webhook → `profiles.subscription_tier` |
| Build `useSubscription()` hook | P0 | 1 day | Reads `profiles.subscription_tier`. `isPremium`, `remainingAICalls`, `tier` |
| Gate premium features | P0 | 4 days | Add paywall modals to: fight week, rehydration, AI coach (>5 msgs), training analytics, diet analysis, meal planner |
| Build paywall/upgrade UI | P0 | 3 days | Beautiful upgrade modal showing feature comparison. Triggered on gated feature access |
| PDF export | P1 | 3 days | `jsPDF` + `html2canvas`. Export fight week plan, nutrition logs, weight history |
| "Founding Member" campaign | P1 | 1 day | Landing page, email capture, $4.99/mo locked pricing for first 100 |
| App Store submission prep | P1 | 3 days | Screenshots, description, review guidelines compliance, subscription metadata |

### Phase 3: Growth (Months 5-8)

**Goal:** Organic growth channels active, 200+ premium subscribers.

| Task | Priority | Effort | Details |
|---|---|---|---|
| HealthKit integration | P0 | 5 days | Auto-import weight, export hydration. Capacitor `@capacitor/health` plugin |
| Camp comparison feature | P1 | 4 days | Side-by-side stats from two `fight_camps` records + associated calendar/weight data |
| Content marketing launch | P1 | Ongoing | YouTube tutorials, TikTok clips, Reddit presence. 2-3 pieces/week |
| Gym partnership pilot | P1 | Ongoing | 5 gyms, 30-day free premium trials, feedback collection |
| Fighter ambassador program | P2 | Ongoing | 5 fighters, free premium + content creation agreement |
| Affiliate integrations (v1) | P2 | 3 days | LMNT/electrolyte affiliate links in `Hydration.tsx` rehydration protocols |
| Referral program | P2 | 3 days | "Give 1 month, get 1 month" referral system. Tracked via referral codes |

### Phase 4: Scale (Months 9-12)

**Goal:** Coach dashboard, team plans, 500+ premium subscribers.

| Task | Priority | Effort | Details |
|---|---|---|---|
| Coach dashboard (v1) | P0 | 15 days | Multi-athlete view. Coach sees weight/nutrition/training for each athlete. Requires new `teams` and `team_members` tables + RLS policies |
| Team/gym subscription plan | P0 | 5 days | Bulk pricing at $7.99/athlete/mo. Stripe multi-seat subscription |
| Advanced AI features | P1 | 5 days | Fight outcome prediction based on historical camp data. "What-if" scenarios for different cut strategies |
| Internationalization (i18n) | P1 | 5 days | Spanish, Portuguese (huge BJJ markets in Brazil/Latin America) |
| Android release | P1 | 5 days | Capacitor already supports Android. Build config, Play Store submission |
| Paid acquisition (v1) | P2 | Ongoing | Google Ads on weight cut keywords. Meta Ads for combat sports interest targeting |

---

## 6. Key Risks & Mitigations

### 6.1 Technical Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **AI provider lock-in (xAI/Grok)** | High | Medium | All 15 AI edge functions depend on Grok `grok-4-1-fast-reasoning`. If xAI changes pricing, rate limits, or discontinues the model, every AI feature breaks. **Mitigation:** Abstract the LLM call into a shared `llm-client.ts` utility used by all edge functions. Add fallback to OpenAI GPT-4o-mini or Anthropic Claude Haiku. Test monthly with alternative providers. |
| **Supabase dependency** | High | Low | Auth, DB, storage, edge functions, real-time — everything runs on Supabase. **Mitigation:** Supabase is open-source (self-hostable). Keep database schema documented. Use standard PostgreSQL features (no Supabase-specific extensions). Migration path exists. |
| **Client-side Whisper model size** | Medium | Medium | `VoiceInput.tsx` loads `whisper-tiny.en` ONNX model client-side. Model download is ~40MB. Poor experience on slow connections. **Mitigation:** Consider moving to server-side transcription for premium users. Already have `transcribe-audio` edge function as fallback. |
| **iOS App Store rejection** | Medium | Medium | Apple may reject or delay the app for subscription-related review issues. **Mitigation:** Follow Apple's subscription guidelines exactly. No links to external payment (web checkout) from within the iOS app — handle web subscriptions via the website only. |
| **Rate limit gaming** | Low | Medium | Users could create multiple free accounts to bypass AI limits. **Mitigation:** Rate limit by device fingerprint in addition to user ID. Flag accounts with suspicious patterns. |

### 6.2 Market Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **CUTCHECK expands features** | High | Medium | CUTCHECK could add nutrition tracking, AI features, and training load analytics — closing our differentiation gap. **Mitigation:** Move fast. Our tech stack (17 AI functions, full-stack platform) gives us a significant head start. Focus on features CUTCHECK can't easily replicate: persistent AI coach with full context, WHOOP-style training load, voice meal logging. |
| **Subscription fatigue / high churn** | High | High | Combat sports athletes have seasonal engagement (train hard before fights, coast between). Monthly churn could exceed 10%. **Mitigation:** Annual pricing incentive (42% discount), Fight Camp Pass for casual users, streaks/gamification for retention between competitions, push notifications to maintain habit loops. |
| **Small total addressable market** | Medium | Low | Combat sports is niche compared to general fitness. **Mitigation:** Niche is a feature, not a bug. Higher willingness-to-pay, lower competition, stronger community effects. Can expand to wrestling, judo, weightlifting (all have weight classes) later. |
| **Free tier too generous** | Medium | Medium | If free tier provides enough value, users won't upgrade. **Mitigation:** The key gate is AI usage (3 calls/day feels limiting fast) and fight week protocols (the highest-value, most urgent feature). Monitor conversion funnel closely and adjust limits. |

### 6.3 Regulatory Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **Health advice liability** | High | Low | AI-generated nutrition, hydration, and weight cut advice could be construed as medical/health advice. If an athlete has a bad cut and blames the app, legal exposure exists. **Mitigation:** (1) Add clear disclaimers on every AI-generated recommendation: "This is not medical advice. Consult a physician before any weight cut." (2) Add a disclaimer acceptance during onboarding. (3) Safety guardrails already exist (dehydration zones in `fightWeekEngine.ts` flag >5% as orange, >7% as red). (4) Consider professional liability insurance ($500-1500/yr). |
| **HIPAA / health data** | Medium | Low | Weight, nutrition, and wellness data could be considered protected health information (PHI) in some jurisdictions. **Mitigation:** We're not a covered entity (not a healthcare provider). However, implement strong data encryption, clear privacy policy, and GDPR-compliant data deletion (Settings page → delete account). |
| **App Store health claims** | Medium | Medium | Apple restricts health-related claims in App Store listings. **Mitigation:** Frame as "fitness tracking and planning tool" not "health advice tool." Avoid medical terminology in marketing copy. Follow Apple Health & Fitness app guidelines. |

### 6.4 Competitive Response Matrix

| Scenario | Our Response |
|---|---|
| **CUTCHECK drops price to $9.99/mo** | Emphasize our full-platform advantage (they only do weight cut, we do everything). Offer competitive switch discount. |
| **MyFitnessPal adds "fight mode"** | They can't match our depth. Our fight week engine cites ISSN papers. Their "fight mode" would be superficial. Double down on combat sports community and credibility. |
| **WHOOP adds nutrition tracking** | WHOOP requires $30/mo + hardware. We're $9.99/mo software-only. Position as the affordable, combat-sports-specific alternative. |
| **New AI-native competitor emerges** | Our moat is data (weight logs, nutrition logs, fight camp history) + community. First-mover advantage in combat sports AI. Accelerate feature development. |
| **Free open-source alternative appears** | Open-source can't fund AI API costs at scale. Our AI features (17 edge functions) require ongoing API spend that open-source projects can't sustain. |

---

## Appendix: Key File Reference

| Area | Files |
|---|---|
| Auth & Profile | `src/contexts/UserContext.tsx`, `src/pages/Auth.tsx`, `src/pages/Onboarding.tsx` |
| Dashboard | `src/pages/Dashboard.tsx`, `src/components/dashboard/WeightProgressRing.tsx`, `src/components/dashboard/CalorieProgressRing.tsx` |
| Weight Tracking | `src/pages/WeightTracker.tsx`, `src/components/dashboard/WeightIncreaseQuestionnaire.tsx` |
| Nutrition | `src/pages/Nutrition.tsx`, `src/components/nutrition/BarcodeScanner.tsx`, `src/components/nutrition/VoiceInput.tsx`, `src/components/nutrition/DietAnalysisCard.tsx`, `src/components/nutrition/FoodSearchDialog.tsx` |
| Hydration | `src/pages/Hydration.tsx` |
| Fight Week | `src/pages/FightWeek.tsx`, `src/utils/fightWeekEngine.ts`, `src/components/fightweek/` |
| Fight Camps | `src/pages/FightCamps.tsx`, `src/pages/FightCampDetail.tsx`, `src/pages/FightCampCalendar.tsx` |
| Training Analytics | `src/utils/performanceEngine.ts`, `src/components/fightcamp/RecoveryDashboard.tsx`, `src/components/fightcamp/StrainChart.tsx` |
| AI Chat | `src/components/FloatingWizardChat.tsx`, `supabase/functions/wizard-chat/index.ts` |
| AI Caching | `src/utils/AIPersistence.ts` |
| Edge Functions | `supabase/functions/` (17 functions — see Section 1 for full list) |
| Routing | `src/App.tsx` |
| Styling | `src/index.css` (`.glass-card`, `.display-number`, dark theme variables) |
