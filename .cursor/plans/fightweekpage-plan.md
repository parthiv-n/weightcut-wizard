# Fight Week Page — Complete Redesign Implementation Plan

## IMPORTANT CONTEXT FOR CLAUDE

The current Fight Week page (`src/pages/FightWeek.tsx`) exists and works, but needs a fundamental redesign. The edge function (`supabase/functions/fight-week-analysis/index.ts`) also exists.

You are:
- Rebuilding the Fight Week page UI to be research-driven and timeline-focused
- Updating the edge function to consume research papers for evidence-based advice
- Removing daily weight logging (no longer needed)
- Adding deterministic weight-loss projection engine (non-AI)
- Adding new UI components: timeline, projected weight chart, safety rings
- Maintaining app-wide design system (glass translucent purple theme)

DO NOT redesign navigation.
DO NOT remove existing architecture outside of FightWeek.
Enhance and replace within the fight-week scope only.

---

# SYSTEM OBJECTIVE

Redesign the Fight Week page so that:

1. User inputs ONLY: current weight, weigh-in weight, days until weigh-in
2. A deterministic engine calculates weight-loss breakdown via:
   - Carb reduction (glycogen + bound water)
   - Fibre reduction (gut contents)
   - Sodium manipulation (extracellular water)
   - Water loading protocol
   - Dehydration methods (sauna/bath) — only if diet manipulation is insufficient
3. AI generates a day-by-day protocol timeline using research papers as context
4. Safety is visualized with green/orange/red rings for dehydration risk
5. A projected weight-loss chart shows the entire timeline
6. No daily weight logging — the page is a planning/projection tool, not a tracker

---

# RESEARCH PAPER SOURCES

All research files live in `src/assets/research/`. The edge function MUST be fed the content of these files (or key extracted data) as context for LLM advice generation.

| File | Citation | Key Use |
|---|---|---|
| `refuel-research/refuel1.md` | Reale et al. (2017) — Acute Weight-Loss Strategies | Glycogen:water ratio 1:2.7, fibre reduction protocols, dehydration thresholds |
| `weightcut-papers/weightcut1.md` | ISSN 2025 Position Stand — Ricci et al. | 16-point position stand: safe AWL by timeline, water loading protocol, sodium manipulation, sauna data |
| `weightcut-papers/weightcut2.md` | Martínez-Aranda et al. (2023) — Systematic Review | 3–5% BW safe threshold, 24h recovery minimum |
| `weightcut-papers/weightcut3.md` | ACSM Expert Consensus — Burke et al. (2021) | Post weigh-in recovery, weight category sport guidelines |
| `reale_sse_183.md` | Reale (2018) — Gatorade SSE #183 | Practical AWL magnitudes, gut content timing, rehydration protocol |

---

# DETERMINISTIC WEIGHT-LOSS PROJECTION ENGINE

Create: `src/utils/fightWeekEngine.ts`

This engine is NON-AI. All calculations are deterministic based on research values.

---

## Inputs

```typescript
interface FightWeekInput {
  currentWeight: number;     // kg
  targetWeight: number;      // kg (weigh-in weight)
  daysUntilWeighIn: number;  // integer, 1-14
  sex: 'male' | 'female';
  bodyweightKg: number;      // same as currentWeight for now
}
```

## Weight-Loss Components (calculated deterministically)

### 1. Glycogen + Bound Water Depletion

**Source:** ISSN 2025 Section 5.4.1, Reale et al. 2017, SSE #183

- Skeletal muscle glycogen: 350–700g (use 500g as midpoint)
- Liver glycogen: 80–100g (use 90g)
- Total glycogen stores: ~590g
- Glycogen:water binding ratio: **1g glycogen = 2.7g water** (Bergström & Hultman 1972)
- Total depletable: 590g × 3.7 (glycogen + water) = **~2.18 kg**
- Protocol: <50g carbs/day for 3–7 days
- Onset: begins Day 1, significant by Day 3
- Realistic estimate: **1.5–2.5 kg** (conservative: 1.8 kg)
- Timeline: Minimum 3 days, optimal 5–7 days

