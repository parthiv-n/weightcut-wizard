# 🧙‍♂️ Weightcut Wizard

**Weightcut Wizard** is an AI-powered, science-backed companion app for combat sport athletes managing their weight cuts safely and effectively.

Built with **React**, **Vite**, **TypeScript**, **Tailwind CSS**, **Convex** (backend + auth + realtime database), **Capacitor** (iOS native shell), and **Groq** (AI inference), it blends evidence-based nutrition science, personalized data tracking, and a touch of gamified magic to guide fighters through every phase of a weight cut — from off-camp prep to post-weigh-in recovery.

---

## 🌍 Background: The Problem We're Solving

**Rapid Weight Loss (RWL)** is deeply embedded in combat sports — but it's often **unsafe, unregulated, and misunderstood**.

- Studies show that **60–80% of fighters** regularly engage in **rapid weight cuts**, often losing **5–10% of body mass** in the final week before competition.
- Many use **risky dehydration methods** (saunas, plastics, diuretics, fluid restriction) that can impair performance, cognition, and cardiovascular safety.
- Research warns that **cutting more than ~1.5% of body weight per week** or sustaining dehydration >2% body mass can significantly impact strength, endurance, and recovery.
- Despite this, many athletes lack access to consistent, data-driven, and personalized nutrition guidance — relying instead on anecdotal advice or extreme short-term tactics.

> ⚠️ Frequent aggressive weight cuts can compromise health and longevity in the sport.  
> Weightcut Wizard exists to make safe, structured, evidence-based cutting accessible to everyone.

---

## 💡 Our Mission

To **redefine weight cutting** in combat sports — transforming it from a stressful guessing game into a **guided, intelligent, and safe process**.

**Weightcut Wizard** empowers fighters to:
- **Plan, track, and execute** their cuts safely using proven nutritional models.
- **Understand their body's responses** through data and AI learning.
- **Stay accountable** to realistic, phased targets — without compromising health or performance.

We combine science, coaching psychology, and a bit of fantasy charm to make weight management **educational, empowering, and engaging**.

---

## 🎯 Who It's For

- 🥊 **Muay Thai and MMA Fighters**
- 🥋 **Boxers, Wrestlers, and BJJ Competitors**
- 🧠 **Coaches and Nutritionists** managing fighter camps
- 📊 **Athletic organizations** seeking data-driven, safe-cut frameworks

Whether you're cutting for an amateur bout or a world championship, Weightcut Wizard is your AI-driven corner coach — wise, supportive, and precise.

---

## 📚 Scientific Foundations

Weightcut Wizard is built upon current evidence and expert consensus, including:

- **The International Society of Sports Nutrition (ISSN) position stand**
- **"Rapid Weight Loss in Combat Sports" – PMC11894756**
- **Science for Sport**, **MDPI**, and **LJMU Research Online** weight-cut reviews

### Key Safety Principles Implemented

| Category | Evidence-Based Rule | App Enforcement |
|-----------|--------------------|-----------------|
| Chronic fat loss | ≤ **1 kg/week** (~0.5–1.5% body mass/week) | Color-coded rate warnings + plan blocks |
| Dehydration | Avoid > **2–3% body mass** loss per session | In-app alerts + hydration tracker |
| Fight-week target | < **8–10%** total loss remaining | Phase dashboard limits |
| Rehydration | Replace **125–150%** of fluid lost | Post-weigh-in calculator + reminders |
| Education | Promote sustainable, coached cuts | Wizard AI guidance & disclaimers |

---

## ⚙️ Core Features

### 🧭 Dashboard
- Overview of weight, progress, and phase (off-camp → recovery)
- Wizard coach panel with motivational + analytical insights
- Countdown to weigh-in and fight day

### ⚖️ Weight Tracker
- Daily/weekly weight logs
- Animated graph with projections
- Safety color-coding (Green ≤1kg/week, Yellow caution, Red unsafe)
- Prevents unsafe plan configurations

