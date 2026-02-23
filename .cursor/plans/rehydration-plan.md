# Rehydration Page — Improvement Plan

## Overview
Redesign and enhance the post-weigh-in rehydration page (`src/pages/Hydration.tsx`) and its backing edge function (`supabase/functions/rehydration-protocol/index.ts`) to deliver a comprehensive, research-grounded, personalised rehydration & refuelling protocol. The output should communicate clearly, educate the athlete, and prioritise safety.

---

## 1. Edge Function — Prompt & Calculation Improvements

### 1.1 Send Full User Profile to Edge Function
Currently only `weightLostKg`, `weighInTiming`, and `currentWeightKg` are sent. Expand to include the full profile so the LLM can personalise output:

| Field | Purpose |
|---|---|
| `current_weight_kg` | Base for all g/kg calculations |
| `goal_weight_kg` / `fight_week_target_kg` | Context on weight-class gap |
| `sex` | Female athletes produce less sweat; electrolyte needs differ |
| `age` | Younger athletes tolerate aggressive protocols better |
| `height_cm` | Body surface area affects sweat rate estimations |
| `activity_level` / `training_frequency` | Habitual sweat losses context |
| `tdee` / `bmr` | Energy expenditure baseline for carb-loading targets |

**File:** `src/pages/Hydration.tsx` — update the `supabase.functions.invoke` body.
**File:** `supabase/functions/rehydration-protocol/index.ts` — destructure new fields, inject into prompt.

### 1.2 Deterministic Calculations (Not LLM-Generated)
Move critical numbers out of the LLM and compute them server-side before prompt assembly. The LLM should use these as constraints, not invent them:

```
Total Fluid Target = weightLostKg * 1.5 (i.e. 150% of losses)
  — Source: Shirreffs & Maughan 1998; Reale SSE #183 Table 1

Max Hourly Fluid = min(1000, totalFluid / availableHours)
  — Source: Gastric emptying ~800-1000ml/h max

Available Hours:
  same-day   → 4–6 h (use 5)
  day-before → 12–24 h (use 16)

Total Litres = totalFluidTarget / 1000 (display as "X.X L")

Carb Target (g):
  If glycogen was depleted (fight-week carb restriction):
    8–12 g/kg BM  (ISSN 2025 Position Stand, point 14)
  If modest carb restriction:
    4–7 g/kg BM
  Default/safe recommendation: 6–8 g/kg BM
  — Source: Reale SSE #183: 5-10 g/kg; ISSN 2025: 8-12 g/kg for significant depletion

Carb Delivery Rate = ≤ 60 g/h
  — Source: ISSN 2025, point 13

Sodium per litre rehydration fluid:
  50–90 mmol/L = ~1150–2070 mg Na per litre
  Per 500ml = ~575–1035 mg Na
  — Source: ISSN 2025 point 12; Reale SSE #183 Table 1

Potassium:
  ~120 mg per 500ml (existing protocol — retain)

Magnesium:
  ~24 mg per 500ml (existing protocol — retain)
```

**Implementation:** Compute these in the edge function before calling the LLM. Inject as `CALCULATED_TARGETS` into the system prompt so the LLM structures its protocol around them but does not deviate from the numbers.

