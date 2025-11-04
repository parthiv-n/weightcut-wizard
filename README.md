# 🧙‍♂️ Weightcut Wizard

**Weightcut Wizard** is an AI-powered, science-backed companion app for combat sport athletes managing their weight cuts safely and effectively.

Built with **Next.js**, **Tailwind CSS**, **Supabase**, and **Gemini API**, it blends evidence-based nutrition science, personalized data tracking, and a touch of gamified magic to guide fighters through every phase of a weight cut — from off-camp prep to post-weigh-in recovery.

---

## 🌍 Background: The Problem We’re Solving

**Rapid Weight Loss (RWL)** is deeply embedded in combat sports — but it’s often **unsafe, unregulated, and misunderstood**.

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
- **Understand their body’s responses** through data and AI learning.
- **Stay accountable** to realistic, phased targets — without compromising health or performance.

We combine science, coaching psychology, and a bit of fantasy charm to make weight management **educational, empowering, and engaging**.

---

## 🎯 Who It’s For

- 🥊 **Muay Thai and MMA Fighters**
- 🥋 **Boxers, Wrestlers, and BJJ Competitors**
- 🧠 **Coaches and Nutritionists** managing fighter camps
- 📊 **Athletic organizations** seeking data-driven, safe-cut frameworks

Whether you’re cutting for an amateur bout or a world championship, Weightcut Wizard is your AI-driven corner coach — wise, supportive, and precise.

---

## 📚 Scientific Foundations

Weightcut Wizard is built upon current evidence and expert consensus, including:

- **The International Society of Sports Nutrition (ISSN) position stand**
- **“Rapid Weight Loss in Combat Sports” – PMC11894756**
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
- AI meal plan generator inspired by user’s normal off-camp diet
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
- Use empathetic, “coach-like” communication.

All recommendations are clearly marked as **educational guidance only**, not medical advice.

---

## 🖥 Tech Stack

| Layer | Technology |
|-------|-------------|
| Frontend | Next.js (App Router, TypeScript) |
| Styling | Tailwind CSS |
| Database | Supabase (Auth + Row-level Security) |
| AI | Gemini API |
| Charts | Recharts / Animated SVG graphs |
| Theming | Custom Tailwind tokens + light/dark toggle |
| Fonts | Cormorant Garamond (headings) + Manrope (UI) |

---

## 🎨 Design System

**Brand Essence:**  
> “Your magical AI weight-cutting companion — wise, supportive, mystical, and precise.”

- **Wizard Blue:** `#5A7DFF`  
- **Arcane Purple:** `#8A4DFF`
- Gradient accents, glowing UI effects, 8-bit fighter avatar
- Full light/dark mode with accessible contrast

Typography:
- Headings: *Poppins*  
- Body/UI: *Manrope*

---

## 🧮 Formulas Used

**Mifflin–St Jeor Equation**
