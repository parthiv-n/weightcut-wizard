# Dashboard Redesign + Fight Camp Score — Design Spec

**Status**: Draft for implementation
**Author**: brainstorming session 2026-05-12
**Scope**: One bounded design — the scoring engine + dashboard rebuild ship together.

---

## 1. Overview

Two coupled changes, designed and shipped together:

1. **Fight Camp Score engine** — a config-driven, versioned scoring module that produces a 0–100 composite "Fight Form Score" per user per day, with a 5-component sub-score breakdown, a verbal label (Sharp / Sharpening / Off-Pace / At Risk), and a "Camp Age" sub-line ("2 weeks ahead of schedule" / "3 days behind").
2. **Dashboard rebuild** — Activity-ring-style hero with a single Fight Form ring + 2 stat chips above the fold; collapsible Today panel; secondary cards demoted below fold. Daily Wisdom card removed from the main flow and folded into the score-tap sheet.

### Bounded contexts

| Module | Responsibility |
|---|---|
| `src/scoring/` | Pure compute. No I/O, no React. Testable in isolation. |
| `convex/fightFormScore.ts` | Persistence, query/mutation/action layer, cron registration. |
| `convex/schema.ts` | New `fight_form_scores` table. |
| `src/components/dashboard/FightFormRing.tsx` | Hero ring visualisation. |
| `src/components/dashboard/FightFormScoreSheet.tsx` | Score breakdown sheet (folds in Daily Wisdom narrative). |
| `src/components/dashboard/TodayPanel.tsx` | Collapsible "today's adherence" surface. |
| `src/pages/Dashboard.tsx` | Rebuilt for the new layout. |

### Non-goals (YAGNI)

- No HRV / resting HR integration (would be a separate Health-API epic).
- No Web Worker offload (compute is server-side).
- No per-user algorithm tuning.
- No ML-based score smoothing — plain EMA only.
- No real-time push of score changes — debounced recompute on data writes is enough.

---

## 2. The Algorithm

### Output shape

```ts
type FightFormScore = {
  score: number;              // 0–100 displayed (3-day EMA of raw)
  rawScore: number;           // unsmoothed
  label: "sharp" | "sharpening" | "off_pace" | "at_risk";
  state: "ok" | "calibrating" | "no_camp" | "paused";
  campAge: { weeksAhead: number } | null;  // null when state !== "ok"
  subScores: {
    trainingLoad: SubScore;
    sleep: SubScore;
    weightCut: SubScore;
    wellness: SubScore;
    nutritionAdherence: SubScore;
  };
  topDriver: keyof FightFormScore["subScores"];
  topLimiter: keyof FightFormScore["subScores"];
  appliedCeiling: { ruleId: string; cap: number } | null;
  algorithmVersion: string;   // semver, e.g. "1.0.0"
};
type SubScore = { value: number; weight: number; reason: string };
```

### Composition

```
rawScore  = Σ(subScore.value × subScore.weight)
ceilinged = min(rawScore, applicable_soft_ceiling)
displayed = EMA_3day(ceilinged)
```

### Sub-score formulas (build phase)

| Sub-score | Formula | Data source | Notes |
|---|---|---|---|
| **Training Load** | 100 if ACWR ∈ [0.8, 1.3]; linear decay to 40 at 0.5 or 1.5; floor 20. | `gym_sessions` (rpe × durationMinutes) | ACWR = 7d EWMA load / 28d EWMA load. Cold-start uses available window, flag in `reason`. |
| **Sleep** | `max(0, 100 − debtHours × 8)` | `sleep_logs` | Debt = `max(0, 7×targetHours − sum(last 7d hours))`, target = 8h. |
| **Weight Cut** | 100 if rate ∈ [0.3%, 1.0%] BW/wk; decay to 50 at 1.5%; 20 at >2%. Additional −10 if projected to miss `goalWeightKg` by `fightDate`. | `weight_logs`, `fight_camps.fightDate`, `profiles.goalWeightKg` | Rate = `(start − current) / weeksElapsed / start × 100`. |
| **Wellness** | `100 − ((HooperEMA − 4) × 4.2)` | `daily_wellness_checkins.hooperIndex` (already computed) | Hooper = sleepQuality + fatigue + soreness + stress. 7d EMA. |
| **Nutrition Adherence** | `100 × (daysHitCalorieTargetWithin±10% / 7) − proteinPenalty` | `meals`, `profiles.aiRecommendedCalories/Protein` | Penalty: −5 per day protein < 80% of target. |

