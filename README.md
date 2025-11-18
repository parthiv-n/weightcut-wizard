# 🧙‍♂️ Weightcut Wizard

**Weightcut Wizard** is an AI-powered, science-backed companion app for combat sport athletes managing their weight cuts safely and effectively.

Built with **React**, **Vite**, **TypeScript**, **Tailwind CSS**, **Supabase**, and **Gemini API**, it blends evidence-based nutrition science, personalized data tracking, and a touch of gamified magic to guide fighters through every phase of a weight cut — from off-camp prep to post-weigh-in recovery.

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
- Gemini-powered virtual coach
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
- Task and training planner with Supabase integration
- Fight countdown and readiness metrics
- Sync with weight tracker for dynamic adjustments

---

## 🧠 AI Logic & Safety Enforcement

The Wizard AI is trained (via Gemini API prompts) to:
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
| Database & Auth | Supabase (PostgreSQL + Row-level Security) |
| AI | Gemini API (via Supabase Edge Functions) |
| State Management | React Query (TanStack Query) |
| Charts | Recharts |
| Theming | next-themes (light/dark mode) |
| Forms | React Hook Form + Zod validation |

---

## 🚀 Local Development Setup

### Prerequisites

- **Node.js** 18+ and npm/yarn/pnpm
- **Supabase Account** - [Sign up here](https://app.supabase.com)
- **Git** (for cloning the repository)

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd weightcut-wizard
```

### Step 2: Install Dependencies

Using npm:
```bash
npm install
```

Or using yarn:
```bash
yarn install
```

Or using pnpm:
```bash
pnpm install
```

### Step 3: Set Up Environment Variables

1. Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

2. Get your Supabase credentials:
   - Go to [Supabase Dashboard](https://app.supabase.com)
   - Select your project (or create a new one)
   - Go to **Settings** → **API**
   - Copy the following values:
     - **Project URL** → `VITE_SUPABASE_URL`
     - **anon/public key** → `VITE_SUPABASE_PUBLISHABLE_KEY`

3. Update your `.env` file:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
```

### Step 4: Set Up Supabase Database

1. **Run Migrations** (if you have local Supabase CLI):
   ```bash
   # If using Supabase CLI locally
   supabase db reset
   ```

   Or manually run the SQL migrations from `supabase/migrations/` in your Supabase SQL Editor.

2. **Set Up Edge Functions** (optional for local dev):
   - The app uses Supabase Edge Functions for AI features
   - These are deployed separately on Supabase
   - For local development, you can test the frontend without them, but AI features won't work

### Step 5: Start the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:8080` (or the port specified in `vite.config.ts`).

### Step 6: Build for Production

```bash
npm run build
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
│   ├── integrations/        # Third-party integrations (Supabase)
│   └── lib/                 # Utility functions
├── supabase/
│   ├── migrations/          # Database migrations
│   └── functions/           # Supabase Edge Functions
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

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase anon/public key | Yes |

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

### Supabase Connection Issues
- Verify your `.env` file has the correct values
- Check that your Supabase project is active
- Ensure your Supabase project has the necessary tables and RLS policies set up

### Build Errors
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`

---

**Built with ❤️ for combat sport athletes**
