# WeightCut Wizard — AI Features & Combat-Athlete Tailoring Overhaul

**Date:** 2026-04-28
**Status:** Design — pending user approval
**Source:** Synthesis of 4 parallel audits (codebase prompt audit, UX/onboarding audit, combat-sports science research, prompt-engineering research). Citations preserved in companion notes.

---

## 0. Executive Summary

The app today has **18 LLM-calling edge functions**, all synchronous (no streaming despite older notes). The dominant problems:

1. **Prompts are not tailored to a fighter.** Sport, weight class, sanctioning body, weigh-in timing, fight phase, and recent training load are missing from most prompts.
2. **Token bloat.** `fight-week-analysis` (~1,950 tok), `fight-camp-coach` (~1,430 tok, dead code), `recovery-coach` (~3,500 tok), `weight-tracker-analysis` (~1,000 tok on an 8B model) are oversized for the work they do.
3. **Personas hurt accuracy.** Recent research (2025) shows "you are an elite coach"-style framing degrades factual output. Tone-driven features should keep one short tone clause; analytical features should drop the persona entirely.
4. **Onboarding is 14 screens then a paywall.** Schema drift between Onboarding and Goals (sleep_hours, food_budget, plan_aggressiveness). Combat-specific surfaces buried under "More". Fight-week & rehydration pages re-ask data already on the profile.
5. **No camp-phase state machine.** The app has no notion of where in the fight camp the user is — every decision is recomputed from `profile.target_date` minus today.

This spec covers four pillars:

| Pillar | What changes |
|---|---|
| **A. Universal prompt skeleton** | One `<role><style><rules><output>` system + `<athlete><context><task>` user template applied to all features. |
| **B. Per-feature prompt rewrites** | Each of 18 functions gets a redesigned, sport-aware, token-trimmed prompt. Two dead functions retired. |
| **C. Profile + camp model** | New typed fields (sport, sanctioning body, weigh-in window, walking weight, baseline hydration, sweat rate). `fight_camps.is_active` + `profile.current_fight_camp_id`. Camp-phase state machine. |
| **D. UX flow** | Onboarding cut from 14 → 7 screens, paywall moved off the first run, camp-phase-aware Dashboard, Fight Week and Rehydration pages no longer re-ask known data, BottomNav rebalanced for fighters. |

Implementation is staged across 5 work-items (§9) so each can ship independently.

---

## 1. Combat-Athlete Science Anchors (Top 20 Facts the AI Must Encode)

Every prompt that gives weight, hydration, or training advice MUST reason on these. A shared `_shared/scienceAnchors.ts` will hold them as constants and reference them from prompts.

1. **Cut depth is gated by recovery time, not preference.** ≤6h → cap 5% BM; ≥12h → cap 8% BM (Reale).
2. **Off-camp walking weight should stay within 12–15%** of contracted weight. Above → recommend changing class.
3. **Daily fight-week loss ≤1% BM**; stage across 5–7 days.
4. **Glycogen binds water ~1:3.** Carb depletion drops 1–2% BM as water — *first* tool, not last.
5. **Body water is manipulated last, restored first.**
6. **Post-weigh-in fluid: 1.0–1.5 L/h, 50–90 mmol/L Na ORS, 600–900 mL initial bolus.**
7. **Post-weigh-in carbs: 5–10 g/kg total**, capped ≤60 g/h initially.
8. **Goal: regain ≥10% of BM lost** before competition.
9. **Energy availability floors:** F <30 kcal/kg FFM/d, M <25 kcal/kg FFM/d = LEA red flag (IOC 2023).
10. **Macro floors during cut:** CHO ≥3–4 g/kg, P 1.2–2.2 g/kg (target ≈2), F ≥0.5–1.0 g/kg.
11. **Female athletes need cycle-aware coaching:** ↑ carbs/protein/fluid in luteal; high-intensity in follicular.
12. **Skipped/lighter cycles, low libido, frequent illness** = LEA flags requiring referral.
13. **Sport/org dictates everything:** ONE Championship hydration test → no water cut; NCAA wrestling 1h pre-bout → ≤3%; UFC 24–32h → up to 5–6%; same-day boxing/BJJ → ≤3%.
14. **Water loading is optional**, not mandatory (Reale 2018: no advantage in total loss vs restriction alone).
15. **Hard refusals:** diuretics, laxatives, vomiting, unsupervised >10% BM cuts, cuts >3% BM/24h.
16. **Track HRV (RMSSD), RHR, sleep duration/efficiency, body mass, sRPE, 5-item wellness.** Deload trigger: 2+ flags 3–5 days, or ACWR >1.5.
17. **Low-fiber diet (<10 g/d × 4 d)** clears 0.3–0.7 kg gut content with minimal performance cost.
18. **Hyponatremia is real risk** of plain-water rehydration. Sodium with every bolus.
19. **Tone: autonomy-supportive (rationale + choice), not controlling.** Daily micro check-ins beat weekly deep dives for adherence (SDT meta-analyses, Mossman et al.).
20. **Always ask three things before scaffolding any cut plan:** sanctioning body + weigh-in time vs bout time, current vs contracted weight, days-out.