All sub-scores clamp to [0, 100].

### Phase weighting (auto-detected from `fight_camps.fightDate`)

| Phase | Trigger | Load | Sleep | WeightCut | Wellness | Nutrition |
|---|---|---|---|---|---|---|
| **Build** | > 14 days to fight | 0.20 | 0.20 | 0.25 | 0.20 | 0.15 |
| **Peak** | 7–14 days | 0.10 | 0.25 | 0.30 | 0.20 | 0.15 |
| **Fight Week** | ≤ 7 days | 0.05 | 0.25 | 0.40 | 0.20 | 0.10 |

### Soft ceilings (cap finalScore, never zero it)

| Rule ID | Trigger | Cap |
|---|---|---|
| `weight_cut_dangerous` | Weight loss rate > 2% BW/wk sustained 3+ days | 50 |
| `sleep_debt` | Sleep debt > 10h over 7d | 65 |
| `training_spike` | ACWR > 1.8 | 45 |

Highest applicable ceiling wins. `appliedCeiling` is surfaced in UI so the user knows what's holding them back.

### Cold start

- < 3 days of data in last 7 → `state: "calibrating"`, no numeric score shown. UI shows progress: "X/7 days logged".
- 3–6 days → compute score, flag low-confidence (small indicator in ring).
- ≥ 7 days → full score.

### Camp Age

```
expectedProgressPct = daysElapsed / campLengthDays
actualProgressPct   = (startingWeightKg − currentWeightKg) / (startingWeightKg − goalWeightKg)
weeksAhead          = (actualProgressPct − expectedProgressPct) × campLengthWeeks
displayed           = clamp(weeksAhead, -4, +4)
```

### Label thresholds

- ≥ 80 → `sharp`
- 60–79 → `sharpening`
- 40–59 → `off_pace`
- < 40 → `at_risk`

---

## 3. Algorithm Architecture (built for iteration)

### File structure

```
src/scoring/
├── config/
│   ├── v1.ts                 // ScoringConfig v1 — current production
│   └── index.ts              // exports current config + version registry
├── subScores/
│   ├── trainingLoad.ts       // pure: (inputs, config) => SubScore
│   ├── sleep.ts
│   ├── weightCut.ts
│   ├── wellness.ts
│   └── nutritionAdherence.ts
├── ceilings.ts
├── phaseWeights.ts
├── campAge.ts
├── compose.ts                // computeFightFormScore(inputs, config) → FightFormScore
├── types.ts
└── __tests__/                // golden-file tests + per-subscore unit tests
```

### Config object (single source of truth)

All tunables in `src/scoring/config/v1.ts`:

```ts
export const ScoringConfigV1: ScoringConfig = {
  version: "1.0.0",
  weights: {
    build:     { load: 0.20, sleep: 0.20, weightCut: 0.25, wellness: 0.20, nutrition: 0.15 },
    peak:      { load: 0.10, sleep: 0.25, weightCut: 0.30, wellness: 0.20, nutrition: 0.15 },
    fightWeek: { load: 0.05, sleep: 0.25, weightCut: 0.40, wellness: 0.20, nutrition: 0.10 },
  },
  phaseThresholdsDays: { fightWeek: 7, peak: 14 },
  trainingLoad: {
    acwrSweetSpot: [0.8, 1.3],
    acwrPenaltyEdges: [0.5, 1.5],
    acwrFloor: 20,
    acuteWindowDays: 7,
    chronicWindowDays: 28,
  },
  sleep: { targetHoursPerNight: 8, debtPenaltyPerHour: 8 },
  weightCut: {
    sustainableRatePctPerWeek: [0.3, 1.0],
    decayEdgePct: 1.5,
    dangerEdgePct: 2.0,
    onPaceMissPenalty: 10,
  },
  wellness: { hooperFloor: 4, hooperScalar: 4.2 },
  nutrition: {
    calorieToleranceFraction: 0.10,
    proteinShortfallThresholdPct: 80,
    proteinPenaltyPerDay: 5,
  },
  ceilings: [
    { id: "weight_cut_dangerous", cap: 50 },
    { id: "sleep_debt", cap: 65 },
    { id: "training_spike", cap: 45 },
  ],
  smoothing: { emaDays: 3 },
  coldStart: { minDaysOfDataIn7d: 3 },
  labelThresholds: { sharp: 80, sharpening: 60, offPace: 40 },
  campAge: { maxWeeksDisplay: 4 },
};
```

### Versioning policy

| Bump | When | DB behavior |
|---|---|---|
| Patch `1.0.x` | Constant tuning (weights, thresholds) | New scores carry new version; old scores retain original. No backfill required. |
| Minor `1.x.0` | Add a sub-score or ceiling | Same as patch. Schema additive only. |
| Major `x.0.0` | Change score scale or label semantics | Requires migration plan. Old rows can be re-projected or kept as-is. |

Every persisted score carries `algorithmVersion`. Historical scores are never retroactively rewritten unless a backfill action is explicitly run.

### Testing

- Unit tests per sub-score covering edge cases (zero data, max data, off-by-one windows).
- **Golden-file tests**: 5 synthetic camp scenarios committed to `__tests__/fixtures/`:
  1. Smooth cut, perfect adherence
  2. Dangerous cut (>2%/wk)
  3. Overtraining (ACWR > 1.5)
  4. Sleep debt accumulation
  5. Fight-week crunch
  Each fixture has an expected score trajectory; any algorithm change re-runs and diffs are visible in PR.

---

## 4. Persistence + Compute Strategy

### New Convex table

```ts
fight_form_scores: defineTable({
  userId: v.id("users"),
  date: v.string(),                   // ISO YYYY-MM-DD (user-local)
  campId: v.optional(v.id("fight_camps")),
  rawScore: v.number(),
  displayedScore: v.number(),         // 3-day EMA — what UI shows
  label: v.union(v.literal("sharp"), v.literal("sharpening"), v.literal("off_pace"), v.literal("at_risk")),
  state: v.union(v.literal("ok"), v.literal("calibrating"), v.literal("no_camp"), v.literal("paused")),
  subScores: v.object({
    trainingLoad:        v.object({ value: v.number(), weight: v.number(), reason: v.string() }),
    sleep:               v.object({ value: v.number(), weight: v.number(), reason: v.string() }),
    weightCut:           v.object({ value: v.number(), weight: v.number(), reason: v.string() }),
    wellness:            v.object({ value: v.number(), weight: v.number(), reason: v.string() }),
    nutritionAdherence:  v.object({ value: v.number(), weight: v.number(), reason: v.string() }),
  }),
  appliedCeiling: v.optional(v.object({ ruleId: v.string(), cap: v.number() })),
  campAge: v.optional(v.object({ weeksAhead: v.number() })),
  topDriver: v.string(),
  topLimiter: v.string(),
  algorithmVersion: v.string(),
  computedAt: v.number(),
})
  .index("by_user_date", ["userId", "date"])
  .index("by_user_camp", ["userId", "campId"])
  .index("by_user_date_version", ["userId", "date", "algorithmVersion"])
```

### Compute triggers