```typescript
function glycogenDepletion(bodyweightKg: number): { minKg: number; maxKg: number; estimateKg: number } {
  // Research: ~1–2% of BM via glycogen depletion
  const estimate = Math.min(bodyweightKg * 0.02, 2.5); // cap at 2.5kg
  return { minKg: bodyweightKg * 0.01, maxKg: 2.5, estimateKg: estimate };
}
```

### 2. Fibre Reduction (Gut Contents)

**Source:** ISSN 2025 Section 5.4.2, SSE #183

- Low-fibre diet: **<10g fibre/day** (down from habitual >30g)
- 4 days minimum for significant effect
- 7 days = maximum effect (equivalent to bowel preparation)
- BM loss: **0.5–1.5% of BM** (reported range: 0.4–1.5%)
- Gut transit time: 10–96 hours (highly individual)
- Realistic estimate: **0.5–1.0 kg**
- Timeline: Start 4–7 days before weigh-in

```typescript
function fibreReduction(bodyweightKg: number, daysAvailable: number): { estimateKg: number } {
  if (daysAvailable < 2) return { estimateKg: 0 };
  if (daysAvailable < 4) return { estimateKg: bodyweightKg * 0.004 }; // ~0.4% BM
  if (daysAvailable < 7) return { estimateKg: bodyweightKg * 0.007 }; // ~0.7% BM
  return { estimateKg: Math.min(bodyweightKg * 0.01, 1.0) }; // cap at 1kg
}
```

### 3. Sodium Manipulation

**Source:** ISSN 2025 Section 5.4.3, Reale et al. 2017

- Reduce sodium to **<2300mg/day** (current RDA)
- Hypertensive subjects lost 1–2% BM over 5 days with <500mg/day
- For combat athletes: more conservative — expect **0.5–1.0 kg**
- Balance takes 2–3 days to shift after sodium change
- Timeline: Start 3–5 days before weigh-in
- WARNING: Do not go below 2300mg/day if sweating heavily

```typescript
function sodiumManipulation(bodyweightKg: number, daysAvailable: number): { estimateKg: number } {
  if (daysAvailable < 3) return { estimateKg: 0 };
  if (daysAvailable < 5) return { estimateKg: bodyweightKg * 0.005 }; // ~0.5% BM
  return { estimateKg: Math.min(bodyweightKg * 0.01, 1.0) }; // ~1% BM, cap 1kg
}
```

### 4. Water Loading Protocol

**Source:** ISSN 2025 Section 5.4.4

- Protocol: **100 mL/kg/day for 3 days**, then restrict to **15 mL/kg/day on day 4**
- Result: 3.2% BM loss (water-loading group) vs 2.4% (control)
- Extra capacity beyond normal fluid restriction: **~0.8–1.5 kg**
- Only applies if ≥4 days available
- Prevalence: 72.9% of MMA athletes use water loading

```typescript
function waterLoadingBenefit(bodyweightKg: number, daysAvailable: number): { estimateKg: number; dailyIntakeMl: number[] } {
  if (daysAvailable < 4) return { estimateKg: 0, dailyIntakeMl: [] };
  const loadingDays = Math.min(3, daysAvailable - 1);
  const loadMl = bodyweightKg * 100; // 100ml/kg/day
  const restrictMl = bodyweightKg * 15; // 15ml/kg/day
  const dailyIntakeMl: number[] = [];
  for (let i = 0; i < daysAvailable; i++) {
    if (i < loadingDays) dailyIntakeMl.push(loadMl);
    else if (i === loadingDays) dailyIntakeMl.push(restrictMl);
    else dailyIntakeMl.push(restrictMl);
  }
  return { estimateKg: bodyweightKg * 0.01, dailyIntakeMl }; // ~1% BM extra
}
```