---

## 2. Universal Prompt Skeleton

Every prompt is rebuilt to this structure.

### 2.1 System message (static per function)

```
<role>{ONE_LINE_JOB}</role>
<style>
- Lead with the answer. No preamble ("I'll help...", "Sure!", "Great question!").
- {N} short paragraphs, each ≤{W} words.
- Plain language. {OPTIONAL_TONE_CLAUSE}
</style>
<rules>
- Never recommend >3% BW/24h, diuretics, laxatives, induced vomiting, sauna >2h.
- If days_out <{X} and required_loss_rate >{Y}, set risk_level="red" and warn first.
- {FEATURE_HARD_RULES}
- If athlete data is missing or contradictory, say so in one short sentence.
</rules>
<output>
{FLAT_JSON_SCHEMA or "Plain text. End with one actionable sentence."}
</output>
```

Critical rule LAST (recency bias). No persona unless the feature is tone-driven (daily-wisdom, fight-camp motivation, recovery chat).

### 2.2 User message (dynamic per call)

```
<athlete>{COMPACT_JSON}</athlete>
<context>{FEATURE_DATA}</context>
<task>{ONE_SENTENCE_ASK}</task>
```

`<task>` is last (highest compliance).

### 2.3 The compact athlete JSON (built by `_shared/buildAthleteContext.ts`)

Each feature picks only the fields it needs. The full canonical shape:

```json
{
  "sport": "MMA",
  "sanctioning_body": "UFC",
  "weight_class_kg": 77.1,
  "weighin_to_bout_hours": 30,
  "sex": "M",
  "age": 27,
  "height_cm": 178,
  "walking_weight_kg": 84.0,
  "current_weight_kg": 78.4,
  "fight_week_target_kg": 78.0,
  "goal_weight_kg": 77.1,
  "fight_date": "2026-05-10",
  "days_out": 12,
  "camp_phase": "specific_prep",
  "tdee_kcal": 3100,
  "ffm_kg": 67.0,
  "experience": "pro",
  "menstrual_phase": "luteal",
  "recent_trend_kg_per_wk": -0.4
}
```

A per-feature selector (`getCutContext`, `getRehydrationContext`, etc.) returns the 6–12 fields the prompt needs. Never send the full 30-field profile.

### 2.4 Token budget targets

| Tier | System | User | Total input |
|---|---|---|---|
| Reasoning (`gpt-oss-120b`) | 150–300 | 100–300 | <600 |
| Fast (`llama-3.1-8b-instant`) | 100–200 | 50–200 | <400 |
| Vision (`llama-4-scout`) | <80 | image + 50 | <300 + image |