| Trigger | Mechanism | Cadence |
|---|---|---|
| **Daily cron** | Convex `crons.hourly`. For each user whose local time just hit 04:00, compute previous day's score. | Hourly fan-out, processes timezone slices. |
| **On-write recompute** | Source mutations (`weight_logs`, `sleep_logs`, `gym_sessions`, `meals`, `daily_wellness_checkins`) schedule a debounced recompute via `ctx.scheduler.runAfter(5_000, ...)`. Coalesced by `(userId, date)`. | 5s debounce per user/date. |
| **On-demand** | `recomputeNow` mutation, rate-limited 1/min per user. Manual refresh in score sheet. | User-initiated. |

### Read path (Dashboard hot path)

```ts
// Convex query — indexed lookup, reactive subscription
fightFormScore.getToday(userId)
  → fetch fight_form_scores by (userId, today, latest version)
  → if row missing, synthesize { state: "calibrating", progress: "X/7" } cheaply
  → if row > 6h old, schedule async recompute; return existing
  → return displayed score + label + sub-scores + campAge
```

### Backfill on ship

One-time internal action `backfillFightFormScores` computes last 30 days for every user with an active camp. Idempotent (uses upsert keyed by `userId + date + version`). Run via Convex dashboard during deploy.

### Cost estimate

- Per-user-day compute: ~5 indexed reads + arithmetic + 1 write. < 50ms.
- 1000 active-camp users × 1 daily compute = ~50s aggregate per day. Linear in user count, fine to mid-thousands.

---

## 5. Dashboard Layout

### Above-the-fold

```
┌──────────────────────────────────────────┐
│  Hi, {name}                  [Fight Week]│   ← greeting + phase chip + days
│  Tuesday, May 12             {12d left}  │
├──────────────────────────────────────────┤
│                                          │
│              ╭─────────────╮             │
│             │       82      │            │   ← FightFormRing
│             │     SHARP     │            │      • value + label inside
│              ╰─────────────╯             │      • progress arc, colored by label
│                                          │
│       2 weeks ahead of schedule          │   ← campAge sub-line
│                                          │
├──────────────────────────────────────────┤
│ ┌──── Weight ────┐ ┌──── Camp Age ───┐   │
│ │ 78.4kg → 70kg  │ │ +2 wks ahead    │   │   ← two stat chips
│ │ 62% complete   │ │ pace good       │   │
│ │ ▁▂▃▄▅ trend    │ │                 │   │
│ └────────────────┘ └─────────────────┘   │
└──────────────────────────────────────────┘
```

- Hero ring is the **single tap target** for the score detail sheet.
- Verbal label inside the ring is the personality; the 0–100 is the precision.
- Stat chips below are **read-only**, tapping deep-links to weight page / camp page.
- Phase chip top-right is **read-only** (auto-detected from camp dates).

### Today panel (collapsible, mid-page)

```
┌──── Today ─────────────────────────────┐
│  ● Weight       ● Sleep                │   ← 4 adherence dots
│  ● Training     ○ Wellness check-in    │      (filled = done)
│                                        │
│  Next: Strength session @ 6pm   ▸      │   ← single CTA row
└────────────────────────────────────────┘
```

- Collapsed by default once user has logged the day. Expanded if anything is open.
- Tapping a dot deep-links to its log page.

### Below the fold

Order (vertical stack, kept from current Dashboard with minimal change):
1. `ConsistencyRing` (kept as standalone — adherence is a behavior, not a readiness signal)
2. `WeightChart` + `TrainingWeekWidget` (2-col grid, kept)
3. `TrainingInsightsWidget` (kept)
4. `MilestoneBadges` (kept)
5. `NewAnnouncementWidget` (kept, conditional)