### 5. Dehydration (Sauna/Bath) — ONLY IF NEEDED

**Source:** ISSN 2025 Section 5.4.5, SSE #183

This is the LAST RESORT. Only calculate if diet manipulation + water loading cannot achieve the target weight.

**Safe dehydration thresholds (relative to bodyweight):**
- **GREEN (Safe): ≤2% BM** — minimal performance impact, easily recoverable
- **ORANGE (Moderate): 2–4% BM** — manageable with ≥12h recovery, needs aggressive rehydration
- **RED (Dangerous): >4% BM** — significant performance decrement, 6%+ may NOT fully recover even with 15h

**Methods and expected loss:**
- Dry sauna (4×10min at ~90°C): **0.5–0.9% BM per session** (men ~0.72kg, women ~0.37kg dry sauna)
- Hot bath (39–39.5°C, 2×20min) + wrap (40min): **4.5% BM** (aggressive protocol)
- Fluid restriction (<300mL/24h): **1.5–2% BM**

**Safety rings for dehydration amount:**
```typescript
function getDehydrationSafety(dehydrationKg: number, bodyweightKg: number): 'green' | 'orange' | 'red' {
  const percent = (dehydrationKg / bodyweightKg) * 100;
  if (percent <= 2) return 'green';
  if (percent <= 4) return 'orange';
  return 'red';
}
```

### 6. Total Safe Cut Calculation

**Source:** ISSN 2025 Section 5.4.7

Safe AWL by timeline (from UFC fighter data + research):
- **72h+ before weigh-in:** Up to 6.7% BM (max safe with all methods)
- **48h before:** Up to 5.7% BM
- **24h before:** Up to 4.4% BM
- **<12h before:** Up to 3% BM (diet manipulation only, no dehydration)

```typescript
function maxSafeCut(bodyweightKg: number, daysAvailable: number): number {
  if (daysAvailable >= 3) return bodyweightKg * 0.067;  // 6.7%
  if (daysAvailable >= 2) return bodyweightKg * 0.057;  // 5.7%
  if (daysAvailable >= 1) return bodyweightKg * 0.044;  // 4.4%
  return bodyweightKg * 0.03; // 3%
}
```

### Master Projection Function

```typescript
interface WeightCutProjection {
  totalToCut: number;
  glycogenLoss: number;
  fibreLoss: number;
  sodiumLoss: number;
  waterLoadingLoss: number;
  dietManipulationTotal: number;  // sum of above 4
  dehydrationNeeded: number;      // totalToCut - dietManipulationTotal (if positive)
  dehydrationSafety: 'green' | 'orange' | 'red';
  overallSafety: 'green' | 'orange' | 'red';
  isAchievable: boolean;
  maxSafeCut: number;
  dailyProjection: DayProjection[];  // day-by-day weight projection
}

interface DayProjection {
  day: number;           // 1 = first day, N = weigh-in day
  label: string;         // "Day 1", "Day 2", ... "Weigh-In"
  projectedWeight: number;
  carbsGrams: number;    // target carb intake
  waterMl: number;       // target water intake
  fibreGrams: number;    // target fibre intake
  sodiumMg: number;      // target sodium intake
  activities: string[];  // e.g. ["Start low-carb", "Begin water loading"]
}
```

The engine builds the `dailyProjection` array by distributing weight loss across the timeline:

- Days 1–3 (if available): Glycogen depletion + fibre reduction begin
- Days 3–5: Sodium manipulation kicks in, water loading starts
- Day N-1: Water restriction day (15ml/kg)
- Day N (weigh-in day): If dehydration needed, sauna/bath protocol

Carb taper schedule (based on research):
- Normal camp: profile's `ai_recommended_carbs_g` or 4g/kg/day
- Fight week day 1: 2g/kg/day
- Fight week day 2–3: 1g/kg/day
- Fight week day 4+: <50g/day (full depletion)