### 🧙 AI Wizard Chat
- Groq-powered virtual coach
- Personalized guidance based on weight data and calorie intake
- Answers questions, reassures users, and gives diet advice
- Always reinforces safe, evidence-based practices

### 🍽 Nutrition
- AI meal plan generator inspired by user's normal off-camp diet
- Macro-balanced daily tracking
- Mifflin–St Jeor calorie calculation for TDEE and safe deficit
- Visual calorie progress with safety warnings

### 💧 Hydration
- Fight-week hydration guidance (avoid >2–3% dehydration)
- Rehydration calculator (125–150% fluid replacement)
- Electrolyte + carb refuel suggestions (5–10 g/kg/day)
- Educational reminders about risks of extreme dehydration

### 🥊 Fight Schedule
- Phase-based timeline (off-camp → fight week → recovery)
- Task and training planner backed by Convex realtime queries
- Fight countdown and readiness metrics
- Sync with weight tracker for dynamic adjustments

---

## 🧠 AI Logic & Safety Enforcement

The Wizard AI is prompted (via Groq inference, server-side in Convex actions) to:
- Recognize unsafe rates (>1 kg/week) and alert the user.
- Recalculate timelines or calorie targets automatically.
- Discourage dangerous dehydration methods.
- Provide meal plans with familiar foods at safe deficits.
- Use empathetic, "coach-like" communication.

All recommendations are clearly marked as **educational guidance only**, not medical advice.

---

## 🖥 Tech Stack

| Layer | Technology |
|-------|-------------|
| Frontend Framework | React 18 with TypeScript |
| Build Tool | Vite |
| Routing | React Router v6 |
| Styling | Tailwind CSS + shadcn/ui components |
| Database & Auth | Convex (realtime database + `@convex-dev/auth`) |
| AI | Groq (via Convex Actions; vision + chat models) |
| iOS | Capacitor 8 + RevenueCat (subscriptions) + Apple Sign-In |
| State Management | Convex reactive `useQuery` + React Context |
| Charts | Recharts |
| Theming | next-themes (light/dark mode) |
| Forms | React Hook Form + Zod validation |

---

## 🚀 Local Development Setup

### Prerequisites