### 1.3 Updated System Prompt Structure
The prompt should instruct the LLM to:
1. Use the pre-calculated targets as hard constraints
2. Reference specific research papers by name in its rationale
3. Generate a phased timeline with electrolyte concentrations per drink
4. Suggest specific foods/drinks from the research papers (white rice, bananas, honey, rice cakes, sports drinks, ORS, sweetened milk, white bread, chicken breast, sports gels/chews)
5. Include caffeine guidance: 3-6 mg/kg, 60 min pre-competition (Reale SSE #183)
6. Include carb mouth-rinse strategy for GI-sensitive athletes (Burke & Maughan 2015)

### 1.4 Updated Output JSON Schema

```json
{
  "disclaimer": "string — not medical advice notice",
  "summary": "string — brief protocol overview",

  "totals": {
    "totalFluidLitres": 4.5,
    "totalSodiumMg": 4600,
    "totalPotassiumMg": 1200,
    "totalMagnesiumMg": 240,
    "totalCarbsG": 520,
    "carbTargetPerKg": "6-8",
    "rehydrationWindowHours": 5,
    "bodyWeightKg": 70
  },

  "hourlyProtocol": [
    {
      "hour": 1,
      "timeLabel": "Hour 1 (Post Weigh-In)",
      "phase": "Rapid Rehydration",
      "fluidML": 900,
      "sodiumMg": 1035,
      "potassiumMg": 240,
      "magnesiumMg": 48,
      "carbsG": 0,
      "drinkRecipe": "ORS: 900ml water + 1/2 tsp salt + electrolyte packet",
      "notes": "Large bolus to maximize gastric emptying rate. No solid food yet.",
      "foods": []
    }
  ],

  "carbRefuelPlan": {
    "targetCarbsG": 520,
    "maxCarbsPerHour": 60,
    "strategy": "string — overall carb strategy description",
    "meals": [
      {
        "timing": "Hour 2",
        "carbsG": 60,
        "foods": ["2 bananas", "500ml sports drink"],
        "rationale": "Begin glycogen restoration with easily digestible high-GI sources"
      }
    ],
    "suggestedFoods": [
      { "name": "White rice (200g cooked)", "carbsG": 56, "notes": "Low fiber, fast digesting" },
      { "name": "Banana", "carbsG": 27, "notes": "Potassium-rich, gentle on gut" },
      { "name": "Honey (1 tbsp)", "carbsG": 17, "notes": "Rapid glucose source" },
      { "name": "White bread (2 slices)", "carbsG": 26, "notes": "Low residue" },
      { "name": "Rice cakes (2)", "carbsG": 14, "notes": "Light, easy to eat" },
      { "name": "Sports drink (500ml)", "carbsG": 30, "notes": "Dual hydration + carbs" },
      { "name": "Sweetened milk (500ml)", "carbsG": 24, "notes": "Protein + carbs (Reale SSE#183)" }
    ],
    "suggestedDrinks": [
      { "name": "ORS (Oral Rehydration Solution)", "usage": "Hours 1-2, priority rehydration" },
      { "name": "Sports drink (Gatorade/Powerade)", "usage": "Hours 2+, moderate Na + carbs" },
      { "name": "Diluted fruit juice + salt", "usage": "Alternative carb + electrolyte source" },
      { "name": "Sweetened milk", "usage": "Hour 3+, protein + carb + fluid" }
    ]
  },

  "warnings": ["string[]"],

  "education": {
    "howItWorks": [
      {
        "title": "Gastric Emptying",
        "content": "Your stomach can process ~800-1000ml/h. Exceeding this causes bloating and slows absorption."
      },
      {
        "title": "Sodium-Glucose Co-Transport (SGLT1)",
        "content": "Sodium activates the SGLT1 transporter in the gut, pulling water into cells 2-3x faster than plain water."
      },
      {
        "title": "Glycogen-Water Binding",
        "content": "1g of glycogen stored binds ~2.7g of water. Carb-loading after weigh-in restores energy AND accelerates rehydration."
      },
      {
        "title": "150% Fluid Replacement Rule",
        "content": "You must drink 150% of weight lost to account for continued urine losses during rehydration."
      },
      {
        "title": "Phased Recovery",
        "content": "Hours 1-2 focus on rapid cellular rehydration with high sodium. Hours 3+ shift to glycogen restoration with carbs."
      }
    ],
    "whyElectrolytesMatter": "...",
    "caffeineGuidance": "3-6 mg/kg consumed 60 min pre-competition. Mild-moderate doses improve reaction time and reduce perceived effort. Avoid overconsumption — causes anxiety and tremor.",
    "carbMouthRinse": "If GI distress prevents eating, rinsing mouth for ~10s with a sports drink may enhance performance by activating central nervous system drive (Burke & Maughan 2015)."
  }
}
```

---

## 2. UI Improvements — `Hydration.tsx`

### 2.1 Disclaimer Banner (Top of Page)
Add a prominent but non-intrusive disclaimer at the very top, above all content:

```
⚠️ This protocol is an educational guideline based on sports science research.
It is NOT medical advice. Always consult a qualified sports dietitian or physician
before implementing any rehydration protocol, especially after significant weight cuts.
Individual responses vary. Stop and seek medical attention if you experience
dizziness, confusion, nausea, or chest pain.
```

**Design:** Rounded card, `bg-muted/50 border border-border/50`, small text (`text-[11px]`), with a subtle `Info` icon. Always visible (not collapsible).

### 2.2 Add User Profile Context to Input Form
Add a small read-only profile summary strip below the existing inputs showing the profile data being used:

```
[Avatar] Pratik · 75kg · Male · 25y
```

This reassures the user the protocol is personalised. If profile is incomplete, show a warning prompting them to fill in their profile first.

### 2.3 Totals Dashboard — New Section (After Summary)
After the protocol is generated, show a prominent "at a glance" totals dashboard BEFORE the hourly timeline:

```
┌─────────────────────────────────────────────┐
│         REHYDRATION TOTALS                  │
│                                             │
│  💧 4.5L        ⚡ 4,600mg Na               │
│  Total Fluid    Total Sodium                │
│                                             │
│  🍚 520g        ⏱️ 5 hours                  │
│  Total Carbs    Recovery Window             │
│                                             │
│  K: 1,200mg     Mg: 240mg                  │
│  Potassium      Magnesium                   │
└─────────────────────────────────────────────┘
```

**Design:** 2x3 grid of stat cells inside a `rounded-2xl bg-card border border-border/50` card. Large numbers with small labels. Color-coded: blue for fluid, amber for sodium, emerald for carbs, muted for K/Mg.

### 2.4 Hourly Timeline — Enhanced
Keep existing expandable hour-by-hour list but enhance each row:

- Show the **drink recipe** (e.g., "ORS: 500ml water + 1/4 tsp salt") in each expanded section
- Show the **phase label** (e.g., "Rapid Rehydration", "Glycogen Loading") as a small colored badge
- Show carbs per hour alongside fluid/electrolytes in the collapsed row
- Add a cumulative progress indicator showing % of total fluid consumed

### 2.5 Carbs Tab — Enhanced
- Show **target vs consumed** progress bar at top (e.g., "340g / 520g target")
- Show **max carbs per hour** guideline (≤60g/h) as a small info badge
- Each meal row: show food chips + rationale in expanded view (keep existing pattern)
- Add a new **"Suggested Foods"** section at the bottom — a scrollable grid of food cards showing name, carbs, and a one-line note. These come from the research papers.
- Add a **"Suggested Drinks"** section — similar grid for ORS, sports drinks, milk, etc.

### 2.6 Warnings Section — Promoted
Move warnings from inside the summary card to their own dedicated section. Show as a list of amber-bordered cards with `AlertTriangle` icons. Make them more prominent since they are safety-critical.

Add these research-backed warnings by default (in addition to LLM-generated ones):
- "Do not exceed 1L of fluid per hour — exceeding gastric emptying rate causes bloating and impairs absorption"
- "Avoid high-fiber and high-fat foods until after competition — they slow gastric emptying and nutrient absorption"
- "Monitor urine colour — aim for pale yellow. Clear urine may indicate over-hydration risk (hyponatremia)"
- "If you feel nauseous, dizzy, or confused, stop the protocol and seek medical attention immediately"
- "This protocol assumes weight was lost via dehydration. If weight was lost via other means, fluid targets may be excessive"

### 2.7 Education Section — Restructured
Replace the current hardcoded collapsible sections with data-driven sections from the LLM response:

1. **"How This Protocol Works"** — Collapsible, populated from `education.howItWorks[]`
2. **"Why Electrolytes Matter"** — Keep existing Na/K/Mg explanations (already good)
3. **"Caffeine Strategy"** — New collapsible section with pre-competition caffeine guidance
4. **"Carb Mouth Rinse"** — New collapsible for GI-sensitive athletes
5. **"Critical Reminders"** — Keep existing, merge with enhanced warnings

### 2.8 Input Form — Add Glycogen Depletion Toggle
Add a toggle/selector asking whether the athlete depleted glycogen during fight week:

```
Glycogen Depletion?
[None] [Moderate] [Significant]
```

This directly affects carb targets:
- None: 4-5 g/kg
- Moderate: 6-8 g/kg
- Significant: 8-12 g/kg (ISSN 2025)

Send this value to the edge function.

---

## 3. Research Citations & Formulas Reference

### Key Sources Used

| Citation | Key Data Points |
|---|---|
| **Reale et al. 2017** (refuel1.md) | 150% fluid replacement; glycogen:water 1:2.7; gut transit 10-96h; low-fiber ≤10g/d for 48h achieves ~1.5% BM loss; AWL ≤5% same-day, ≤8% day-before |
| **Reale SSE #183** (reale_sse_183.md) | ORS 50-90 mmol/L Na; 600-900ml bolus post weigh-in; 5-10 g/kg carbs; low-fiber low-fat recovery foods; caffeine 3-6mg/kg; carb mouth rinse; ≥1150mg Na per litre; 125-150% fluid replacement |
| **ISSN 2025 Position Stand** (weightcut1.md) | ORS 1-1.5L/h; Na 50-90 mmol/L; carbs ≤60g/h; post-weigh-in 8-12 g/kg for significant glycogen depletion, 4-7 g/kg for modest; regain ≥10% BM; fiber <10g/d |

### Core Formulas

```
1. TOTAL FLUID (litres)
   = weightLostKg × 1.5
   Sources: Shirreffs & Maughan 1998; Reale SSE #183

2. HOURLY FLUID RATE (ml/h)
   = min(1000, totalFluidML / availableHours)
   Source: Gastric emptying literature; Reale SSE #183

3. SODIUM TARGET
   Per litre: 50-90 mmol/L = 1150-2070 mg/L
   Per 500ml: 575-1035 mg
   Total: sodiumPerL × totalLitres
   Sources: ISSN 2025 point 12; Reale SSE #183

4. TOTAL CARBS (g)
   = currentWeightKg × carbMultiplier
   Where carbMultiplier:
     No glycogen depletion: 4-5
     Moderate depletion: 6-8
     Significant depletion: 8-12
   Sources: Reale SSE #183 (5-10); ISSN 2025 (4-7 / 8-12)

5. CARB DELIVERY RATE
   = ≤ 60 g/h
   Source: ISSN 2025 point 13

6. ELECTROLYTE INITIAL BOLUS
   = 600-900 ml ORS immediately post weigh-in
   Source: Reale SSE #183

7. RECOVERY WINDOW
   Same-day: 4-6 hours
   Day-before: 12-24 hours
   Sources: Reale 2017; ISSN 2025

8. CAFFEINE
   = 3-6 mg/kg, 60 min pre-competition
   Source: Reale SSE #183
```

---

## 4. Files to Modify

| File | Changes |
|---|---|
| `src/pages/Hydration.tsx` | Disclaimer banner, profile summary, totals dashboard, enhanced hourly/carbs tabs, glycogen toggle, warnings section, education sections, suggested foods/drinks |
| `supabase/functions/rehydration-protocol/index.ts` | Accept full profile, compute deterministic targets server-side, updated prompt with new JSON schema, research citations in prompt |
| `src/pages/Hydration.tsx` types | Update `RehydrationProtocol` interface to match new JSON schema |

---

## 5. Implementation Order

1. **Edge function** — Add deterministic calculations, accept full profile, update prompt & output schema
2. **Types** — Update `RehydrationProtocol` interface in Hydration.tsx
3. **Disclaimer** — Add medical advice disclaimer banner at top
4. **Input form** — Add glycogen depletion toggle, profile summary strip
5. **Totals dashboard** — New totals-at-a-glance section
6. **Hourly timeline** — Enhanced rows with drink recipes, phase badges, cumulative progress
7. **Carbs tab** — Progress bar, suggested foods grid, suggested drinks grid
8. **Warnings** — Promoted standalone section with research-backed defaults
9. **Education** — Data-driven collapsible sections from LLM response
10. **Testing** — Generate protocols for both same-day and day-before, verify calculations match research