Removed from main flow:
- **`DailyWisdomCard`** — folded into the Fight Form Score sheet (see §6). The narrative is the same product surface as "why is your score what it is".
- **`No Weight Logs CTA`** — replaced by the Today panel's adherence dot.
- **`Cut Plan + Sleep Logger row`** — Sleep Logger moves to the Today panel CTA; Cut Plan icon moves into the score sheet as an action item.

### No-active-camp state

- Hero ring renders greyed out with overlay: **"Start a fight camp to unlock your Fight Form Score"** + CTA button.
- Stat chips hidden.
- Today panel still functional (user can log weight, sleep, training out of camp).
- Below-fold sections (ConsistencyRing, WeightChart) still render.

### Calibrating state

- Hero ring shows a determinate progress arc representing days-of-data, with center text: **"Calibrating · 4/7 days"**.
- No numeric score, no label.
- campAge hidden.
- Sub-text: "Log weight, sleep, and a wellness check-in to unlock your score."

---

## 6. Score Detail Sheet

Opens on tapping the hero ring. Replaces the existing Daily Wisdom sheet.

```
┌── Fight Form Score ──────────────────── × ┐
│                                            │
│              82  SHARP                     │   ← big score + label
│       2 weeks ahead of schedule            │
│       Build phase · 12 days to fight       │
│                                            │
├────────────────────────────────────────────┤
│  WHAT'S DRIVING YOUR SCORE                 │   ← sub-score bars
│  Sleep ───────────────●─── 92             │      sorted descending
│  Wellness ─────────────●── 88             │
│  Weight Cut ─────────●──── 78             │
│  Training Load ────●─────── 70            │
│  Nutrition ───●─────────── 55  ← limiter  │      bottom one flagged
│                                            │
├────────────────────────────────────────────┤
│  ⚠  Ceiling applied: Sleep debt > 10h     │   ← if appliedCeiling
│     Capped at 65 until you recover sleep   │      (yellow banner)
├────────────────────────────────────────────┤
│  COACH'S TAKE                              │   ← Daily Wisdom narrative
│  {AI-generated 2-3 sentence summary,       │      (existing edge fn)
│   fed by score breakdown}                  │
├────────────────────────────────────────────┤
│  ACTION ITEMS                              │   ← kept from existing wisdom
│  1. Hit 8h sleep tonight                   │
│  2. Add 30g protein at lunch               │
│  3. Skip tomorrow's hard spar              │
├────────────────────────────────────────────┤
│  [Refresh]   [View 7-day trend]            │
└────────────────────────────────────────────┘
```

- Sub-score bars are **horizontal bars** (0–100 scale), labeled with `reason` text on tap (or below the bar in a smaller font).
- Sub-scores sorted by `value × weight` contribution descending; bottom one is `topLimiter` and shown with a marker.
- "Coach's Take" is the existing Daily Wisdom narrative — same edge function call, fed by the score breakdown (replaces the old wisdom payload).
- "Action Items" are AI-generated from the score breakdown + sub-score reasons. Existing infrastructure.

---

## 7. Data Flow

```
[gym_sessions, sleep_logs, weight_logs, meals, daily_wellness_checkins]
                          │
                          │  (writes trigger debounced scheduler)
                          ▼
              convex/fightFormScore.ts
              ┌────────────────────────────┐
              │ recomputeForUserDate(...)  │   ← internal action
              │   1. fetch inputs window   │
              │   2. call computeScore()   │   ← pure src/scoring/compose.ts
              │   3. upsert score row      │
              └────────────────────────────┘
                          │
                          ▼
                fight_form_scores table
                          │
                          ▼
              fightFormScore.getToday(userId)   ← reactive Convex query
                          │
                          ▼
              src/components/dashboard/
              ├── FightFormRing.tsx
              ├── FightFormStatChips.tsx
              └── FightFormScoreSheet.tsx
                          │
                          ▼
                  Dashboard.tsx
```

---

## 8. Edge Cases & Failure Modes