- **Node.js** 18+ and npm
- **Convex account** — [sign up at convex.dev](https://www.convex.dev) (free tier is fine for dev)
- **Xcode 15+** (only required for iOS native builds)
- **Git**

### Step 1: Clone and install

```bash
git clone <repository-url>
cd weightcut-wizard
npm install
```

### Step 2: Bootstrap the Convex backend

```bash
npx convex dev
```

The first run interactively links the repo to a Convex deployment, creates `.env.local` with `VITE_CONVEX_URL` and `CONVEX_DEPLOYMENT`, and pushes the schema + functions. Leave this command running — it auto-pushes changes to `convex/` as you edit.

### Step 3: Provide the AI / subscription secrets

The Convex *deployment* (not the local `.env`) holds runtime secrets. Set them via the Convex dashboard or CLI:

```bash
# Required for AI features (Groq inference)
npx convex env set GROQ_API_KEY <your-key>

# Required for RevenueCat → Convex webhook
npx convex env set REVENUECAT_WEBHOOK_SECRET <shared-secret>

# Optional: enables RC REST verification in activatePremium action
npx convex env set REVENUECAT_API_KEY <rc-secret-api-key>

# Optional: Google Cloud Speech for the voice-to-text mic in chat
npx convex env set GOOGLE_SPEECH_API_KEY <your-key>
```

### Step 4: Run the web dev server

```bash
npm run dev
```

The app will be available at `http://localhost:8080`. Sign in with email + password (or Apple if configured) and Convex Auth bootstraps a profile row automatically.

### Step 5: iOS build (optional)

```bash
npm run build            # produces dist/
npx cap sync ios         # copies dist/ into ios/App + refreshes plugins
open ios/App/App.xcodeproj
```

In Xcode: select your team in **Signing & Capabilities**, then **Product → Run** for the simulator or **Product → Archive** for a TestFlight build. Bundle id is `com.weightcutwizard.app`.

### Step 6: Build for production

```bash
npm run build            # web bundle
npx convex deploy        # promote local convex/ to the production deployment
```

The production build will be in the `dist/` directory.

### Step 7: Preview Production Build

```bash
npm run preview
```

---

## 📁 Project Structure

```
weightcut-wizard/
├── src/
│   ├── components/          # React components
│   │   ├── ui/              # shadcn/ui components
│   │   ├── dashboard/       # Dashboard-specific components
│   │   └── nutrition/       # Nutrition tracking components
│   ├── pages/               # Page components (routes)
│   ├── contexts/            # React contexts (UserContext, etc.)
│   ├── hooks/               # Custom React hooks
│   ├── integrations/        # Third-party clients (Convex client)
│   └── lib/                 # Utility functions
├── convex/
│   ├── schema.ts            # Convex tables + indexes
│   ├── auth.ts              # Convex Auth provider config
│   ├── actions/             # Node-runtime actions (AI / external HTTP)
│   ├── http.ts              # HTTP routes (RevenueCat webhook)
│   ├── _shared/             # Cross-function helpers (Groq, gem gate)
│   └── _generated/          # Auto-generated by `npx convex dev` — do not edit
├── ios/                     # Capacitor iOS project
├── public/                  # Static assets
└── dist/                    # Production build output
```

---

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build in development mode
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

---

## 🌐 Environment Variables

**Client (`.env.local`)** — written for you by `npx convex dev`:

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_CONVEX_URL` | Your Convex deployment URL (e.g. `https://my-app-123.convex.cloud`) | Yes |
| `CONVEX_DEPLOYMENT` | Local dev deployment id, used by the `convex` CLI | Yes |
| `VITE_SENTRY_DSN` | Optional Sentry DSN for client error reporting | No |

**Server (Convex deployment env)** — set via `npx convex env set <KEY> <VALUE>`:

| Variable | Description | Required |
|----------|-------------|----------|
| `GROQ_API_KEY` | Groq inference key — powers every AI feature | Yes |
| `REVENUECAT_WEBHOOK_SECRET` | Shared bearer secret RevenueCat sends in the `Authorization` header | Yes (for subscriptions) |
| `REVENUECAT_API_KEY` | Optional RC REST API key — enables server-side entitlement verification in the `activatePremium` action | No |
| `GOOGLE_SPEECH_API_KEY` | Google Cloud Speech-to-Text for the in-app mic | No |
| `APPLE_PRIVATE_KEY` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_SERVICES_ID` | Apple Sign-In (web OAuth callback) | Required if Apple sign-in is enabled |

---

## 🧮 Formulas Used

**Mifflin–St Jeor Equation**
- Used for calculating Total Daily Energy Expenditure (TDEE)
- Formula: `BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) + s`
  - Where `s = +5` for men, `-161` for women
- TDEE = BMR × activity factor

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is private and proprietary.

---

## ⚠️ Disclaimer

Weightcut Wizard provides **educational guidance only** and is not a substitute for professional medical, nutritional, or coaching advice. Always consult with qualified healthcare providers, registered dietitians, and certified coaches before making significant changes to your diet, training, or weight management practices.

---

## 🆘 Troubleshooting

### Port Already in Use
If port 8080 is already in use, you can change it in `vite.config.ts`:
```typescript
server: {
  port: 3000, // Change to your preferred port
}
```

### Convex connection issues
- Verify `.env.local` has `VITE_CONVEX_URL` set (auto-written by `npx convex dev`)
- Make sure `npx convex dev` is running in a terminal — it's the auto-deploy + schema-validation loop
- Schema validation errors block deploys; check the convex terminal output for the offending field / table

### iOS build issues
- After editing anything in `convex/` or `src/`, rebuild the web bundle and re-sync before Xcode: `npm run build && npx cap sync ios`
- If RevenueCat / push notifications behave oddly in simulator, prefer testing on a real device — StoreKit Configuration files differ between simulator and TestFlight sandbox

### Build Errors
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`

---

**Built with ❤️ for combat sport athletes**