Water taper (if water loading, based on ISSN protocol):
- Days 1–3: 100ml/kg/day
- Day 4 (restriction): 15ml/kg/day
- Day 5 (weigh-in): minimal sips only

Fibre taper:
- Normal: >30g/day
- Fight week start: 15g/day
- Day 3+: <10g/day
- Day N-1: <5g/day

Sodium taper:
- Normal: ~3000–4000mg/day
- Fight week day 1: 2500mg/day
- Day 3+: <2300mg/day
- Day N-1: <1500mg/day (if extra water loss needed)

---

# LLM COACH LAYER

## Edge Function Update: `supabase/functions/fight-week-analysis/index.ts`

### Research Paper Context

The edge function system prompt MUST include the key findings from the research papers. Since sending full paper text would exceed token limits, extract and embed the critical data points as structured knowledge in the system prompt.

The system prompt should contain:

```
RESEARCH-BACKED WEIGHT CUT KNOWLEDGE BASE:

Source: ISSN 2025 Position Stand (Ricci et al.)
- Glycogen stores: 350-700g muscle + 80-100g liver
- Glycogen:water ratio = 1:2.7
- <50g carbs/day for 3-7 days = ~2% BM loss (maintains strength/power)
- Low-fibre (<10g/day) for 4 days = 0.4-0.7% BM loss; 7 days = up to 1% BM
- Sodium <2300mg/day = 0.5-1% BM loss over 3-5 days
- Water loading: 100ml/kg/day × 3 days, then 15ml/kg/day = 3.2% BM loss
- Safe AWL by timeline: 6.7% at 72h, 5.7% at 48h, 4.4% at 24h
- Dry sauna: 0.5-0.9% BM per session (4×10min at 90°C)
- Hot bath + wrap: up to 4.5% BM (aggressive protocol)
- Safe dehydration: ≤2% BM (green), 2-4% (orange), >4% (red)

Source: Reale et al. (2017) — Acute Weight-Loss Strategies
- Dehydration of 2.8% BM is reversible after 3h aggressive recovery
- Dehydration of 6% BM NOT fully reversed even after 15h
- Low-residue diet for 7 days = equivalent to bowel preparation formula
- Gut transit time: 10-96 hours (individual variation)
- Respiratory water loss: 400-1500 mL/day depending on activity/humidity

Source: Reale (2018) — Gatorade SSE #183
- Safe AWL: ≤5% BM for same-day weigh-in, ≤8% with ≥12h recovery
- <50g carbs/day for 3-7 days is general recommendation
- Fluid restriction (<300mL/24h) = 1.5-2% BM loss
- Post weigh-in: replace 125-150% of fluid deficit
- ORS sodium: 50-90 mmol/L for >3% dehydration

Source: Martínez-Aranda et al. (2023) — Systematic Review
- AWL ≤5% BM did NOT affect performance in 6 studies
- AWL 3-6%+ showed negative effects on fatigue, mood, strength, hormones
- Weight loss should not exceed 3-5% BW with ≥24h recovery
```

### LLM Input

```json
{
  "currentWeight": 77.0,
  "targetWeight": 70.3,
  "daysUntilWeighIn": 7,
  "sex": "male",
  "age": 28,
  "projection": {
    "totalToCut": 6.7,
    "glycogenLoss": 1.5,
    "fibreLoss": 0.7,
    "sodiumLoss": 0.7,
    "waterLoadingLoss": 0.8,
    "dietManipulationTotal": 3.7,
    "dehydrationNeeded": 3.0,
    "dehydrationSafety": "orange",
    "dailyProjection": [...]
  }
}
```

### LLM Output Format

