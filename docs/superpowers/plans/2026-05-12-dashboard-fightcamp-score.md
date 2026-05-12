# Dashboard Redesign + Fight Camp Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a config-driven Fight Camp Score (0–100 composite) computed daily per user, plus a rebuilt Dashboard centered on the score ring with secondary content demoted below the fold.

**Architecture:** Pure scoring module under `src/scoring/` (no I/O) consumed by a Convex action that persists daily snapshots to a new `fight_form_scores` table. Dashboard reads via a reactive Convex query. Daily cron + debounced on-write recomputes keep scores fresh. Algorithm config is a single TypeScript object with semver version stamping for safe iteration.

**Tech Stack:** TypeScript, Convex, Vitest, React, Tailwind, shadcn/ui. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-05-12-dashboard-fightcamp-score-design.md`](../specs/2026-05-12-dashboard-fightcamp-score-design.md). Reference it for full algorithm details, weights, ceilings, and UI mockups.

---

## Phase 1: Scoring Engine (pure, no I/O)

### Task 1: Types and config skeleton

**Files:**
- Create: `src/scoring/types.ts`
- Create: `src/scoring/config/v1.ts`
- Create: `src/scoring/config/index.ts`

- [ ] **Step 1: Create types**

`src/scoring/types.ts`:

```ts
export type SubScoreKey =
  | "trainingLoad"
  | "sleep"
  | "weightCut"
  | "wellness"
  | "nutritionAdherence";

export type SubScore = { value: number; weight: number; reason: string };

export type ScoringPhase = "build" | "peak" | "fightWeek";

export type FightFormState = "ok" | "calibrating" | "no_camp" | "paused";

export type FightFormLabel = "sharp" | "sharpening" | "off_pace" | "at_risk";

export type FightFormScore = {
  score: number;          // 0–100 displayed (EMA)
  rawScore: number;
  label: FightFormLabel;
  state: FightFormState;
  phase: ScoringPhase | null;
  campAge: { weeksAhead: number } | null;
  subScores: Record<SubScoreKey, SubScore>;
  topDriver: SubScoreKey;
  topLimiter: SubScoreKey;
  appliedCeiling: { ruleId: string; cap: number } | null;
  algorithmVersion: string;
};

export type ScoringInputs = {
  date: string;                  // ISO YYYY-MM-DD (user-local)
  fightDate: string | null;      // ISO; null if no camp
  campStartDate: string | null;
  startingWeightKg: number | null;
  goalWeightKg: number | null;
  currentWeightKg: number | null;
  isCampPaused?: boolean;
  isCampCompleted?: boolean;
  sessions: Array<{ date: string; rpe: number; durationMinutes: number }>;
  sleepHours: Array<{ date: string; hours: number }>;
  weights: Array<{ date: string; weightKg: number }>;
  hooperByDate: Array<{ date: string; hooper: number }>;
  meals: Array<{ date: string; calories: number; proteinG: number }>;
  targets: { calories: number | null; proteinG: number | null };
  priorRawScores: Array<{ date: string; rawScore: number }>; // for EMA
};

export type ScoringConfig = {
  version: string;
  weights: Record<ScoringPhase, Record<SubScoreKey, number>>;
  phaseThresholdsDays: { fightWeek: number; peak: number };
  trainingLoad: {
    acwrSweetSpot: [number, number];
    acwrPenaltyEdges: [number, number];
    acwrFloor: number;
    acuteWindowDays: number;
    chronicWindowDays: number;
  };
  sleep: { targetHoursPerNight: number; debtPenaltyPerHour: number };
  weightCut: {
    sustainableRatePctPerWeek: [number, number];
    decayEdgePct: number;
    dangerEdgePct: number;
    onPaceMissPenalty: number;
  };
  wellness: { hooperFloor: number; hooperScalar: number };
  nutrition: {
    calorieToleranceFraction: number;
    proteinShortfallThresholdPct: number;
    proteinPenaltyPerDay: number;
  };
  ceilings: Array<{ id: string; cap: number }>;
  smoothing: { emaDays: number };
  coldStart: { minDaysOfDataIn7d: number };
  labelThresholds: { sharp: number; sharpening: number; offPace: number };
  campAge: { maxWeeksDisplay: number };
};
```

- [ ] **Step 2: Create v1 config**

`src/scoring/config/v1.ts`:

```ts
import type { ScoringConfig } from "../types";

