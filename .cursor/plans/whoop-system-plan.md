# 🥊 Weight Cut Wizard — WHOOP Intelligence System (Production Implementation File)

## ⚠️ IMPORTANT CONTEXT FOR CLAUDE

Most frontend components, navigation, state management, and backend infrastructure are ALREADY BUILT.

You are NOT building from scratch.

You are:

• Improving existing UI using Max Pro UI skill  
• Integrating deterministic strain + overtraining engine  
• Connecting to existing LLM API layer  
• Refining visuals to match WHOOP-level polish  
• Maintaining app-wide design system (glass translucent purple theme)  

DO NOT redesign navigation.  
DO NOT remove existing architecture.  
Enhance and integrate.

---

# 🎯 SYSTEM OBJECTIVE

Implement a WHOOP-style recovery & strain intelligence engine that:

Uses user inputs:
- RPE (1–10)
- Soreness (1–10)
- Minutes Trained
- Intensity (1–5)
- Sessions per day

Outputs:
- Strain Score (0–21)
- Overtraining Risk Score (0–100)
- Readiness State
- AI Coaching Advice
- 7-Day Strain Line Chart
- Forecasted Recovery Trend

This must feel:

• Elite  
• Scientifically grounded  
• Conservative  
• Minimal  
• Premium  

---

# 🧠 SYSTEM ARCHITECTURE

## Layer 1 — Deterministic Performance Engine (Non-AI)

LLM DOES NOT calculate strain.

Create:

/utils/performanceEngine.ts

---

## 1️⃣ Session Load

sessionLoad = (RPE × Minutes) × IntensityMultiplier

IntensityMultiplier:
- 1 → 0.8
- 2 → 1.0
- 3 → 1.15
- 4 → 1.3
- 5 → 1.5

---

## 2️⃣ Daily Load

dailyLoad = sum(sessionLoads)

If sessions > 1:
dailyLoad *= 1.1

(CNS fatigue multiplier)

---

## 3️⃣ Strain Formula (WHOOP-style scaling)

strain = 21 * (1 - e^(-dailyLoad / 1000))

Clamp between 0–21.

This ensures diminishing returns and realistic strain ceilings.

---

# 📊 LOAD MONITORING

## Acute Load (7 Days)

acuteLoad = sum(last 7 dailyLoads)

## Chronic Load (28 Days)

chronicLoad = average(last 28 dailyLoads)

## Load Ratio

loadRatio = acuteLoad / (chronicLoad + 1)

---

# 🚨 OVERTRAINING RISK ENGINE

Create:

overtrainingScore (0–100)

Start at 0.

Add:

If loadRatio > 1.3 → +25  
If loadRatio > 1.5 → +40  
If Avg RPE (7d) > 8 → +15  
If Avg Soreness (7d) > 7 → +20  
If 3+ consecutive strain days >15 → +20  
If 5+ sessions in 7 days → +15  

Clamp 0–100.

Risk Zones:

0–30 → Low  
31–60 → Moderate  
61–80 → High  
81–100 → Critical  

This drives:
• Overtraining ring color  
• AI tone  
• UI state  

---

# 🛌 REST DAY LOGIC

When user logs REST DAY:

Ask:

- Soreness (1–10)
- Fatigue (1–10)
- Sleep quality (Good / Poor)
- Mobility work done? (Yes / No)

Then:

dailyLoad = 0  
acuteLoad *= 0.95  

If:
Soreness <= 4 AND Sleep good

Reduce overtrainingScore by 15%

Else:
Reduce by 5%

This prevents unrealistic instant recovery.

---

# 🤖 LLM COACH LAYER

## Persona Context (IMPORTANT)

LLM must behave as:

A high-level recovery specialist and performance coach, similar to a WHOOP performance analyst.

Tone:
- Calm
- Professional
- Conservative
- Evidence-informed
- Never dramatic
- No medical diagnosis
- No extreme advice

---

## LLM Input

{
  strain,
  acuteLoad,
  chronicLoad,
  loadRatio,
  overtrainingScore,
  avgRPE7d,
  avgSoreness7d,
  sessionsLast7d
}

---

## LLM Output Format

{
  "readiness_state": "push | maintain | reduce | recover",
  "coaching_summary": "Short performance explanation",
  "next_session_advice": "Clear actionable recommendation",
  "recovery_focus": ["sleep", "hydration", "mobility"],
  "risk_level": "low | moderate | high | critical"
}

LLM CANNOT override:
- strain
- overtrainingScore
- loadRatio

It only interprets.

---

# 📈 DATA VISUALIZATION

## 1️⃣ 7-Day Strain Line Chart

X-axis:
- Last 7 days

Y-axis:
- 0–21 strain

Design:
- Smooth curved line
- Subtle dot markers
- Highlight current day
- Minimal gridlines
- Theme adaptive

---

## 2️⃣ Forecasted Recovery

Prediction model:

If tomorrow rest:
predictedLoad = 0

Else:
predictedLoad = avg(last 3 dailyLoads)

Recalculate projected:
- strain
- loadRatio
- overtrainingScore

Display:
- Dotted projection line
- “Projected” label
- Slightly faded styling

---

# 🎨 UI REQUIREMENTS (MAX PRO UI SKILL)

Frontend exists.

You must:

Refine UI to feel seamless like WHOOP.

Use existing app-wide theme:

Glass translucent purple system.

Dark mode:
- Deep black background
- Purple glass blur overlays
- Soft inner glow accents

Light mode:
- Frosted white glass
- Subtle purple tint
- Light shadows

---

## WHOOP-Style Components Required

1️⃣ Primary Strain Ring  
- Large circular ring  
- Thin stroke  
- Animated fill  
- Center value large typography  
- Minimal labels  

2️⃣ Overtraining Ring  
- Smaller secondary ring  
- Subtle placement  
- Color-coded risk  

3️⃣ Recovery State Card  
- Glass card  
- Rounded 24px corners  
- Soft blur  
- Purple gradient edge glow  

4️⃣ Coaching Summary Section  
- Clean typography  
- No clutter  
- Generous spacing  

---

# ⚙ ENGINEERING RULES

- Deterministic engine separate from AI  
- Memoize rolling calculations  
- Cache AI response per day  
- Only call LLM:
   - End of day  
   - Rest day logged  
   - Manual “Analyze” tap  

- Add unit tests:
   - Multi-session logic  
   - Consecutive strain spikes  
   - Rest day recovery  
   - Edge cases (new users)  

---

# 🔒 SAFETY + ACCURACY

1. LLM cannot invent strain.  
2. All math logged to console in dev.  
3. Use realistic diminishing curves.  
4. Never suggest extreme overtraining warnings.  

---

# 🏁 FINAL EXPERIENCE GOAL

User opens Calendar page.

They see:

• Today’s Strain Ring  
• Overtraining Ring  
• Recovery State  
• AI Coaching Summary  
• 7-Day Strain Trend  
• Projected Tomorrow Recovery  

It should feel:

WHOOP-level.  
Elite.  
Combat-specific.  
Scientifically grounded.  
Seamless with the app’s purple glass system.

END OF IMPLEMENTATION FILE.