```json
{
  "overall_assessment": "Brief 1-2 sentence assessment of the cut",
  "risk_level": "green | orange | red",
  "daily_protocol": [
    {
      "day": 1,
      "label": "7 Days Out",
      "focus": "Begin glycogen depletion",
      "carbs_advice": "Reduce to 2g/kg (~154g). Focus on protein and fats.",
      "water_advice": "Begin water loading: 7.7L throughout the day",
      "fibre_advice": "Reduce to 15g. Switch to white rice, white bread.",
      "sodium_advice": "Keep at normal levels (~3000mg)",
      "training_advice": "Normal training. LISS cardio 30-45min at 40-50% HR",
      "notes": "Optional additional context"
    },
    ...
  ],
  "dehydration_protocol": {
    "needed": true,
    "amount_kg": 3.0,
    "safety": "orange",
    "method": "Combination of fluid restriction and dry sauna",
    "timing": "Start 24h before weigh-in",
    "sauna_sessions": "4 × 10min at 90°C with 5min cool-down between",
    "fluid_restriction": "<300mL in final 24h",
    "warnings": ["Monitor for dizziness", "Have electrolytes ready post weigh-in"]
  },
  "post_weighin_recovery": {
    "immediate_fluid": "600-900mL ORS (50-90 mmol/L sodium)",
    "ongoing_fluid": "240-350mL every 30min",
    "carbs": "8-12 g/kg over recovery period",
    "avoid": ["High fibre", "High fat", "Excessive caffeine"],
    "target_regain": "Aim to regain 7-10% BM before competition"
  }
}
```

LLM CANNOT override the deterministic projection values. It interprets and adds protocol detail.

---

# UI REQUIREMENTS

## Page Layout (Top to Bottom)

### 1. Input Section (Plan Creation)

When no plan exists, show a clean form:

- **Current Weight** (kg) — pre-filled from profile
- **Weigh-In Weight** (kg) — pre-filled from profile's `goal_weight_kg`
- **Days Until Weigh-In** — number input (1-14)

That's it. Three inputs. "Generate Protocol" button.

No fight date field. No daily log fields. Simplified.

### 2. Weight Cut Summary Header

Once generated, show at top:

- **Total to Cut** — large number with kg unit
- **% Bodyweight** — with color coding (green ≤5%, orange 5-8%, red >8%)
- **Days Remaining** — countdown
- Overall safety badge

### 3. Weight-Loss Breakdown Visualization

Stacked horizontal bar or segmented ring showing:

| Component | Color | Estimated Loss |
|---|---|---|
| Glycogen + Water | Blue | ~1.8 kg |
| Fibre/Gut | Green | ~0.7 kg |
| Sodium/Water | Cyan | ~0.7 kg |
| Water Loading | Purple | ~0.8 kg |
| **Subtotal (Diet)** | — | **~4.0 kg** |
| Dehydration | Orange/Red | ~2.7 kg |
| **Total** | — | **~6.7 kg** |

### 4. Dehydration Safety Ring

A `RecoveryRing` (reuse existing component from `src/components/fightcamp/RecoveryRing.tsx`) showing:

- Value: dehydration amount as % of bodyweight
- Max: 6% (anything above is extreme danger)
- Color: green (≤2%), orange (2–4%), red (>4%)
- Center: "X.X%" with "Dehydration" label
- Sublabel: safety zone name

### 5. Projected Weight Chart

Recharts `AreaChart` or `LineChart` showing:

- X-axis: Day labels ("7 Days Out", "6 Days Out", ..., "Weigh-In")
- Y-axis: Weight in kg
- Solid line: projected weight day-by-day
- Horizontal dashed line: target weight
- Area fill below the line with gradient
- Current weight marker at start
- Target weight marker at end
- Color the line green→orange→red as it approaches target

### 6. Day-by-Day Timeline

Vertical timeline component (glass cards stacked vertically) showing each day:

Each day card contains:
- Day label: "7 Days Out — Tuesday, Feb 25"
- Focus headline: "Begin Glycogen Depletion"
- 4 metric pills:
  - Carbs: "154g" (with taper indicator ↓)
  - Water: "7.7L" (with indicator)
  - Fibre: "15g" (with taper indicator ↓)
  - Sodium: "3000mg"
- Training advice (if any)
- Special notes (if any)