export const ScoringConfigV1: ScoringConfig = {
  version: "1.0.0",
  weights: {
    build:     { trainingLoad: 0.20, sleep: 0.20, weightCut: 0.25, wellness: 0.20, nutritionAdherence: 0.15 },
    peak:      { trainingLoad: 0.10, sleep: 0.25, weightCut: 0.30, wellness: 0.20, nutritionAdherence: 0.15 },
    fightWeek: { trainingLoad: 0.05, sleep: 0.25, weightCut: 0.40, wellness: 0.20, nutritionAdherence: 0.10 },
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

- [ ] **Step 3: Config index**

`src/scoring/config/index.ts`:

```ts
import { ScoringConfigV1 } from "./v1";

export const CURRENT_CONFIG = ScoringConfigV1;
export const CONFIG_REGISTRY = {
  "1.0.0": ScoringConfigV1,
} as const;
```

- [ ] **Step 4: Commit**

```bash
git add src/scoring/
git commit -m "feat(scoring): types and v1 config skeleton"
```

---

### Task 2: Training Load sub-score (ACWR)

**Files:**
- Create: `src/scoring/subScores/trainingLoad.ts`
- Create: `src/scoring/__tests__/trainingLoad.test.ts`

- [ ] **Step 1: Write failing test**

`src/scoring/__tests__/trainingLoad.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeTrainingLoad } from "../subScores/trainingLoad";
import { ScoringConfigV1 } from "../config/v1";

const cfg = ScoringConfigV1;

function sess(date: string, rpe: number, mins: number) {
  return { date, rpe, durationMinutes: mins };
}

describe("computeTrainingLoad", () => {
  it("returns 100 when ACWR is in the sweet spot (1.0)", () => {
    const sessions = [];
    // 28 days of consistent 100 load: 1 session/day at rpe=10, 10min
    for (let i = 0; i < 28; i++) {
      const d = new Date("2026-05-01");
      d.setDate(d.getDate() - i);
      sessions.push(sess(d.toISOString().slice(0, 10), 10, 10));
    }
    const r = computeTrainingLoad(sessions, "2026-05-01", cfg);
    expect(r.value).toBe(100);
  });

  it("penalises ACWR < 0.8 (underloading)", () => {
    // recent acute window is low, chronic window is high → ACWR < 0.8
    const sessions = [];
    for (let i = 8; i < 28; i++) {
      const d = new Date("2026-05-01");
      d.setDate(d.getDate() - i);
      sessions.push(sess(d.toISOString().slice(0, 10), 10, 20));
    }
    const r = computeTrainingLoad(sessions, "2026-05-01", cfg);
    expect(r.value).toBeLessThan(100);
    expect(r.value).toBeGreaterThanOrEqual(cfg.trainingLoad.acwrFloor);
  });

  it("returns floor when ACWR > 1.5 (training spike)", () => {
    const sessions = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date("2026-05-01");
      d.setDate(d.getDate() - i);
      sessions.push(sess(d.toISOString().slice(0, 10), 10, 60)); // huge acute load
    }
    // no chronic load → ACWR will be max
    const r = computeTrainingLoad(sessions, "2026-05-01", cfg);
    expect(r.value).toBeLessThanOrEqual(50);
  });

  it("uses available window for cold-start without crashing", () => {
    const sessions = [sess("2026-05-01", 7, 30)];
    const r = computeTrainingLoad(sessions, "2026-05-01", cfg);
    expect(r.value).toBeGreaterThanOrEqual(0);
    expect(r.value).toBeLessThanOrEqual(100);
    expect(r.reason).toMatch(/cold.start|limited/i);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- src/scoring/__tests__/trainingLoad.test.ts`
Expected: FAIL — `computeTrainingLoad` not defined.

- [ ] **Step 3: Implement training load**

`src/scoring/subScores/trainingLoad.ts`:

```ts
import type { ScoringConfig, SubScore } from "../types";

type Session = { date: string; rpe: number; durationMinutes: number };

function ewma(values: number[], days: number): number {
  if (values.length === 0) return 0;
  const alpha = 2 / (days + 1);
  let v = values[0];
  for (let i = 1; i < values.length; i++) {
    v = alpha * values[i] + (1 - alpha) * v;
  }
  return v;
}

function loadByDay(sessions: Session[], asOfDate: string, windowDays: number): number[] {
  const end = new Date(asOfDate + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const t = new Date(s.date + "T00:00:00Z").getTime();
    if (t < start.getTime() || t > end.getTime()) continue;
    const load = (s.rpe || 0) * (s.durationMinutes || 0);
    byDay.set(s.date, (byDay.get(s.date) ?? 0) + load);
  }
  const out: number[] = [];
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    out.push(byDay.get(key) ?? 0);
  }
  return out;
}

export function computeTrainingLoad(
  sessions: Session[],
  asOfDate: string,
  cfg: ScoringConfig,
): SubScore {
  const c = cfg.trainingLoad;
  const acuteDaily = loadByDay(sessions, asOfDate, c.acuteWindowDays);
  const chronicDaily = loadByDay(sessions, asOfDate, c.chronicWindowDays);
  const acute = ewma(acuteDaily, c.acuteWindowDays);
  const chronic = ewma(chronicDaily, c.chronicWindowDays);

  const haveData = sessions.length > 0;
  if (!haveData) {
    return { value: 50, weight: 0, reason: "Cold start — no training data yet" };
  }
  if (chronic === 0) {
    // huge acute load, no chronic baseline → assume spike
    const value = acute > 0 ? c.acwrFloor : 50;
    return {
      value,
      weight: 0,
      reason: "Limited training history — cannot compute ACWR reliably",
    };
  }

  const acwr = acute / chronic;
  const [lo, hi] = c.acwrSweetSpot;
  const [loEdge, hiEdge] = c.acwrPenaltyEdges;
  let value: number;
  if (acwr >= lo && acwr <= hi) {
    value = 100;
  } else if (acwr < lo) {
    if (acwr <= loEdge) value = c.acwrFloor;
    else value = 40 + ((acwr - loEdge) / (lo - loEdge)) * 60;
  } else {
    if (acwr >= hiEdge) value = c.acwrFloor;
    else value = 40 + ((hiEdge - acwr) / (hiEdge - hi)) * 60;
  }
  value = Math.max(0, Math.min(100, value));
  return {
    value: Math.round(value),
    weight: 0,
    reason: `ACWR ${acwr.toFixed(2)} (sweet spot ${lo}–${hi})`,
  };
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npm test -- src/scoring/__tests__/trainingLoad.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/scoring/subScores/trainingLoad.ts src/scoring/__tests__/trainingLoad.test.ts
git commit -m "feat(scoring): training load sub-score via ACWR"
```

---

### Task 3: Sleep sub-score

**Files:**
- Create: `src/scoring/subScores/sleep.ts`
- Create: `src/scoring/__tests__/sleep.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeSleep } from "../subScores/sleep";
import { ScoringConfigV1 } from "../config/v1";

const cfg = ScoringConfigV1;

function genSleep(date: string, hours: number) { return { date, hours }; }

function week(asOf: string, hoursPerNight: number) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(asOf + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    out.push(genSleep(d.toISOString().slice(0, 10), hoursPerNight));
  }
  return out;
}

describe("computeSleep", () => {
  it("returns 100 when full 8h × 7 nights", () => {
    const r = computeSleep(week("2026-05-01", 8), "2026-05-01", cfg);
    expect(r.value).toBe(100);
  });
  it("penalises sleep debt — 1h short × 7 nights = 7h debt → 100 − 56 = 44", () => {
    const r = computeSleep(week("2026-05-01", 7), "2026-05-01", cfg);
    expect(r.value).toBe(44);
  });
  it("floors at 0 for catastrophic debt", () => {
    const r = computeSleep(week("2026-05-01", 2), "2026-05-01", cfg);
    expect(r.value).toBe(0);
  });
  it("handles missing logs as zero hours", () => {
    const r = computeSleep([], "2026-05-01", cfg);
    expect(r.value).toBe(0);
    expect(r.reason).toMatch(/no sleep/i);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test -- src/scoring/__tests__/sleep.test.ts`

- [ ] **Step 3: Implement**

`src/scoring/subScores/sleep.ts`:

```ts
import type { ScoringConfig, SubScore } from "../types";

export function computeSleep(
  sleepHours: Array<{ date: string; hours: number }>,
  asOfDate: string,
  cfg: ScoringConfig,
): SubScore {
  const target = cfg.sleep.targetHoursPerNight;
  const penalty = cfg.sleep.debtPenaltyPerHour;
  const end = new Date(asOfDate + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  let total = 0;
  let nights = 0;
  for (const log of sleepHours) {
    const t = new Date(log.date + "T00:00:00Z").getTime();
    if (t < start.getTime() || t > end.getTime()) continue;
    total += log.hours;
    nights++;
  }
  if (nights === 0) {
    return { value: 0, weight: 0, reason: "No sleep logs in last 7 days" };
  }
  const targetTotal = 7 * target;
  const debt = Math.max(0, targetTotal - total);
  const value = Math.max(0, Math.min(100, 100 - debt * penalty));
  return {
    value: Math.round(value),
    weight: 0,
    reason: debt > 0 ? `${debt.toFixed(1)}h sleep debt vs ${target}h target` : "On target",
  };
}
```

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/scoring/subScores/sleep.ts src/scoring/__tests__/sleep.test.ts
git commit -m "feat(scoring): sleep sub-score with 7d debt"
```

---

### Task 4: Weight Cut sub-score

**Files:**
- Create: `src/scoring/subScores/weightCut.ts`
- Create: `src/scoring/__tests__/weightCut.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeWeightCut } from "../subScores/weightCut";
import { ScoringConfigV1 } from "../config/v1";

const cfg = ScoringConfigV1;

describe("computeWeightCut", () => {
  it("returns 100 when rate is in sustainable band (0.7%/wk)", () => {
    // 80kg → 79.44kg over 7 days = 0.7% loss
    const weights = [
      { date: "2026-04-24", weightKg: 80 },
      { date: "2026-05-01", weightKg: 79.44 },
    ];
    const r = computeWeightCut(
      { weights, startingWeightKg: 80, goalWeightKg: 75, campStartDate: "2026-04-24", fightDate: "2026-06-24" },
      "2026-05-01",
      cfg,
    );
    expect(r.value).toBeGreaterThanOrEqual(90);
  });
  it("penalises dangerous cut rate (>2%/wk)", () => {
    const weights = [
      { date: "2026-04-24", weightKg: 80 },
      { date: "2026-05-01", weightKg: 78 }, // 2.5% in a week
    ];
    const r = computeWeightCut(
      { weights, startingWeightKg: 80, goalWeightKg: 75, campStartDate: "2026-04-24", fightDate: "2026-06-24" },
      "2026-05-01",
      cfg,
    );
    expect(r.value).toBeLessThanOrEqual(30);
  });
  it("returns 50 when no weight data yet", () => {
    const r = computeWeightCut(
      { weights: [], startingWeightKg: 80, goalWeightKg: 75, campStartDate: "2026-04-24", fightDate: "2026-06-24" },
      "2026-05-01",
      cfg,
    );
    expect(r.value).toBe(50);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

`src/scoring/subScores/weightCut.ts`:

```ts
import type { ScoringConfig, SubScore } from "../types";

type Input = {
  weights: Array<{ date: string; weightKg: number }>;
  startingWeightKg: number | null;
  goalWeightKg: number | null;
  campStartDate: string | null;
  fightDate: string | null;
};

function daysBetween(a: string, b: string): number {
  return (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / (1000 * 60 * 60 * 24);
}

export function computeWeightCut(input: Input, asOfDate: string, cfg: ScoringConfig): SubScore {
  const { weights, startingWeightKg, goalWeightKg, campStartDate, fightDate } = input;
  if (!startingWeightKg || !goalWeightKg || !campStartDate) {
    return { value: 50, weight: 0, reason: "Camp data incomplete" };
  }
  if (weights.length === 0) {
    return { value: 50, weight: 0, reason: "No weight logs yet" };
  }
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const current = sorted[sorted.length - 1];
  const daysElapsed = Math.max(1, daysBetween(campStartDate, current.date));
  const weeksElapsed = daysElapsed / 7;
  const kgLost = startingWeightKg - current.weightKg;
  const ratePctPerWeek = (kgLost / startingWeightKg / weeksElapsed) * 100;

  const c = cfg.weightCut;
  const [lo, hi] = c.sustainableRatePctPerWeek;
  let value: number;
  if (ratePctPerWeek <= 0) {
    value = 30; // gaining weight
  } else if (ratePctPerWeek >= lo && ratePctPerWeek <= hi) {
    value = 100;
  } else if (ratePctPerWeek < lo) {
    value = 60 + (ratePctPerWeek / lo) * 40;
  } else if (ratePctPerWeek <= c.decayEdgePct) {
    value = 100 - ((ratePctPerWeek - hi) / (c.decayEdgePct - hi)) * 50;
  } else if (ratePctPerWeek <= c.dangerEdgePct) {
    value = 50 - ((ratePctPerWeek - c.decayEdgePct) / (c.dangerEdgePct - c.decayEdgePct)) * 30;
  } else {
    value = 20;
  }

  // On-pace check: if we won't hit goalWeight by fightDate at current rate, deduct.
  if (fightDate) {
    const daysToFight = daysBetween(asOfDate, fightDate);
    const kgRemaining = current.weightKg - goalWeightKg;
    if (kgRemaining > 0 && daysToFight > 0) {
      const requiredKgPerDay = kgRemaining / daysToFight;
      const observedKgPerDay = kgLost / daysElapsed;
      if (observedKgPerDay < requiredKgPerDay * 0.7) {
        value -= c.onPaceMissPenalty;
      }
    }
  }

  value = Math.max(0, Math.min(100, value));
  return {
    value: Math.round(value),
    weight: 0,
    reason: `${ratePctPerWeek.toFixed(2)}%/wk (target ${lo}–${hi}%)`,
  };
}
```

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/scoring/subScores/weightCut.ts src/scoring/__tests__/weightCut.test.ts
git commit -m "feat(scoring): weight cut sub-score with rate + on-pace check"
```

---

### Task 5: Wellness sub-score (Hooper)

**Files:**
- Create: `src/scoring/subScores/wellness.ts`
- Create: `src/scoring/__tests__/wellness.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeWellness } from "../subScores/wellness";
import { ScoringConfigV1 } from "../config/v1";

describe("computeWellness", () => {
  it("returns 100 when Hooper is at floor (4)", () => {
    const data = Array.from({ length: 7 }, (_, i) => {
      const d = new Date("2026-05-01"); d.setDate(d.getDate() - i);
      return { date: d.toISOString().slice(0, 10), hooper: 4 };
    });
    const r = computeWellness(data, "2026-05-01", ScoringConfigV1);
    expect(r.value).toBe(100);
  });
  it("decreases linearly as Hooper rises", () => {
    const data = Array.from({ length: 7 }, (_, i) => {
      const d = new Date("2026-05-01"); d.setDate(d.getDate() - i);
      return { date: d.toISOString().slice(0, 10), hooper: 14 };
    });
    const r = computeWellness(data, "2026-05-01", ScoringConfigV1);
    expect(r.value).toBe(58); // 100 - (14-4)*4.2 = 58
  });
  it("returns 50 fallback with no check-ins", () => {
    const r = computeWellness([], "2026-05-01", ScoringConfigV1);
    expect(r.value).toBe(50);
    expect(r.reason).toMatch(/no.*check-in/i);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

`src/scoring/subScores/wellness.ts`:

```ts
import type { ScoringConfig, SubScore } from "../types";

export function computeWellness(
  hooperByDate: Array<{ date: string; hooper: number }>,
  asOfDate: string,
  cfg: ScoringConfig,
): SubScore {
  const end = new Date(asOfDate + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const valid = hooperByDate
    .filter((d) => {
      const t = new Date(d.date + "T00:00:00Z").getTime();
      return t >= start.getTime() && t <= end.getTime();
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (valid.length === 0) {
    return { value: 50, weight: 0, reason: "No wellness check-ins in 7 days" };
  }

  // EMA over available days
  const alpha = 2 / (valid.length + 1);
  let ema = valid[0].hooper;
  for (let i = 1; i < valid.length; i++) ema = alpha * valid[i].hooper + (1 - alpha) * ema;

  const { hooperFloor, hooperScalar } = cfg.wellness;
  const value = Math.max(0, Math.min(100, 100 - (ema - hooperFloor) * hooperScalar));
  return {
    value: Math.round(value),
    weight: 0,
    reason: `Hooper EMA ${ema.toFixed(1)} (lower is better, floor ${hooperFloor})`,
  };
}
```

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/scoring/subScores/wellness.ts src/scoring/__tests__/wellness.test.ts
git commit -m "feat(scoring): wellness sub-score from Hooper EMA"
```

---

### Task 6: Nutrition Adherence sub-score

**Files:**
- Create: `src/scoring/subScores/nutritionAdherence.ts`
- Create: `src/scoring/__tests__/nutritionAdherence.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeNutritionAdherence } from "../subScores/nutritionAdherence";
import { ScoringConfigV1 } from "../config/v1";

const cfg = ScoringConfigV1;

function dayMeals(date: string, calories: number, proteinG: number) {
  return { date, calories, proteinG };
}

describe("computeNutritionAdherence", () => {
  it("returns 100 when all 7 days hit calorie target within tolerance and protein met", () => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date("2026-05-01"); d.setDate(d.getDate() - i);
      return dayMeals(d.toISOString().slice(0, 10), 2500, 180);
    });
    const r = computeNutritionAdherence(
      days, { calories: 2500, proteinG: 180 }, "2026-05-01", cfg,
    );
    expect(r.value).toBe(100);
  });
  it("penalises protein shortfall — 7 days at 50% protein → big deduction", () => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date("2026-05-01"); d.setDate(d.getDate() - i);
      return dayMeals(d.toISOString().slice(0, 10), 2500, 90);
    });
    const r = computeNutritionAdherence(
      days, { calories: 2500, proteinG: 180 }, "2026-05-01", cfg,
    );
    expect(r.value).toBe(100 - 7 * cfg.nutrition.proteinPenaltyPerDay);
  });
  it("returns 0 when no meals logged and targets exist", () => {
    const r = computeNutritionAdherence(
      [], { calories: 2500, proteinG: 180 }, "2026-05-01", cfg,
    );
    expect(r.value).toBe(0);
  });
  it("returns 50 fallback when no targets configured", () => {
    const r = computeNutritionAdherence([], { calories: null, proteinG: null }, "2026-05-01", cfg);
    expect(r.value).toBe(50);
    expect(r.reason).toMatch(/target/i);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

`src/scoring/subScores/nutritionAdherence.ts`:

```ts
import type { ScoringConfig, SubScore } from "../types";

export function computeNutritionAdherence(
  meals: Array<{ date: string; calories: number; proteinG: number }>,
  targets: { calories: number | null; proteinG: number | null },
  asOfDate: string,
  cfg: ScoringConfig,
): SubScore {
  if (!targets.calories || !targets.proteinG) {
    return { value: 50, weight: 0, reason: "No calorie/protein targets configured" };
  }
  const end = new Date(asOfDate + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);

  const byDay = new Map<string, { calories: number; proteinG: number }>();
  for (const m of meals) {
    const t = new Date(m.date + "T00:00:00Z").getTime();
    if (t < start.getTime() || t > end.getTime()) continue;
    const cur = byDay.get(m.date) ?? { calories: 0, proteinG: 0 };
    cur.calories += m.calories;
    cur.proteinG += m.proteinG;
    byDay.set(m.date, cur);
  }

  const tolerance = cfg.nutrition.calorieToleranceFraction;
  const proteinPct = cfg.nutrition.proteinShortfallThresholdPct;
  let daysHitCalories = 0;
  let daysProteinShort = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const day = byDay.get(key);
    if (!day) {
      daysProteinShort++;
      continue;
    }
    const calorieMin = targets.calories * (1 - tolerance);
    const calorieMax = targets.calories * (1 + tolerance);
    if (day.calories >= calorieMin && day.calories <= calorieMax) daysHitCalories++;
    if (day.proteinG < targets.proteinG * (proteinPct / 100)) daysProteinShort++;
  }

  const calorieScore = (daysHitCalories / 7) * 100;
  const proteinPenalty = daysProteinShort * cfg.nutrition.proteinPenaltyPerDay;
  const value = Math.max(0, Math.min(100, calorieScore - proteinPenalty));
  return {
    value: Math.round(value),
    weight: 0,
    reason: `${daysHitCalories}/7 days on target; ${daysProteinShort} low-protein day(s)`,
  };
}
```

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/scoring/subScores/nutritionAdherence.ts src/scoring/__tests__/nutritionAdherence.test.ts
git commit -m "feat(scoring): nutrition adherence sub-score"
```

---

### Task 7: Phase weights, ceilings, camp age

**Files:**
- Create: `src/scoring/phaseWeights.ts`
- Create: `src/scoring/ceilings.ts`
- Create: `src/scoring/campAge.ts`
- Create: `src/scoring/__tests__/phaseWeights.test.ts`
- Create: `src/scoring/__tests__/ceilings.test.ts`
- Create: `src/scoring/__tests__/campAge.test.ts`

- [ ] **Step 1: Write failing tests**

`src/scoring/__tests__/phaseWeights.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolvePhase, weightsForPhase } from "../phaseWeights";
import { ScoringConfigV1 } from "../config/v1";

describe("phase resolution", () => {
  it("returns 'build' when >14 days to fight", () => {
    expect(resolvePhase("2026-05-01", "2026-06-01", ScoringConfigV1)).toBe("build");
  });
  it("returns 'peak' when 7–14 days to fight", () => {
    expect(resolvePhase("2026-05-01", "2026-05-12", ScoringConfigV1)).toBe("peak");
  });
  it("returns 'fightWeek' when ≤7 days to fight", () => {
    expect(resolvePhase("2026-05-01", "2026-05-05", ScoringConfigV1)).toBe("fightWeek");
  });
  it("weightsForPhase returns the right map", () => {
    const w = weightsForPhase("fightWeek", ScoringConfigV1);
    expect(w.weightCut).toBe(0.40);
  });
});
```

`src/scoring/__tests__/ceilings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyCeilings } from "../ceilings";
import { ScoringConfigV1 } from "../config/v1";

describe("applyCeilings", () => {
  it("caps at 50 when weight cut is dangerous", () => {
    const r = applyCeilings(80, {
      weightCutDangerousDays: 3,
      sleepDebt7d: 0,
      acwr: 1.0,
    }, ScoringConfigV1);
    expect(r.score).toBe(50);
    expect(r.applied?.ruleId).toBe("weight_cut_dangerous");
  });
  it("does not cap when no flags", () => {
    const r = applyCeilings(75, { weightCutDangerousDays: 0, sleepDebt7d: 5, acwr: 1.0 }, ScoringConfigV1);
    expect(r.score).toBe(75);
    expect(r.applied).toBeNull();
  });
  it("picks the lowest cap when multiple apply", () => {
    const r = applyCeilings(90, { weightCutDangerousDays: 3, sleepDebt7d: 12, acwr: 2.0 }, ScoringConfigV1);
    expect(r.score).toBe(45);
    expect(r.applied?.ruleId).toBe("training_spike");
  });
});
```

`src/scoring/__tests__/campAge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeCampAge } from "../campAge";
import { ScoringConfigV1 } from "../config/v1";

describe("computeCampAge", () => {
  it("zero when actual progress matches expected", () => {
    const r = computeCampAge({
      campStartDate: "2026-04-01",
      fightDate: "2026-06-01",
      asOfDate: "2026-05-01",
      startingWeightKg: 80,
      goalWeightKg: 75,
      currentWeightKg: 77.5, // 50% there at 50% through
    }, ScoringConfigV1);
    expect(r?.weeksAhead).toBe(0);
  });
  it("positive when ahead of schedule", () => {
    const r = computeCampAge({
      campStartDate: "2026-04-01",
      fightDate: "2026-06-01",
      asOfDate: "2026-05-01",
      startingWeightKg: 80,
      goalWeightKg: 75,
      currentWeightKg: 76,
    }, ScoringConfigV1);
    expect(r?.weeksAhead).toBeGreaterThan(0);
  });
  it("returns null when camp data missing", () => {
    expect(computeCampAge({
      campStartDate: null, fightDate: null, asOfDate: "2026-05-01",
      startingWeightKg: null, goalWeightKg: null, currentWeightKg: null,
    }, ScoringConfigV1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement phase weights**

`src/scoring/phaseWeights.ts`:

```ts
import type { ScoringConfig, ScoringPhase, SubScoreKey } from "./types";

export function resolvePhase(asOfDate: string, fightDate: string, cfg: ScoringConfig): ScoringPhase {
  const days = (new Date(fightDate + "T00:00:00Z").getTime() - new Date(asOfDate + "T00:00:00Z").getTime()) / (1000 * 60 * 60 * 24);
  if (days <= cfg.phaseThresholdsDays.fightWeek) return "fightWeek";
  if (days <= cfg.phaseThresholdsDays.peak) return "peak";
  return "build";
}

export function weightsForPhase(phase: ScoringPhase, cfg: ScoringConfig): Record<SubScoreKey, number> {
  return cfg.weights[phase];
}
```

- [ ] **Step 4: Implement ceilings**

`src/scoring/ceilings.ts`:

```ts
import type { ScoringConfig } from "./types";

export type CeilingSignals = {
  weightCutDangerousDays: number;  // consecutive days >2%/wk
  sleepDebt7d: number;             // hours
  acwr: number;
};

export function applyCeilings(
  score: number,
  signals: CeilingSignals,
  cfg: ScoringConfig,
): { score: number; applied: { ruleId: string; cap: number } | null } {
  const caps: Array<{ ruleId: string; cap: number }> = [];
  for (const rule of cfg.ceilings) {
    let trigger = false;
    if (rule.id === "weight_cut_dangerous" && signals.weightCutDangerousDays >= 3) trigger = true;
    if (rule.id === "sleep_debt" && signals.sleepDebt7d > 10) trigger = true;
    if (rule.id === "training_spike" && signals.acwr > 1.8) trigger = true;
    if (trigger) caps.push(rule);
  }
  if (caps.length === 0) return { score, applied: null };
  const tightest = caps.reduce((min, c) => (c.cap < min.cap ? c : min), caps[0]);
  return { score: Math.min(score, tightest.cap), applied: tightest };
}
```

- [ ] **Step 5: Implement camp age**

`src/scoring/campAge.ts`:

```ts
import type { ScoringConfig } from "./types";

type Input = {
  campStartDate: string | null;
  fightDate: string | null;
  asOfDate: string;
  startingWeightKg: number | null;
  goalWeightKg: number | null;
  currentWeightKg: number | null;
};

function daysBetween(a: string, b: string): number {
  return (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / (1000 * 60 * 60 * 24);
}

export function computeCampAge(input: Input, cfg: ScoringConfig): { weeksAhead: number } | null {
  const { campStartDate, fightDate, asOfDate, startingWeightKg, goalWeightKg, currentWeightKg } = input;
  if (!campStartDate || !fightDate || !startingWeightKg || !goalWeightKg || currentWeightKg == null) return null;
  const campLengthDays = Math.max(1, daysBetween(campStartDate, fightDate));
  const daysElapsed = Math.max(0, daysBetween(campStartDate, asOfDate));
  const campLengthWeeks = campLengthDays / 7;
  const expectedPct = Math.min(1, daysElapsed / campLengthDays);
  const totalCut = startingWeightKg - goalWeightKg;
  if (totalCut <= 0) return { weeksAhead: 0 };
  const actualPct = Math.min(1, (startingWeightKg - currentWeightKg) / totalCut);
  let weeksAhead = (actualPct - expectedPct) * campLengthWeeks;
  const max = cfg.campAge.maxWeeksDisplay;
  weeksAhead = Math.max(-max, Math.min(max, weeksAhead));
  return { weeksAhead: Math.round(weeksAhead * 10) / 10 };
}
```

- [ ] **Step 6: Run all tests, expect PASS**

Run: `npm test -- src/scoring/__tests__/`

- [ ] **Step 7: Commit**

```bash
git add src/scoring/phaseWeights.ts src/scoring/ceilings.ts src/scoring/campAge.ts src/scoring/__tests__/phaseWeights.test.ts src/scoring/__tests__/ceilings.test.ts src/scoring/__tests__/campAge.test.ts
git commit -m "feat(scoring): phase weights, soft ceilings, camp age"
```

---

### Task 8: Compose function (the orchestrator)

**Files:**
- Create: `src/scoring/compose.ts`
- Create: `src/scoring/__tests__/compose.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeFightFormScore } from "../compose";
import { ScoringConfigV1 } from "../config/v1";
import type { ScoringInputs } from "../types";

const baseInputs = (overrides: Partial<ScoringInputs> = {}): ScoringInputs => ({
  date: "2026-05-01",
  fightDate: "2026-06-15",
  campStartDate: "2026-04-01",
  startingWeightKg: 80,
  goalWeightKg: 75,
  currentWeightKg: 77.5,
  sessions: Array.from({ length: 28 }, (_, i) => {
    const d = new Date("2026-05-01"); d.setDate(d.getDate() - i);
    return { date: d.toISOString().slice(0, 10), rpe: 7, durationMinutes: 45 };
  }),
  sleepHours: Array.from({ length: 7 }, (_, i) => {
    const d = new Date("2026-05-01"); d.setDate(d.getDate() - i);
    return { date: d.toISOString().slice(0, 10), hours: 8 };
  }),
  weights: [
    { date: "2026-04-01", weightKg: 80 },
    { date: "2026-05-01", weightKg: 77.5 },
  ],
  hooperByDate: Array.from({ length: 7 }, (_, i) => {
    const d = new Date("2026-05-01"); d.setDate(d.getDate() - i);
    return { date: d.toISOString().slice(0, 10), hooper: 8 };
  }),
  meals: Array.from({ length: 7 }, (_, i) => {
    const d = new Date("2026-05-01"); d.setDate(d.getDate() - i);
    return { date: d.toISOString().slice(0, 10), calories: 2500, proteinG: 180 };
  }),
  targets: { calories: 2500, proteinG: 180 },
  priorRawScores: [],
  ...overrides,
});

describe("computeFightFormScore", () => {
  it("returns ok state with score in 0–100", () => {
    const r = computeFightFormScore(baseInputs(), ScoringConfigV1);
    expect(r.state).toBe("ok");
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.algorithmVersion).toBe("1.0.0");
  });
  it("returns no_camp when fightDate is null", () => {
    const r = computeFightFormScore(baseInputs({ fightDate: null, campStartDate: null }), ScoringConfigV1);
    expect(r.state).toBe("no_camp");
  });
  it("returns calibrating when data is sparse", () => {
    const r = computeFightFormScore(baseInputs({ sleepHours: [], weights: [], sessions: [], hooperByDate: [], meals: [] }), ScoringConfigV1);
    expect(r.state).toBe("calibrating");
  });
  it("applies EMA smoothing using priorRawScores", () => {
    const r = computeFightFormScore(baseInputs({ priorRawScores: [{ date: "2026-04-30", rawScore: 60 }, { date: "2026-04-29", rawScore: 50 }] }), ScoringConfigV1);
    expect(r.score).not.toBe(r.rawScore);
  });
  it("identifies topDriver and topLimiter", () => {
    const r = computeFightFormScore(baseInputs(), ScoringConfigV1);
    expect(r.topDriver).toBeDefined();
    expect(r.topLimiter).toBeDefined();
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement compose**

`src/scoring/compose.ts`:

```ts
import type { FightFormScore, ScoringConfig, ScoringInputs, SubScoreKey } from "./types";
import { computeTrainingLoad } from "./subScores/trainingLoad";
import { computeSleep } from "./subScores/sleep";
import { computeWeightCut } from "./subScores/weightCut";
import { computeWellness } from "./subScores/wellness";
import { computeNutritionAdherence } from "./subScores/nutritionAdherence";
import { resolvePhase, weightsForPhase } from "./phaseWeights";
import { applyCeilings } from "./ceilings";
import { computeCampAge } from "./campAge";

function countDistinctDaysOfData(inputs: ScoringInputs): number {
  const days = new Set<string>();
  for (const x of [...inputs.sleepHours, ...inputs.weights, ...inputs.sessions, ...inputs.hooperByDate, ...inputs.meals]) {
    days.add(x.date);
  }
  return days.size;
}

function emaSmooth(rawToday: number, prior: Array<{ date: string; rawScore: number }>, days: number): number {
  if (prior.length === 0) return rawToday;
  const series = [...prior.sort((a, b) => a.date.localeCompare(b.date)).slice(-(days - 1)).map((p) => p.rawScore), rawToday];
  const alpha = 2 / (days + 1);
  let v = series[0];
  for (let i = 1; i < series.length; i++) v = alpha * series[i] + (1 - alpha) * v;
  return v;
}

function pickLabel(score: number, cfg: ScoringConfig): FightFormScore["label"] {
  const t = cfg.labelThresholds;
  if (score >= t.sharp) return "sharp";
  if (score >= t.sharpening) return "sharpening";
  if (score >= t.offPace) return "off_pace";
  return "at_risk";
}

function consecutiveDangerousDays(
  weights: Array<{ date: string; weightKg: number }>,
  startingWeightKg: number | null,
  campStartDate: string | null,
  cfg: ScoringConfig,
): number {
  if (!startingWeightKg || !campStartDate) return 0;
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return 0;
  let consecutive = 0;
  for (let i = sorted.length - 1; i > 0; i--) {
    const prior = sorted[i - 1];
    const cur = sorted[i];
    const days = (new Date(cur.date + "T00:00:00Z").getTime() - new Date(prior.date + "T00:00:00Z").getTime()) / 86400000;
    if (days <= 0) continue;
    const pctPerWeek = ((prior.weightKg - cur.weightKg) / startingWeightKg / (days / 7)) * 100;
    if (pctPerWeek > cfg.weightCut.dangerEdgePct) consecutive++;
    else break;
  }
  return consecutive;
}

function sleepDebt7d(
  sleep: Array<{ date: string; hours: number }>,
  asOfDate: string,
  cfg: ScoringConfig,
): number {
  const end = new Date(asOfDate + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  let total = 0;
  for (const s of sleep) {
    const t = new Date(s.date + "T00:00:00Z").getTime();
    if (t >= start.getTime() && t <= end.getTime()) total += s.hours;
  }
  return Math.max(0, 7 * cfg.sleep.targetHoursPerNight - total);
}

function computeAcwr(sessions: ScoringInputs["sessions"], asOfDate: string, cfg: ScoringConfig): number {
  if (sessions.length === 0) return 0;
  const sumLoad = (windowDays: number) => {
    const end = new Date(asOfDate + "T00:00:00Z");
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (windowDays - 1));
    let total = 0;
    for (const s of sessions) {
      const t = new Date(s.date + "T00:00:00Z").getTime();
      if (t >= start.getTime() && t <= end.getTime()) total += s.rpe * s.durationMinutes;
    }
    return total / windowDays;
  };
  const acute = sumLoad(cfg.trainingLoad.acuteWindowDays);
  const chronic = sumLoad(cfg.trainingLoad.chronicWindowDays);
  if (chronic === 0) return acute > 0 ? 999 : 0;
  return acute / chronic;
}

export function computeFightFormScore(inputs: ScoringInputs, cfg: ScoringConfig): FightFormScore {
  if (inputs.isCampPaused) {
    return {
      score: 0, rawScore: 0, label: "off_pace", state: "paused", phase: null,
      campAge: null, subScores: emptySubScores(), topDriver: "weightCut",
      topLimiter: "weightCut", appliedCeiling: null, algorithmVersion: cfg.version,
    };
  }
  if (!inputs.fightDate || !inputs.campStartDate) {
    return {
      score: 0, rawScore: 0, label: "off_pace", state: "no_camp", phase: null,
      campAge: null, subScores: emptySubScores(), topDriver: "weightCut",
      topLimiter: "weightCut", appliedCeiling: null, algorithmVersion: cfg.version,
    };
  }

  const daysOfData = countDistinctDaysOfData(inputs);
  if (daysOfData < cfg.coldStart.minDaysOfDataIn7d) {
    return {
      score: 0, rawScore: 0, label: "off_pace", state: "calibrating", phase: null,
      campAge: null, subScores: emptySubScores(), topDriver: "weightCut",
      topLimiter: "weightCut", appliedCeiling: null, algorithmVersion: cfg.version,
    };
  }

  const phase = resolvePhase(inputs.date, inputs.fightDate, cfg);
  const weights = weightsForPhase(phase, cfg);

  const trainingLoad = computeTrainingLoad(inputs.sessions, inputs.date, cfg);
  const sleep = computeSleep(inputs.sleepHours, inputs.date, cfg);
  const weightCut = computeWeightCut(
    { weights: inputs.weights, startingWeightKg: inputs.startingWeightKg, goalWeightKg: inputs.goalWeightKg, campStartDate: inputs.campStartDate, fightDate: inputs.fightDate },
    inputs.date, cfg,
  );
  const wellness = computeWellness(inputs.hooperByDate, inputs.date, cfg);
  const nutritionAdherence = computeNutritionAdherence(inputs.meals, inputs.targets, inputs.date, cfg);

  const subScores: FightFormScore["subScores"] = {
    trainingLoad: { ...trainingLoad, weight: weights.trainingLoad },
    sleep: { ...sleep, weight: weights.sleep },
    weightCut: { ...weightCut, weight: weights.weightCut },
    wellness: { ...wellness, weight: weights.wellness },
    nutritionAdherence: { ...nutritionAdherence, weight: weights.nutritionAdherence },
  };

  const totalWeight = Object.values(subScores).reduce((a, s) => a + s.weight, 0);
  const rawScore = Object.values(subScores).reduce((a, s) => a + s.value * s.weight, 0) / Math.max(1e-9, totalWeight);

  const ceil = applyCeilings(rawScore, {
    weightCutDangerousDays: consecutiveDangerousDays(inputs.weights, inputs.startingWeightKg, inputs.campStartDate, cfg),
    sleepDebt7d: sleepDebt7d(inputs.sleepHours, inputs.date, cfg),
    acwr: computeAcwr(inputs.sessions, inputs.date, cfg),
  }, cfg);

  const displayed = emaSmooth(ceil.score, inputs.priorRawScores, cfg.smoothing.emaDays);
  const finalScore = Math.round(Math.max(0, Math.min(100, displayed)));

  const contributions = (Object.keys(subScores) as SubScoreKey[]).map((k) => ({
    key: k, contribution: subScores[k].value * subScores[k].weight,
  }));
  const sorted = [...contributions].sort((a, b) => b.contribution - a.contribution);
  const topDriver = sorted[0].key;
  const topLimiter = sorted[sorted.length - 1].key;

  return {
    score: finalScore,
    rawScore: Math.round(ceil.score),
    label: pickLabel(finalScore, cfg),
    state: "ok",
    phase,
    campAge: computeCampAge({
      campStartDate: inputs.campStartDate,
      fightDate: inputs.fightDate,
      asOfDate: inputs.date,
      startingWeightKg: inputs.startingWeightKg,
      goalWeightKg: inputs.goalWeightKg,
      currentWeightKg: inputs.currentWeightKg,
    }, cfg),
    subScores,
    topDriver,
    topLimiter,
    appliedCeiling: ceil.applied,
    algorithmVersion: cfg.version,
  };
}

function emptySubScores(): FightFormScore["subScores"] {
  const empty = { value: 0, weight: 0, reason: "—" };
  return { trainingLoad: empty, sleep: empty, weightCut: empty, wellness: empty, nutritionAdherence: empty };
}
```

- [ ] **Step 4: Run all scoring tests, expect PASS**

Run: `npm test -- src/scoring/`

- [ ] **Step 5: Commit**

```bash
git add src/scoring/compose.ts src/scoring/__tests__/compose.test.ts
git commit -m "feat(scoring): compose Fight Form Score from sub-scores"
```

---

## Phase 2: Convex persistence + compute

### Task 9: Add `fight_form_scores` table to schema

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Read current schema to find insertion point**

Run: `grep -n "defineTable" convex/schema.ts | head -20`

- [ ] **Step 2: Add table definition to schema**

In `convex/schema.ts`, add inside the schema object (alphabetically near other tables):

```ts
fight_form_scores: defineTable({
  userId: v.id("users"),
  date: v.string(),
  campId: v.optional(v.id("fight_camps")),
  rawScore: v.number(),
  displayedScore: v.number(),
  label: v.union(v.literal("sharp"), v.literal("sharpening"), v.literal("off_pace"), v.literal("at_risk")),
  state: v.union(v.literal("ok"), v.literal("calibrating"), v.literal("no_camp"), v.literal("paused")),
  phase: v.optional(v.union(v.literal("build"), v.literal("peak"), v.literal("fightWeek"))),
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
  .index("by_user_date_version", ["userId", "date", "algorithmVersion"]),
```

- [ ] **Step 3: Push schema to dev Convex deployment**

Run: `npx convex dev --once`
Expected: schema deploys without errors.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(convex): add fight_form_scores table"
```

---

### Task 10: Convex query — getToday

**Files:**
- Create: `convex/fightFormScore.ts`

- [ ] **Step 1: Implement getToday**

`convex/fightFormScore.ts` (new file):

```ts
import { v } from "convex/values";
import { query } from "./_generated/server";

function todayInUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const getToday = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, { date }) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) return null;
    const targetDate = date ?? todayInUtc();
    const row = await ctx.db
      .query("fight_form_scores")
      .withIndex("by_user_date", (q) => q.eq("userId", userId as any).eq("date", targetDate))
      .order("desc")
      .first();
    if (row) return row;

    // Synthesize calibrating fallback (no row written).
    return {
      date: targetDate,
      displayedScore: 0,
      rawScore: 0,
      label: "off_pace" as const,
      state: "calibrating" as const,
      phase: null,
      campAge: null,
      subScores: null,
      appliedCeiling: null,
      topDriver: null,
      topLimiter: null,
      algorithmVersion: "1.0.0",
    };
  },
});

export const getHistory = query({
  args: { campId: v.id("fight_camps"), limit: v.optional(v.number()) },
  handler: async (ctx, { campId, limit }) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) return [];
    const rows = await ctx.db
      .query("fight_form_scores")
      .withIndex("by_user_camp", (q) => q.eq("userId", userId as any).eq("campId", campId))
      .order("desc")
      .take(limit ?? 60);
    return rows;
  },
});
```

- [ ] **Step 2: Verify type-check**

Run: `npx convex dev --once`

- [ ] **Step 3: Commit**

```bash
git add convex/fightFormScore.ts
git commit -m "feat(convex): fightFormScore query (getToday + getHistory)"
```

---

### Task 11: Convex internal action — recomputeForUserDate

**Files:**
- Modify: `convex/fightFormScore.ts`
- Create: `convex/fightFormScore_internal.ts`

- [ ] **Step 1: Add internal helpers — fetch inputs**

`convex/fightFormScore_internal.ts`:

```ts
import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const fetchScoringInputs = internalQuery({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    // Active camp = future fightDate, isCompleted false
    const camp = await ctx.db
      .query("fight_camps")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    const activeCamp = camp && !camp.isCompleted ? camp : null;

    const end = new Date(date + "T00:00:00Z");
    const lookbackStart = new Date(end);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 28);
    const lookbackStartIso = lookbackStart.toISOString().slice(0, 10);

    const weights = await ctx.db
      .query("weight_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    const sleep = await ctx.db
      .query("sleep_logs")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    const sessions = await ctx.db
      .query("gym_sessions")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    const wellness = await ctx.db
      .query("daily_wellness_checkins")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();
    const meals = await ctx.db
      .query("meals")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).gte("date", lookbackStartIso))
      .collect();

    // Aggregate meals by day
    const mealsByDay = new Map<string, { date: string; calories: number; proteinG: number }>();
    for (const m of meals) {
      const items = await ctx.db
        .query("meal_items")
        .withIndex("by_meal", (q) => q.eq("mealId", m._id))
        .collect();
      const cal = items.reduce((a, x) => a + (x.calories ?? 0), 0);
      const pro = items.reduce((a, x) => a + (x.proteinG ?? 0), 0);
      const cur = mealsByDay.get(m.date) ?? { date: m.date, calories: 0, proteinG: 0 };
      cur.calories += cal;
      cur.proteinG += pro;
      mealsByDay.set(m.date, cur);
    }

    // Prior raw scores for EMA (last 4 days)
    const priorEnd = new Date(end); priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
    const priorStart = new Date(priorEnd); priorStart.setUTCDate(priorStart.getUTCDate() - 3);
    const priorRaw = await ctx.db
      .query("fight_form_scores")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId)
         .gte("date", priorStart.toISOString().slice(0, 10))
         .lte("date", priorEnd.toISOString().slice(0, 10)),
      )
      .collect();

    return {
      date,
      profile,
      camp: activeCamp,
      weights: weights.map((w) => ({ date: w.date, weightKg: w.weightKg })),
      sleepHours: sleep.map((s) => ({ date: s.date, hours: s.hours })),
      sessions: sessions
        .filter((s) => s.durationMinutes && s.rpe)
        .map((s) => ({ date: s.date, rpe: s.rpe!, durationMinutes: s.durationMinutes! })),
      hooperByDate: wellness
        .filter((w) => w.hooperIndex != null)
        .map((w) => ({ date: w.date, hooper: w.hooperIndex! })),
      meals: Array.from(mealsByDay.values()),
      priorRawScores: priorRaw.map((p) => ({ date: p.date, rawScore: p.rawScore })),
    };
  },
});

export const upsertScore = internalMutation({
  args: {
    userId: v.id("users"),
    date: v.string(),
    campId: v.optional(v.id("fight_camps")),
    score: v.any(),
  },
  handler: async (ctx, { userId, date, campId, score }) => {
    const existing = await ctx.db
      .query("fight_form_scores")
      .withIndex("by_user_date_version", (q) =>
        q.eq("userId", userId).eq("date", date).eq("algorithmVersion", score.algorithmVersion),
      )
      .first();
    const row = {
      userId,
      date,
      campId,
      rawScore: score.rawScore,
      displayedScore: score.score,
      label: score.label,
      state: score.state,
      phase: score.phase ?? undefined,
      subScores: score.subScores,
      appliedCeiling: score.appliedCeiling ?? undefined,
      campAge: score.campAge ?? undefined,
      topDriver: score.topDriver,
      topLimiter: score.topLimiter,
      algorithmVersion: score.algorithmVersion,
      computedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("fight_form_scores", row);
  },
});
```

- [ ] **Step 2: Add the action to `convex/fightFormScore.ts`**

Append to `convex/fightFormScore.ts`:

```ts
import { internalAction, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { computeFightFormScore } from "../src/scoring/compose";
import { CURRENT_CONFIG } from "../src/scoring/config";

export const recomputeForUserDate = internalAction({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    const inputs = await ctx.runQuery(internal.fightFormScore_internal.fetchScoringInputs, { userId, date });
    const scoringInputs = {
      date,
      fightDate: inputs.camp?.fightDate ?? null,
      campStartDate: inputs.camp?._creationTime ? new Date(inputs.camp._creationTime).toISOString().slice(0, 10) : null,
      startingWeightKg: inputs.camp?.startingWeightKg ?? null,
      goalWeightKg: inputs.camp?.endWeightKg ?? inputs.profile?.goalWeightKg ?? null,
      currentWeightKg: inputs.weights.length > 0 ? inputs.weights[inputs.weights.length - 1].weightKg : null,
      isCampPaused: false,
      isCampCompleted: inputs.camp?.isCompleted ?? false,
      sessions: inputs.sessions,
      sleepHours: inputs.sleepHours,
      weights: inputs.weights,
      hooperByDate: inputs.hooperByDate,
      meals: inputs.meals,
      targets: {
        calories: inputs.profile?.aiRecommendedCalories ?? null,
        proteinG: inputs.profile?.aiRecommendedProteinG ?? null,
      },
      priorRawScores: inputs.priorRawScores,
    };
    const score = computeFightFormScore(scoringInputs, CURRENT_CONFIG);
    await ctx.runMutation(internal.fightFormScore_internal.upsertScore, {
      userId,
      date,
      campId: inputs.camp?._id,
      score,
    });
    return score;
  },
});

export const recomputeNow = mutation({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, { date }) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) throw new Error("unauthenticated");
    const target = date ?? new Date().toISOString().slice(0, 10);
    await ctx.scheduler.runAfter(0, internal.fightFormScore.recomputeForUserDate, {
      userId: userId as any,
      date: target,
    });
  },
});
```

- [ ] **Step 3: Type-check**

Run: `npx convex dev --once`

- [ ] **Step 4: Commit**

```bash
git add convex/fightFormScore.ts convex/fightFormScore_internal.ts
git commit -m "feat(convex): recompute action for fight form score"
```

---

### Task 12: Debounced on-write recompute hooks

**Files:**
- Modify: `convex/weight_logs.ts`
- Modify: `convex/sleep_logs.ts`
- Modify: `convex/gym_sessions.ts` (only completeSession path)
- Modify: `convex/meals.ts`
- Modify: `convex/wellness.ts`

- [ ] **Step 1: Add helper in fightFormScore.ts**

Append to `convex/fightFormScore.ts`:

```ts
export const scheduleRecompute = internalAction({
  args: { userId: v.id("users"), date: v.string() },
  handler: async (ctx, { userId, date }) => {
    await ctx.runAction(internal.fightFormScore.recomputeForUserDate, { userId, date });
  },
});
```

- [ ] **Step 2: Hook source mutations**

For each of `weight_logs.ts`, `sleep_logs.ts`, `meals.ts`, `wellness.ts`, and the `completeSession` path in `gym_sessions.ts`, after the existing upsert/insert returns, add:

```ts
await ctx.scheduler.runAfter(5_000, internal.fightFormScore.recomputeForUserDate, {
  userId,
  date: args.date,
});
```

Read each file first to find the exact insertion point (end of handler, before return).

- [ ] **Step 3: Type-check + smoke test**

Run: `npx convex dev --once`
Then in app, log a weight → verify a `fight_form_scores` row appears within 10s for that user/date in Convex dashboard.

- [ ] **Step 4: Commit**

```bash
git add convex/
git commit -m "feat(convex): debounced recompute on data writes"
```

---

### Task 13: Daily cron

**Files:**
- Modify: `convex/crons.ts`

- [ ] **Step 1: Read existing crons.ts**

Run: `cat convex/crons.ts`

- [ ] **Step 2: Add hourly cron + scheduler**

Append to `convex/crons.ts`:

```ts
import { internal } from "./_generated/api";

crons.hourly(
  "fight-form-score-daily",
  { minuteUTC: 5 },
  internal.fightFormScore.scheduleDailyRecomputeAcrossUsers,
);
```

- [ ] **Step 3: Add the dispatch action in fightFormScore.ts**

Append to `convex/fightFormScore.ts`:

```ts
export const scheduleDailyRecomputeAcrossUsers = internalAction({
  args: {},
  handler: async (ctx) => {
    // Hourly fan-out: process all users with active camps whose local 4am window includes "now".
    // V1 simplification: process all active-camp users every 24h at UTC 04:05 by checking UTC hour.
    const nowUtcHour = new Date().getUTCHours();
    if (nowUtcHour !== 4) return; // only run actual recompute once/day for v1
    const profiles = await ctx.runQuery(internal.fightFormScore_internal.listActiveCampUserIds, {});
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const date = yesterday.toISOString().slice(0, 10);
    for (const userId of profiles) {
      await ctx.runAction(internal.fightFormScore.recomputeForUserDate, { userId, date });
    }
  },
});
```

- [ ] **Step 4: Add the listActiveCampUserIds internalQuery**

Append to `convex/fightFormScore_internal.ts`:

```ts
import { Id } from "./_generated/dataModel";

export const listActiveCampUserIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Id<"users">>> => {
    const camps = await ctx.db.query("fight_camps").collect();
    const active = camps.filter((c) => !c.isCompleted);
    const userIds = Array.from(new Set(active.map((c) => c.userId)));
    return userIds;
  },
});
```

- [ ] **Step 5: Type-check**

Run: `npx convex dev --once`

- [ ] **Step 6: Commit**

```bash
git add convex/crons.ts convex/fightFormScore.ts convex/fightFormScore_internal.ts
git commit -m "feat(convex): daily cron for fight form score recompute"
```

---

### Task 14: Backfill action

**Files:**
- Modify: `convex/fightFormScore.ts`

- [ ] **Step 1: Add backfill action**

Append to `convex/fightFormScore.ts`:

```ts
export const backfillLast30Days = internalAction({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, { userId }) => {
    const ids: any[] = userId
      ? [userId]
      : await ctx.runQuery(internal.fightFormScore_internal.listActiveCampUserIds, {});
    for (const id of ids) {
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        const date = d.toISOString().slice(0, 10);
        await ctx.runAction(internal.fightFormScore.recomputeForUserDate, { userId: id, date });
      }
    }
  },
});
```

- [ ] **Step 2: Type-check and dry-run**

Run: `npx convex dev --once`
Manually invoke via Convex dashboard with a beta test user. Verify rows appear.

- [ ] **Step 3: Commit**

```bash
git add convex/fightFormScore.ts
git commit -m "feat(convex): 30-day backfill action"
```

---

## Phase 3: Dashboard UI rebuild

### Task 15: FightFormRing component

**Files:**
- Create: `src/components/dashboard/FightFormRing.tsx`

- [ ] **Step 1: Implement the ring**

```tsx
import { cn } from "@/lib/utils";

type Props = {
  score: number;
  label: "sharp" | "sharpening" | "off_pace" | "at_risk";
  state: "ok" | "calibrating" | "no_camp" | "paused";
  calibratingDays?: { current: number; needed: number };
  onTap?: () => void;
  size?: number;
};

const LABEL_COPY = {
  sharp: "Sharp",
  sharpening: "Sharpening",
  off_pace: "Off Pace",
  at_risk: "At Risk",
};

const LABEL_COLOR = {
  sharp: "from-emerald-400 to-emerald-600",
  sharpening: "from-amber-300 to-amber-500",
  off_pace: "from-orange-400 to-orange-600",
  at_risk: "from-rose-500 to-rose-700",
};

export function FightFormRing({ score, label, state, calibratingDays, onTap, size = 220 }: Props) {
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress =
    state === "ok" ? score / 100 :
    state === "calibrating" && calibratingDays ? calibratingDays.current / calibratingDays.needed :
    0;
  const dash = circumference * progress;

  return (
    <button
      type="button"
      onClick={onTap}
      className="relative flex flex-col items-center justify-center"
      aria-label="Open Fight Form Score details"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="hsl(var(--muted))" strokeWidth={10} fill="none" />
        <defs>
          <linearGradient id="ff-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="currentColor" className={cn("opacity-100", state === "ok" && `text-${LABEL_COLOR[label].split(" ")[0].replace("from-", "")}`)} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ff-grad)"
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className={cn(
            "transition-all duration-700",
            state === "ok" && `bg-gradient-to-br ${LABEL_COLOR[label]}`,
            state !== "ok" && "text-muted-foreground",
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {state === "ok" && (
          <>
            <span className="display-number text-5xl">{score}</span>
            <span className="section-header mt-1">{LABEL_COPY[label]}</span>
          </>
        )}
        {state === "calibrating" && calibratingDays && (
          <>
            <span className="display-number text-3xl">{calibratingDays.current}/{calibratingDays.needed}</span>
            <span className="section-header mt-1">Calibrating</span>
          </>
        )}
        {state === "no_camp" && (
          <>
            <span className="text-base text-muted-foreground text-center px-6">Start a fight camp to unlock</span>
          </>
        )}
        {state === "paused" && (
          <>
            <span className="display-number text-3xl">—</span>
            <span className="section-header mt-1">Paused</span>
          </>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/FightFormRing.tsx
git commit -m "feat(dashboard): FightFormRing hero component"
```

---

### Task 16: FightFormStatChips component

**Files:**
- Create: `src/components/dashboard/FightFormStatChips.tsx`

- [ ] **Step 1: Implement**

```tsx
type Props = {
  weight: { current: number; goal: number; pctComplete: number } | null;
  campAge: { weeksAhead: number } | null;
};

export function FightFormStatChips({ weight, campAge }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 px-1">
      <div className="card-surface rounded-2xl p-3">
        <div className="section-header mb-1">Weight</div>
        {weight ? (
          <>
            <div className="display-number text-base">
              {weight.current.toFixed(1)} → {weight.goal.toFixed(1)} kg
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {Math.round(weight.pctComplete * 100)}% complete
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Log a weight to begin</div>
        )}
      </div>
      <div className="card-surface rounded-2xl p-3">
        <div className="section-header mb-1">Camp Age</div>
        {campAge ? (
          <>
            <div className="display-number text-base">
              {campAge.weeksAhead === 0 ? "On pace" : `${campAge.weeksAhead > 0 ? "+" : ""}${campAge.weeksAhead.toFixed(1)} wks`}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {campAge.weeksAhead >= 0 ? "ahead of schedule" : "behind schedule"}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">—</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/FightFormStatChips.tsx
git commit -m "feat(dashboard): FightFormStatChips below the hero ring"
```

---

### Task 17: TodayPanel component

**Files:**
- Create: `src/components/dashboard/TodayPanel.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";

type Adherence = {
  weight: boolean;
  training: boolean;
  sleep: boolean;
  wellnessCheckin: boolean;
};

type Props = {
  adherence: Adherence;
  nextWorkout?: { title: string; timeLabel: string; href: string } | null;
};

const ITEMS: Array<{ key: keyof Adherence; label: string; href: string }> = [
  { key: "weight", label: "Weight", href: "/weight" },
  { key: "training", label: "Training", href: "/training" },
  { key: "sleep", label: "Sleep", href: "/sleep" },
  { key: "wellnessCheckin", label: "Check-in", href: "/wellness" },
];

export function TodayPanel({ adherence, nextWorkout }: Props) {
  const allDone = ITEMS.every((i) => adherence[i.key]);
  return (
    <div className="card-surface rounded-2xl p-3">
      <div className="flex items-center justify-between">
        <div className="section-header">Today</div>
        {allDone && <span className="text-xs text-emerald-400">All set</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        {ITEMS.map((it) => (
          <Link
            key={it.key}
            to={it.href}
            className="flex items-center gap-2 rounded-lg py-1.5 px-2 hover:bg-muted/40 transition"
          >
            {adherence[it.key]
              ? <CheckCircle2 className="size-4 text-emerald-400" />
              : <Circle className="size-4 text-muted-foreground" />}
            <span className="text-sm">{it.label}</span>
          </Link>
        ))}
      </div>
      {nextWorkout && (
        <Link to={nextWorkout.href} className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
          <div>
            <div className="text-xs text-muted-foreground">Next</div>
            <div className="text-sm">{nextWorkout.title} · {nextWorkout.timeLabel}</div>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/TodayPanel.tsx
git commit -m "feat(dashboard): TodayPanel adherence + next workout"
```

---

### Task 18: FightFormScoreSheet component

**Files:**
- Create: `src/components/dashboard/FightFormScoreSheet.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

type SubScore = { value: number; weight: number; reason: string };

type Props = {
  open: boolean;
  onClose: () => void;
  score: number;
  label: string;
  phase: string | null;
  daysToFight: number | null;
  campAge: { weeksAhead: number } | null;
  subScores: Record<string, SubScore> | null;
  topDriver: string | null;
  topLimiter: string | null;
  appliedCeiling: { ruleId: string; cap: number } | null;
  coachNarrative?: string | null;
  actionItems?: string[];
  onRefresh: () => void;
};

const SUBSCORE_LABEL: Record<string, string> = {
  trainingLoad: "Training Load",
  sleep: "Sleep",
  weightCut: "Weight Cut",
  wellness: "Wellness",
  nutritionAdherence: "Nutrition",
};

const CEILING_COPY: Record<string, string> = {
  weight_cut_dangerous: "Weight loss rate is over 2%/week — capped until you slow down",
  sleep_debt: "Sleep debt over 10h — capped until you recover sleep",
  training_spike: "Training spike (ACWR > 1.8) — capped until load normalizes",
};

export function FightFormScoreSheet(p: Props) {
  return (
    <Sheet open={p.open} onOpenChange={(v) => !v && p.onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-3xl">Fight Form Score</SheetTitle>
        </SheetHeader>
        <div className="mt-2 flex items-center gap-4">
          <span className="display-number text-6xl">{p.score}</span>
          <div>
            <div className="section-header">{p.label}</div>
            {p.campAge && (
              <div className="text-xs text-muted-foreground mt-1">
                {p.campAge.weeksAhead >= 0 ? "+" : ""}{p.campAge.weeksAhead.toFixed(1)} wks vs schedule
              </div>
            )}
            {p.phase && p.daysToFight != null && (
              <div className="text-xs text-muted-foreground">
                {p.phase} · {p.daysToFight} days to fight
              </div>
            )}
          </div>
        </div>

        {p.subScores && (
          <div className="mt-5 space-y-3">
            <div className="section-header">What's driving your score</div>
            {Object.entries(p.subScores)
              .sort(([, a], [, b]) => b.value * b.weight - a.value * a.weight)
              .map(([key, sub]) => (
                <div key={key}>
                  <div className="flex justify-between text-sm">
                    <span>{SUBSCORE_LABEL[key]}{key === p.topLimiter ? " · limiter" : ""}{key === p.topDriver ? " · driver" : ""}</span>
                    <span className="display-number text-sm">{sub.value}</span>
                  </div>
                  <Progress value={sub.value} className="h-1.5 mt-1" />
                  <div className="text-xs text-muted-foreground mt-1">{sub.reason}</div>
                </div>
              ))}
          </div>
        )}

        {p.appliedCeiling && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex gap-2">
            <AlertTriangle className="size-4 text-amber-400 shrink-0" />
            <div className="text-sm">
              {CEILING_COPY[p.appliedCeiling.ruleId] ?? "Score capped"} (cap: {p.appliedCeiling.cap})
            </div>
          </div>
        )}

        {p.coachNarrative && (
          <div className="mt-5">
            <div className="section-header mb-2">Coach's Take</div>
            <p className="text-sm leading-relaxed">{p.coachNarrative}</p>
          </div>
        )}

        {p.actionItems && p.actionItems.length > 0 && (
          <div className="mt-5">
            <div className="section-header mb-2">Action Items</div>
            <ol className="space-y-1 list-decimal list-inside text-sm">
              {p.actionItems.map((it, i) => <li key={i}>{it}</li>)}
            </ol>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <Button variant="outline" onClick={p.onRefresh} className="gap-2">
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/FightFormScoreSheet.tsx
git commit -m "feat(dashboard): FightFormScoreSheet with sub-score breakdown"
```

---

### Task 19: Dashboard.tsx rebuild behind feature flag

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/hooks/useFeatureFlags.ts` (or wherever flags live; create if missing)

- [ ] **Step 1: Check existing flag plumbing**

Run: `grep -r "feature_flag\|featureFlag\|enableFightForm" src/`

- [ ] **Step 2: Add simple env-driven flag**

If no flag system exists, create `src/lib/featureFlags.ts`:

```ts
export const FEATURE_FLAGS = {
  enableFightFormScore: import.meta.env.VITE_FF_FIGHT_FORM_SCORE === "true",
};
```

And add `VITE_FF_FIGHT_FORM_SCORE=true` to `.env.local` (not committed).

- [ ] **Step 3: Read current Dashboard.tsx**

Run: `wc -l src/pages/Dashboard.tsx`
Read the file to find the render block (around line 538 per audit).

- [ ] **Step 4: Wire the new hero block**

Near the top of the render, before `WeightProgressRing`:

```tsx
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { FightFormRing } from "@/components/dashboard/FightFormRing";
import { FightFormStatChips } from "@/components/dashboard/FightFormStatChips";
import { TodayPanel } from "@/components/dashboard/TodayPanel";
import { FightFormScoreSheet } from "@/components/dashboard/FightFormScoreSheet";

// inside the component:
const [scoreSheetOpen, setScoreSheetOpen] = useState(false);
const ffScore = useQuery(api.fightFormScore.getToday, {});

if (FEATURE_FLAGS.enableFightFormScore && ffScore) {
  return (
    <div className="dashboard-zoom space-y-3.5 px-5 py-3 sm:p-5 md:p-6 max-w-7xl mx-auto animate-page-in">
      {/* greeting header — keep existing block */}
      <GreetingHeader />

      {/* hero ring */}
      <div className="flex flex-col items-center pt-3">
        <FightFormRing
          score={ffScore.displayedScore}
          label={ffScore.label}
          state={ffScore.state}
          calibratingDays={ffScore.state === "calibrating" ? { current: 0, needed: 7 } : undefined}
          onTap={() => setScoreSheetOpen(true)}
        />
        {ffScore.campAge && (
          <div className="text-sm text-muted-foreground mt-2">
            {ffScore.campAge.weeksAhead === 0
              ? "On pace with your schedule"
              : `${ffScore.campAge.weeksAhead > 0 ? "+" : ""}${ffScore.campAge.weeksAhead.toFixed(1)} weeks ${ffScore.campAge.weeksAhead >= 0 ? "ahead of" : "behind"} schedule`}
          </div>
        )}
      </div>

      <FightFormStatChips
        weight={currentWeight && goalWeight ? {
          current: currentWeight,
          goal: goalWeight,
          pctComplete: progressPctFromContext,
        } : null}
        campAge={ffScore.campAge}
      />

      <TodayPanel
        adherence={{
          weight: hasLoggedWeightToday,
          training: hasLoggedTrainingToday,
          sleep: hasLoggedSleepToday,
          wellnessCheckin: hasLoggedCheckinToday,
        }}
        nextWorkout={null}
      />

      {/* Below the fold — kept secondary cards */}
      <ConsistencyRing /* existing props */ />
      <div className="grid grid-cols-2 gap-2">
        <DashboardWeightChart /* existing */ />
        <TrainingWeekWidget /* existing */ />
      </div>
      <TrainingInsightsWidget />
      <MilestoneBadges />
      <NewAnnouncementWidget />

      <FightFormScoreSheet
        open={scoreSheetOpen}
        onClose={() => setScoreSheetOpen(false)}
        score={ffScore.displayedScore}
        label={ffScore.label}
        phase={ffScore.phase}
        daysToFight={daysToFightFromContext}
        campAge={ffScore.campAge}
        subScores={ffScore.subScores}
        topDriver={ffScore.topDriver}
        topLimiter={ffScore.topLimiter}
        appliedCeiling={ffScore.appliedCeiling}
        coachNarrative={null /* wired in Task 21 */}
        actionItems={[]}
        onRefresh={() => recomputeNowMutation()}
      />
    </div>
  );
}

// fallback: existing Dashboard render
```

(Inline notes — the engineer must replace `hasLoggedWeightToday` etc. with the existing checks already in `Dashboard.tsx`. These already exist; just reference the existing variables.)

- [ ] **Step 5: Type-check + smoke test**

Run: `npm run build` — must succeed.
Run: `npm run dev` — open the dashboard with `VITE_FF_FIGHT_FORM_SCORE=true` and confirm the new layout renders, score loads, sheet opens on tap.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx src/lib/featureFlags.ts
git commit -m "feat(dashboard): wire FightFormScore hero behind feature flag"
```

---

### Task 20: Wire Daily Wisdom narrative into score sheet

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Read: existing Daily Wisdom edge function call (search for `daily-wisdom`)

- [ ] **Step 1: Locate existing Daily Wisdom call**

Run: `grep -rn "daily-wisdom\|dailyWisdom\|DailyWisdom" src/`

- [ ] **Step 2: Pass score breakdown into the same edge function**

Update the existing call to also pass:
```ts
{ scoreBreakdown: ffScore.subScores, label: ffScore.label, topLimiter: ffScore.topLimiter }
```
in addition to whatever the current payload is. The edge function prompt can keep working with the old shape but the new fields enrich the narrative.

Pass the returned narrative + action items into `FightFormScoreSheet`'s `coachNarrative` and `actionItems` props.

- [ ] **Step 3: Remove the standalone `DailyWisdomCard` from above the fold render path (only when flag is on)**

In Dashboard.tsx find the `Daily Wisdom Card` block (line ~583–636 per audit) and conditionally hide it when the flag is on:

```tsx
{!FEATURE_FLAGS.enableFightFormScore && (
  /* existing Daily Wisdom Card block */
)}
```

- [ ] **Step 4: Smoke test**

Open dashboard with flag on, tap ring, verify Coach's Take narrative renders in the sheet, no duplicate wisdom card above.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(dashboard): fold Daily Wisdom narrative into score sheet"
```

---

## Phase 4: Rollout

### Task 21: Backfill production data

**Files:** none — runs in Convex dashboard

- [ ] **Step 1: Run backfill action against staging**

In Convex dashboard, invoke `internal.fightFormScore.backfillLast30Days` with no args. Wait for completion. Verify rows in `fight_form_scores`.

- [ ] **Step 2: Spot-check 3 user scores manually**

For each, compare:
- Sub-score breakdown vs raw data
- Applied ceilings vs known data (e.g., user with high recent weight loss should hit `weight_cut_dangerous`)
- Camp Age math vs `(startingWeight - currentWeight) / (startingWeight - goalWeight)`

- [ ] **Step 3: Tag a build**

```bash
git tag fight-form-score-beta-1
git push --tags
```

---

### Task 22: Enable feature flag for beta cohort

**Files:** none — env var change in deployment

- [ ] **Step 1: Set `VITE_FF_FIGHT_FORM_SCORE=true` on staging**

Verify dashboard renders new layout in staging build.

- [ ] **Step 2: Beta validation — 5 internal users, 1 week**

Watch for:
- Score discrepancies users flag
- Performance regressions on dashboard load (>100ms regression is a flag)
- Any crashes from null sub-scores

- [ ] **Step 3: Adjust config based on feedback (patch bumps only)**

Tune weights/thresholds in `src/scoring/config/v1.ts` if needed. Bump version to `1.0.1` per spec policy. Run golden-file tests.

---

### Task 23: Production enable + Daily Wisdom cleanup

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Delete: `src/components/dashboard/DailyWisdomCard.tsx` (if it's a separate file) — or leave deprecated for one release

- [ ] **Step 1: Flip flag in production**

Set `VITE_FF_FIGHT_FORM_SCORE=true` in production env.

- [ ] **Step 2: After 1 week stable, remove the legacy branch**

Remove the `!FEATURE_FLAGS.enableFightFormScore` fallback render block in Dashboard.tsx. Delete `DailyWisdomCard` component file if it has no remaining importers.

Run: `grep -r "DailyWisdomCard\|enableFightFormScore" src/`
If both come up clean, proceed.

- [ ] **Step 3: Final cleanup commit**

```bash
git rm src/components/dashboard/DailyWisdomCard.tsx  # if removed
git add src/pages/Dashboard.tsx src/lib/featureFlags.ts
git commit -m "chore(dashboard): remove legacy daily wisdom card, retire feature flag"
```

---

## Self-Review Notes

**Spec coverage check** (cross-referenced with `2026-05-12-dashboard-fightcamp-score-design.md`):
- §1 Overview — Tasks 1–23 collectively
- §2 Algorithm — Tasks 1–8
- §3 Algorithm architecture — Task 1 (file structure, config object); §8 testing strategy enforced via Tasks 2–8 test-first steps
- §4 Persistence — Tasks 9–14
- §5 Dashboard layout — Tasks 15–19
- §6 Score sheet — Task 18, 20
- §7 Data flow — Tasks 10–13 (wiring)
- §8 Edge cases — Compose function (Task 8) handles `no_camp`, `calibrating`, `paused`; ceilings handle danger states (Task 7); applied in compose
- §9 Migration — Tasks 21–23
- §10 YAGNI — explicit non-goals respected (no HRV, no ML smoothing, no Web Workers)

**Placeholder scan:** All steps contain explicit code/commands. No "TBD" or "TODO" found.

**Type consistency:** `SubScoreKey`, `ScoringInputs`, `FightFormScore`, `ScoringConfig` defined in Task 1, referenced consistently through Tasks 2–8 and Tasks 9–11. The Convex action payload (Task 11) matches the structure persisted (Task 9). Sub-score field names (`trainingLoad`, `sleep`, `weightCut`, `wellness`, `nutritionAdherence`) consistent everywhere.

**Known gaps to accept (or flag for review):**
- Cron hourly fan-out is simplified to "UTC 04:05 = once per day" in Task 13; proper timezone-aware fan-out is a follow-up.
- `hasLoggedWeightToday` and similar variables in Task 19 step 4 reference existing Dashboard state without redefining — engineer must keep the existing data hooks (read the file first).
- `DailyWisdomCard.tsx` may be inlined in `Dashboard.tsx` rather than its own file (per audit it was inline). Task 23 step 2 grep will reveal.