Non-streaming JSON for analytical features stays as-is; chat features (wizard-chat, recovery-coach) move to **server-sent streaming** (the memory was wrong about streaming existing — we'll build it now per Pillar D).

---

## 3. Per-Feature Prompt Rewrites

For each function: current size, the rewrite goal, and the new system prompt skeleton. Full prompt text will be in implementation PRs.

### 3.1 `daily-wisdom` (8B, every Dashboard load)

**Current:** ~145 tok, sport-blind, output overridden client-side anyway.

**New:**
- Drop fields the server overrides (`daysToFight`, `requiredWeeklyKg`, `weeklyPaceKg`, `paceStatus`).
- Add `camp_phase` so wisdom shifts: general_prep → calorie focus, specific_prep → load-management focus, fight_week → hydration/glycogen focus, weigh_in_day → rehydration cue, post_fight → recovery/refeed.
- Token target: ~120 tok system, ~80 tok user.

```
<role>Generate one daily insight + 3 actions for a combat athlete in {camp_phase}.</role>
<style>
- 1 short summary (≤10 words). 1 advice paragraph (≤2 sentences). 3 actions (≤8 words each).
- Reference real numbers from <athlete>.
- No preamble.
</style>
<rules>
- riskLevel="orange" if weekly_loss_required > 1.0 kg/wk, else "green".
- nutritionStatus must reflect today's calories vs goal.
- Never moralize ("you're cheating", "you failed").
</rules>
<output>{summary,riskLevel,riskReason,adviceParagraph,actionItems[3],nutritionStatus}</output>
```

### 3.2 `analyse-diet` (120B)

**Current:** ~440 tok, blind to sport, weight class, fight phase.

**New:**
- Inject `<athlete>` (sex, age, weight, sport, camp_phase, target_date, training_load_today).
- Add `<rules>`: micronutrient priorities differ by phase (e.g., iron and B12 emphasized in deficit; sodium guidance shifts in fight week).
- Drop "professional combat sports nutritionist" persona. Replace with one-line role.
- Token target: ~280 tok system.

### 3.3 `analyze-meal` (Vision Scout + 120B reasoning)

**Current:** vision ~365, reasoning ~380, text-only ~300. Blind to user plan.

**New:**
- Stage 1 (vision) unchanged structure; trim repeated "no preamble" lines (-30 tok).
- Stage 2 (reasoning) gets `<athlete>` block (target_protein, target_carbs, daily_remaining_kcal). Output adds:
  - `fits_plan: "yes"|"borderline"|"no"`
  - `swap_suggestion: "Replace X with Y to hit protein"` (1 short string, optional).
- Reasoning model: drop "step by step" if present; specify success criteria in `<task>`.

### 3.4 `weight-tracker-analysis` (8B → upgrade to 120B)

**Current:** ~1,000 tok system to an **8B model** with extremely structured output. Quality bottleneck.

**New:**
- **Switch to `gpt-oss-120b` with `reasoning_effort: low`.** Same cost class as fight-week-analysis. Output quality jump expected.
- Cut prompt to ~350 tok by:
  - Removing the verbose mealTiming/weeklyPlan/training instructions (server can post-format).
  - Splitting into TWO calls: (a) fast 8B narrative ("how it's going") + (b) one 120B analytical run on weekly check-in.
- Add `sport`, `weight_class_kg`, `weighin_to_bout_hours`, recent training load.
- Use `requiredWeeklyLoss > 1.5 → red` rule already there but compute server-side; model only writes the explanation.

### 3.5 `fight-week-analysis` (120B)

**Current:** ~1,950 tok. Includes inline EVIDENCE BASE that duplicates `_shared/researchSummary.ts`.

**New:**
- Move evidence to `_shared/scienceAnchors.ts` and import a 5-line condensed version (one line per anchor).
- Inject `<athlete>` with `sport`, `sanctioning_body`, `weighin_to_bout_hours` — these gate cut-depth thresholds the model uses.
- Inject recent 7d training load and Hooper score so taper aggressiveness adapts.
- Drop the duplicate "no em dashes" instruction (server already runs `stripDashes()`).
- Output: keep schema; remove server-overridden fields from the model's required output (totalCut math is validated/corrected).
- Target: ~700 tok system.

### 3.6 `generate-cut-plan` (120B, free at onboarding)

**Current:** ~1,300 tok including full RESEARCH_SUMMARY.

**New:**
- Replace research dump with 8-line "anchors" block (the 20 facts above, condensed).
- Add `sport`, `sanctioning_body`, `weight_class_kg`, `walking_weight_kg`.
- Use `walking_weight_kg` to detect "drift > 15% above contracted" → switch to a "you should consider moving up a class" output mode.
- Inject `dietary_restrictions` so weekly meal-idea hooks respect halal/veg/etc.
- Drop unused `activityLevel`/`trainingFrequency` destructuring or actually use them.
- Target: ~600 tok system.

### 3.7 `rehydration-protocol` (120B)

**Current:** ~250 tok, decent — but blind to sport/sanctioning body, doesn't pre-fill from profile.

**New:**
- Hydration page stops re-asking known data; profile + active camp + most recent weigh-in log fill the form by default. UI shows pre-filled with edit option.
- Prompt receives `sanctioning_body`, `bout_start_local_time`, `gi_history` (cramps/rhabdo flags), `prior_cuts_summary` ("3 prior cuts of 5%, 6%, 7%; cramped on cut 3").
- Output adds an `early_warning_signs` array (cramps onset, urine color flags) tailored to history.
- Target: ~280 tok system.

### 3.8 `meal-planner` (120B)

**Current:** ~440 tok with redundant VERIFICATION STEP block. Server already reconciles macros.

**New:**
- Remove server-redundant math nag. Server's deterministic reconciliation stays.
- Inject `dietary_restrictions[]`, `food_budget`, sport, training_window_today (so pre-/post-training meals land at the right time).
- Add a `swap_pool` so model produces 2-3 variants per meal slot for the user to choose (autonomy support).
- Drop the silent text-extraction fallback that hardcodes 300/400/500 kcal — fail loudly to retry instead.
- Target: ~330 tok system.

### 3.9 `recovery-coach` (8B → 120B with reasoning_effort: low)

**Current:** ~3,500 tok system loading full 138-line research markdown every chat turn. **Underpowered model + over-stuffed context.**

**New:**
- Move to `gpt-oss-120b` reasoning_effort: low. Roughly same per-token cost as 8B, dramatically better quality on the structured "suggested session" markdown block.
- Replace verbatim research markdown with a 12-line summary; load deeper sections only when topic-matched (rough keyword routing in code, not LLM).
- Add `weight_cut_state` (current vs fight_week_target, days_out) — recovery rules differ in deficit.
- Stream the response (per Pillar D): user sees first paragraph in <500ms.
- Target: ~600 tok system steady-state.

### 3.10 `wizard-chat` (8B → 120B with reasoning_effort: low)

**Current:** ~2,000–2,500 tok to an 8B model. Output quality complaint risk.

**New:**
- Same upgrade as recovery-coach: 120B reasoning_effort: low + stream.
- Trim the elaborate "tone rule" block (positive+negative examples) — keep one sentence.
- Replace the repeated `RESEARCH_SUMMARY` with anchors block.
- Use a RAG-lite slot for athlete data: instead of always shipping 30d weight + 7d nutrition + 7d training + 7d hydration + wellness + 4 camps + today's meals, the server picks the 2-3 slices the user message implies. Heuristic-routed (regex over the user msg), not LLM-routed.
- Target: ~800 tok system steady-state, dynamic slices average ~300 tok.

### 3.11 `training-summary` (8B)

**Current:** ~270 tok, no athlete metadata.

**New:**
- Add `experience` (white belt vs black belt drill flow differs), `sport`.
- Keep 8B; output is bounded JSON.
- Target: ~200 tok system.

### 3.12 `training-insights` (120B reasoning_effort: low)

**Current:** ~250 tok, premium-gated, no athlete profile.

**New:**
- Inject `experience`, `sport`, `current_camp_phase`, `weight_class_kg`.
- Output stays bounded (≤90 words).
- Target: ~220 tok.

### 3.13 `workout-generator` (8B)

**Current:** ~470 tok. Missing weight cut state, fight date proximity, sex/age, injury notes.

**New:**
- Inject sex, age, weight class, days_out, camp_phase, deficit_state.
- Camp phase modifies volume: fight week = mobility only; specific_prep = -30% volume; general_prep = full.
- Output adds `phase_rationale` (1 sentence) explaining volume modulation — autonomy support.
- Target: ~360 tok.

### 3.14 `lookup-ingredient` (8B)

**Current:** ~105 tok. Already lean — leave essentially as-is.

**New:** Trim duplicate "JSON only / no markdown" lines, save ~20 tok. No personalization needed by design.

### 3.15 `generate-technique-chains` (120B)

**Current:** ~190 tok.

**New:** Add `experience`, `body_type`, `stance`. Same model. Target ~210 tok.

### 3.16 `generate-weight-plan` (non-combat fallback, 120B)

Out of scope for this overhaul (non-combat). Leave as-is, but reuse the same skeleton for consistency.

### 3.17 RETIRE: `fight-camp-coach`, `hydration-insights`

Both are dead code per the audit (no `functions.invoke()` calls). **Delete the edge functions and any registry entries.** Reclaim ~1,500 tok of prompt maintenance burden.

### 3.18 NEW: `morning-checkin` (NEW, 8B, replaces ad-hoc dashboard logic)

Daily 30-second check-in (mood, soreness, sleep, energy 1–7). Returns:
- A single paragraph reflecting the trend.
- An optional camp-phase-specific nudge ("today is glycogen depletion day; keep carbs <50g").
- Risk flag if 2+ wellness markers below baseline 3+ days.

This replaces the wisdom-output-then-overridden pattern with something useful.

---

## 4. Profile + Camp Data Model

### 4.1 New canonical profile fields (typed in `ProfileData`)

| Field | Type | Source |
|---|---|---|
| `sport` | enum: MMA, Boxing, BJJ, Wrestling, Kickboxing, MuayThai, Judo, Taekwondo, Other | from existing `athlete_types[]` (primary) |
| `sanctioning_body` | string (UFC, Bellator, ONE, IBJJF, NCAA, WBC, etc.) | new — onboarding step |
| `weighin_to_bout_hours` | int | derived from sanctioning_body, override per camp |
| `weight_class_kg` | number | new — from goal_weight_kg + class metadata |
| `walking_weight_kg` | number | new — distinct from `current_weight_kg` (off-camp baseline) |
| `experience` | enum: amateur, pro_lt5, pro_5to15, pro_gt15 | replaces `experience_level` + `competition_level` (currently duplicated) |
| `stance` | enum: orthodox, southpaw, switch | new |
| `imperial_units` | bool | promote from localStorage `wcw_weight_unit` to profile |
| `time_zone` | string | new — for rehydration timing |
| `menstrual_tracking_enabled` | bool | new — F only |
| `cycle_day` (rolling, optional) | int | new — F only |
| `current_fight_camp_id` | uuid → fight_camps | new |
| `hydration_baseline_ml` | int | new — daily fluid baseline |
| `sweat_rate_kg_per_hour` | number | new — 1-time test or estimate |

### 4.2 Deprecate / merge

- **Drop `competition_level`** — collapse into `experience` (currently asked twice).
- **Drop `training_frequency`** as a separate field — derive from `training_calendar` actual logs (with fallback to a single onboarding pick).
- **Drop `plan_aggressiveness`** for fighters — fight date + days_out drives aggressiveness deterministically.
- **Unify `sleep_hours` buckets** — single source: `<5 / 5-6 / 6-7 / 7-8 / 8+` everywhere (Onboarding + Goals).
- **Unify `food_budget` buckets** — single source: `tight / flexible / no_limit`.

### 4.3 Fight camp linkage

```sql
ALTER TABLE fight_camps ADD COLUMN is_active BOOLEAN DEFAULT FALSE;
-- Constraint: at most one active per user
CREATE UNIQUE INDEX one_active_camp_per_user
  ON fight_camps (user_id) WHERE is_active = TRUE;
ALTER TABLE profiles ADD COLUMN current_fight_camp_id UUID REFERENCES fight_camps(id);
```

`profile.target_date` and `profile.fight_week_target_kg` are now **mirrors** of the active camp; switching active camp updates them transactionally. Hydration page, FightWeek page, and Dashboard read from the active camp.

### 4.4 Camp-phase state machine

`getCampPhase(camp, today): CampPhase`:

```ts
type CampPhase =
  | "no_camp"
  | "general_prep"      // > 28 days out
  | "specific_prep"     // 8 - 28 days
  | "fight_week"        // 7 - 1 days
  | "weigh_in_day"      // day of weigh-in
  | "post_weigh_in"     // post-weigh-in to bout
  | "fight_day"         // day of bout
  | "recovery"          // 0 - 7 days post bout
  | "off_season"        // > 7 days post bout, no next camp
```

A single function in `src/lib/campPhase.ts` is the only source. Dashboard, BottomNav, all AI prompts, and the new `morning-checkin` consume it. **Phase, not raw `daysUntilTarget` integers, drives UI shifts.**

---

## 5. Onboarding Redesign (14 → 7 screens, no paywall first)

### 5.1 New flow

| # | Screen | Required | Notes |
|---|---|---|---|
| 1 | Goal: Fight or Lose Weight | Yes | unchanged |
| 2 | Fight setup (combo screen) | Yes | sport, sanctioning_body (auto-fills weighin window), fight_date, weight_class (picks from sanctioning_body's classes) |
| 3 | About you | Yes | sex, age, height, **walking_weight_kg, current_weight_kg, current/cycle status (F)**. Imperial toggle. |
| 4 | Experience & training | Yes | experience (single field, replacing the two), training days/wk, training types (sport-aware options), stance |
| 5 | Constraints | Optional | dietary_restrictions, food_budget |
| 6 | Notifications | Optional | weigh-in reminders, daily check-in, hydration nudge — granular |
| 7 | Plan preview | Yes (review) | Shows generated cut plan, allows edits, then "Start camp" |

**Saved time:** ~14 → 7 screens, ~3 min → ~90 sec.

### 5.2 Paywall placement

- Remove `presentPaywallIfNeeded()` from immediately-after-onboarding (`Onboarding.tsx:491`).
- Trigger paywall on **first action that uses a gem** (AI meal scan, AI coach question) — natural moment of value.
- First-day free gem unchanged.

### 5.3 Guards & defaults

- Remove silent `age=25, sex=male` defaults (`Onboarding.tsx:308-313`). Block submit if missing.
- Remove off-by-one progress bug: progress shown as "Step X of 7" matching real position.
- Schema-shared dropdown values: `sleep_hours`, `food_budget`, etc., live in `src/lib/profileSchema.ts` and Goals.tsx imports them — no drift.

### 5.4 Goals page changes

Becomes pure profile editor backed by the same enums. Drops the duplicated `activity_level` dropdown — derives it from `training_frequency` + `experience` like Onboarding does. Single source of truth.

---

## 6. Daily Flow & Camp-Phase UX

### 6.1 BottomNav for fighters

When `goal_type=cutting` AND active camp:
```
[Dashboard] [Weight Cut] [+ Quick Log] [Nutrition] [More]
```
"Weight Cut" is primary. "Weight" tracker collapses into the Weight Cut surface (one screen, not two). "Fight Camps", "Training Calendar", "Recovery" stay in More but are also surfaced in a context-aware Dashboard widget.

For non-fighters (`goal_type=losing`), unchanged.

### 6.2 Phase-aware Dashboard

Top widget switches by `camp_phase`:

| Phase | Widget | Action |
|---|---|---|
| general_prep | Weekly weight target, deficit, training load | Log weight |
| specific_prep | "X kg in Y days, on track / behind", deficit pressure | Log weight, plan adjustments |
| fight_week | Day-of-week protocol card (fluid, fiber, carbs, sodium target for today), weigh-in countdown | Tap → today's protocol |
| weigh_in_day | Pre-weigh-in checklist + post-weigh-in launch button | "Step on scale" |
| post_weigh_in | Live rehydration timer with hourly fluid/sodium targets | tick off |
| fight_day | Pre-fight fueling card + warmup reminder | minimal |
| recovery | "Refeed, sleep, mobility" card | Log fight outcome |

This is the highest-leverage UX change — it's what "complementing fight camp" means.

### 6.3 Fight Week page

- Auto-fills currentWeight, targetWeight, daysUntilWeighIn, normalDailyCarbs from active profile + camp + most recent weigh-in. User edits only if wrong.
- "Regenerate plan" only re-runs LLM; data inputs stay sticky.

### 6.4 Rehydration page

Same pre-fill: weight lost = (most recent pre-weigh-in weight − weigh-in scale weight); weighin time = camp record; fight time = camp record + sanctioning window.

### 6.5 QuickLog improvements

- Inline weight entry stays (best in app today).
- Add "Quick check-in" tile (mood/soreness/sleep/energy 1-7 sliders) → fires `morning-checkin` AI.
- Manual meal add: collapse to two fields (name + calories) with an "Add macros" expander; macros auto-populate via `lookup-ingredient` if name is recognizable.

---

## 7. Streaming Infrastructure (NEW — memory was wrong)

The codebase has zero streaming. Chat features (`wizard-chat`, `recovery-coach`) feel slow because the user waits 3–8s for the full JSON. We will add:

### 7.1 Server side
- New `_shared/streamResponse.ts` that wraps the Groq fetch with `stream: true` and forwards SSE.
- Branch per-function on `?stream=true` query param.
- Initial scope: `wizard-chat` and `recovery-coach` only. Everything else stays sync (their outputs are JSON or one-shot analyses where streaming has no UX win).

### 7.2 Client side
- `src/lib/streamingFetch.ts` doing raw `fetch()` with auth + SSE reader.
- `src/hooks/useStreamingAI.ts` React state wrapper.
- `src/components/StreamingTextBlock.tsx` for inline ChatGPT-style typing in chat surfaces.

### 7.3 Auth
Edge function streaming endpoints take same auth as JSON; the EdgeRuntime auth helper supports SSE responses.

---

## 8. Token Savings Estimate (rough)

| Function | Before | After | Δ |
|---|---|---|---|
| daily-wisdom | 145 | 120 | -25 |
| analyse-diet | 440 | 280 | -160 |
| analyze-meal (vision) | 365 | 320 | -45 |
| analyze-meal (reasoning) | 380 | 380 | 0 |
| weight-tracker-analysis | 1,000 | 350 | -650 (also model upgrade) |
| fight-week-analysis | 1,950 | 700 | -1,250 |
| generate-cut-plan | 1,300 | 600 | -700 |
| meal-planner | 440 | 330 | -110 |
| recovery-coach | 3,500 | 600 | -2,900 |
| wizard-chat | 2,500 | 800 | -1,700 |
| training-summary | 270 | 200 | -70 |
| training-insights | 250 | 220 | -30 |
| workout-generator | 470 | 360 | -110 |
| lookup-ingredient | 105 | 85 | -20 |
| rehydration-protocol | 250 | 280 | +30 (more sport context, worth it) |
| fight-camp-coach (delete) | 1,430 | 0 | -1,430 |
| hydration-insights (delete) | 75 | 0 | -75 |
| **Net (system prompt only)** | **~14,870** | **~5,625** | **~62% reduction** |

Plus ~30% reduction in the dynamic context (per-feature selectors instead of full profile blob).

---

## 9. Implementation Roadmap (5 staged work-items)

Each can ship independently behind a feature flag.

### W1 — Foundation (1–2 days)
1. `_shared/scienceAnchors.ts` with the 20 facts as constants.
2. `_shared/buildAthleteContext.ts` with per-feature selectors.
3. `src/lib/profileSchema.ts` — single source of dropdown values.
4. `src/lib/campPhase.ts` — phase state machine + tests.
5. DB migration: profile new columns, fight_camps.is_active, profile.current_fight_camp_id.

### W2 — Profile data + onboarding cut (2–3 days)
1. New 7-step onboarding flow, paywall removed from end-of-flow.
2. Goals.tsx aligned to shared schema.
3. Migration of existing user data into new columns.
4. Active-camp linkage logic (only one is_active per user).

### W3 — Prompt rewrites (Tier 1: critical) (2–3 days)
Functions whose quality most affects fighters mid-camp:
1. `weight-tracker-analysis` (model upgrade + rewrite)
2. `fight-week-analysis` (rewrite + science anchors)
3. `rehydration-protocol` (rewrite + auto-fill UI)
4. `daily-wisdom` (rewrite + camp_phase awareness)
5. `generate-cut-plan` (rewrite + walking-weight detection)
6. Delete `fight-camp-coach` + `hydration-insights`.

### W4 — Streaming infra + chat upgrades (2 days)
1. `streamResponse.ts` server, `streamingFetch.ts` + `useStreamingAI` client.
2. `wizard-chat` to 120B + streaming + RAG-lite context selection.
3. `recovery-coach` to 120B + streaming + topical research routing.

### W5 — Phase-aware UX + remaining prompts (2–3 days)
1. Phase-aware Dashboard widget.
2. BottomNav for fighters with active camp ("Weight Cut" promoted).
3. New `morning-checkin` edge function + Quick Log tile.
4. Remaining prompt rewrites: `analyse-diet`, `analyze-meal`, `meal-planner`, `training-summary`, `training-insights`, `workout-generator`, `lookup-ingredient`, `generate-technique-chains`.

Total estimate: **9–13 working days** for all 5 work-items, can be parallelized.

---

## 10. Risks & Open Questions

1. **Model migration cost.** Moving `weight-tracker-analysis`, `wizard-chat`, `recovery-coach` from 8B to 120B raises per-call cost ~6×. Mitigation: token reduction (above) brings the per-call dollar cost roughly even. Net bill-up risk: ~20% on these three features. Worth measuring before W3 ships.

2. **Walking weight is unknown for existing users.** Migration: default `walking_weight_kg = current_weight_kg + 5%` and prompt user to confirm/correct on next visit.

3. **Sanctioning body taxonomy.** UFC/Bellator/ONE/PFL/IBJJF/WBC/WBA/IBF/WBO/NCAA covers 95% — long tail handled with "Other" + free-text + a hardcoded `weighin_to_bout_hours` fallback per sport.

4. **Same-day weigh-in detection.** ONE Championship's hydration test breaks normal cut math. App must detect (sanctioning_body=ONE OR same_day flag) → force `cut_depth_cap=3%` and disable water-cut UI.

5. **Female cycle data.** Optional and opt-in. Tracking is privacy-sensitive; plan UX so it never feels mandatory.

6. **Dead code deletion.** Confirm `fight-camp-coach` and `hydration-insights` are truly dead by repository grep + production logs (last 30 days) before deleting.

7. **Streaming fallback.** Some Capacitor/iOS network conditions may break SSE. Need a sync fallback path for chat features.

8. **Auto camp_phase transitions.** Determined by `target_date` + `today`. But what about the pre-test cut (drop sodium, drill weigh-in 1 day early)? Manual phase override should be allowed.

---

## 11. Out of Scope for This Spec

- Native push notification redesign (granular settings hinted but not specified).
- Coach/gym social features.
- Apple HealthKit / Garmin / Whoop integrations for HRV/RHR — promising but a separate project.
- Voice-first input beyond what `transcribe-audio` already does.
- AI image generation (skill tree thumbnails, etc.).