The timeline should feel like a WHOOP-style protocol — clean, minimal, one card per day.

### 7. AI Coach Section

Glass card at the bottom with:
- Overall assessment text
- Dehydration protocol details (if needed)
- Post weigh-in recovery protocol
- Risk warnings

---

# WHAT TO REMOVE

1. **Daily weight logging UI** — remove the "Log Weight" section entirely
2. **Weight history list** — remove the reverse-sorted log list
3. **Weight history chart** — replace with projected weight chart
4. **Daily log deletion** — no longer needed
5. **`saveQuickWeight` function** — remove
6. **`handleDeleteLog` function** — remove
7. **`DeleteConfirmDialog` usage** — remove
8. **`fight_week_logs` fetching/display** — remove (table can stay in DB for legacy data)
9. **`isWaterloading` toggle** — water loading is now automatic based on timeline (≥4 days = auto-enable)

---

# WHAT TO KEEP / REUSE

1. **`fight_week_plans` table** — still used to store the plan
2. **Countdown timer** — keep the live countdown
3. **AI analysis caching** — keep `AIPersistence` pattern
4. **Edge function warmup** — add GET warmup pattern
5. **Glass card design system** — keep consistent with app
6. **`RecoveryRing` component** — reuse for dehydration safety ring
7. **Recharts** — reuse for projected weight chart
8. **Profile context** — use for pre-filling weights, sex, age

---

# ENGINEERING RULES

1. Deterministic engine (`fightWeekEngine.ts`) is separate from AI
2. Engine runs instantly on input — no API call needed for projections
3. AI is called ONCE after engine runs, to generate the protocol narrative
4. Cache AI response for 72 hours (existing pattern)
5. Add edge function GET warmup (2s after mount)
6. All research-derived constants should be clearly commented with source
7. Memoize engine calculations with `useMemo`
8. The engine should export pure functions for potential unit testing

---

# SAFETY RULES

1. If total cut exceeds 8% BM, show PROMINENT red warning with health risks
2. If dehydration exceeds 4% BM, show red ring + explicit warning
3. Never recommend dehydration without mentioning rehydration protocol
4. Always show post weigh-in recovery section
5. Include disclaimer: "This is not medical advice. Consult a professional."
6. All thresholds are research-backed — cite the source in comments

---

# FILE CHANGES SUMMARY

| Action | File |
|---|---|
| CREATE | `src/utils/fightWeekEngine.ts` |
| CREATE | `src/components/fightweek/WeightBreakdownBar.tsx` |
| CREATE | `src/components/fightweek/DayTimeline.tsx` |
| CREATE | `src/components/fightweek/ProjectedWeightChart.tsx` |
| REWRITE | `src/pages/FightWeek.tsx` |
| REWRITE | `supabase/functions/fight-week-analysis/index.ts` |
| OPTIONAL | `src/utils/fightWeekEngine.test.ts` (Vitest unit tests) |

---

# FINAL EXPERIENCE GOAL

User opens Fight Week page.

They enter:
- Current weight: 77.0 kg
- Weigh-in weight: 70.3 kg
- Days until weigh-in: 7

They see:

1. Summary: "6.7 kg to cut (8.7% BW) — CAUTION"
2. Breakdown bar: Glycogen 1.8kg + Fibre 0.7kg + Sodium 0.7kg + Water Loading 0.8kg = 4.0kg diet, 2.7kg dehydration
3. Dehydration ring: 3.5% BW — ORANGE
4. Projected weight chart: smooth curve from 77.0 → 70.3 over 7 days
5. Day-by-day protocol timeline with exact carb/water/fibre/sodium targets
6. AI coaching with dehydration protocol + post weigh-in recovery plan

It should feel:
- Scientific and evidence-based
- Clean and minimal (WHOOP-level polish)
- Safe and conservative
- Actionable — the fighter knows EXACTLY what to do each day
- Seamless with the app's glass design system

END OF IMPLEMENTATION FILE.