| Case | Behavior |
|---|---|
| User has no fight camp | `state: "no_camp"`. Hero ring shows CTA. No score row written. |
| Camp is paused (future feature) | `state: "paused"`. Score frozen at last computed value. No auto-recompute. |
| Camp completed (`isCompleted: true`) | Score remains queryable historically. No new compute. Sheet shows final score. |
| User logs weight that's heavier than yesterday | No special behavior; weight-cut sub-score reflects the trend over the rate window. Existing `WeightIncreaseQuestionnaire` flow is preserved. |
| Wellness check-in not logged today | Wellness sub-score uses last 7d EMA; if no check-ins in 7d, sub-score is dropped and remaining weights re-normalized. Flagged in `reason`. |
| Algorithm version bump during user's camp | New score rows carry new version; old rows preserved. Dashboard reads latest version per date. |
| Convex outage during cron | Cron retries next hour; recomputeNow allows manual catch-up. |
| Score row stale > 24h | Synthesized fallback returns calibrating state; client shows skeleton + retry. |

---

## 9. Migration & Rollout

### Phased rollout

1. **Phase A — Algorithm-only ship.** Implement `src/scoring/`, `convex/fightFormScore.ts`, `fight_form_scores` table, cron + recompute. **No UI changes**. Daily Wisdom card and existing Dashboard remain. Validate score outputs against 5 internal beta users by comparing produced scores with their subjective state for 1 week.
2. **Phase B — Score visible behind feature flag.** Add `FightFormRing` to the Dashboard above `WeightProgressRing` (no removal yet). Tappable but score sheet uses existing Daily Wisdom narrative format. Flag: `enableFightFormScore`. Enable for beta cohort.
3. **Phase C — Dashboard rebuild.** Behind same flag: replace hero, demote/remove cards per §5. Score sheet replaces Daily Wisdom sheet. Run alongside old layout (flag-controlled) for 1 week.
4. **Phase D — Cleanup.** Remove flag, remove `DailyWisdomCard` from the codebase (move shared logic into the score sheet), delete unused props. Backfill scores for all users.

### Backwards compatibility

- Existing AI edge function for Daily Wisdom is **kept** — same endpoint, slightly different input payload (score breakdown instead of just risk/pace). One-time migration of the prompt template.
- `WeightProgressRing` component is **kept** — repurposed in score detail sheet "View 7-day trend".
- No schema removals; only `fight_form_scores` is added. Existing tables untouched.

### Risk mitigations

- **Risk: Score feels wrong for engaged users.** Mitigation: Phase A validation with 5 betas; surface `topLimiter` and `appliedCeiling` so the score is always explainable.
- **Risk: Performance regression on Dashboard load.** Mitigation: hot-path read is a single indexed query; backfill ensures rows exist; reactive Convex subscription means no manual cache management.
- **Risk: Cold-start users see nothing meaningful.** Mitigation: `calibrating` state shows determinate progress, not an empty ring.
- **Risk: Algorithm tuning regresses production scores silently.** Mitigation: golden-file tests fail loudly in CI; version stamping makes shifts visible per-row.

---

## 10. What We're NOT Building (YAGNI)

- HRV / resting HR integration
- Apple Health / Google Fit sync
- Per-user algorithm overrides or custom weights
- Score-trend ML predictions
- Real-time WebSocket push of score changes
- Coach-to-fighter score sharing
- Score-based notifications / nags
- Multi-camp comparison ("how did this camp score vs last camp?")

These are explicit follow-ups for future epics, not v1 scope.

---

## Appendix A: Configuration values to tune post-launch

After 20+ camps of telemetry, expected to tune:
- Sub-score weights (especially Nutrition weight — may be too low at 0.15)
- ACWR penalty edges (currently 0.5 / 1.5; may compress)
- Hooper scalar (currently 4.2; may need to scale per-user)
- EMA window (currently 3 days; may extend to 5)
- Phase thresholds (currently 7d / 14d; may extend Peak window)
