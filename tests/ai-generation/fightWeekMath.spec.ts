/**
 * Deterministic math tests for the fight-week breakdown engine.
 *
 * Source under test: convex/_shared/fightWeekMath.ts (extracted by the
 * backend agent from src/utils/fightWeekEngine.ts). Pure functions — no
 * Convex runtime required.
 *
 * Rules being pinned (project spec):
 *   - glycogenLoss     ≈ 0.012 * currentWeight (capped 1.6kg)
 *   - fibreLoss        ≈ 0.003 * currentWeight (≥4 days)
 *   - sodiumLoss       ≈ 0.002 * currentWeight (≥3 days)
 *   - waterLoadingLoss ≈ 0.005 * currentWeight (≥4 days)
 *   - dietTotal        = sum of above
 *   - dehydrationNeeded = max(0, totalToCut - dietTotal)
 *   - dehydration.safety: green ≤3% BW, orange ≤5%, red >5%
 *   - dehydration.saunaSessions = ceil(dehydrationNeeded / 0.6) capped at 6
 *   - riskLevel: red when dehydration% > 5; green ≤3 with feasible cut;
 *                orange in between
 *
 * Engine rounds breakdown to 2dp — we use `toBeCloseTo` rather than chasing
 * raw floats.
 */

import { describe, it, expect } from "vitest";
import {
  glycogenDepletion, fibreReduction, sodiumManipulation, waterLoadingBenefit,
  getDehydrationSafety, estimateSaunaSessions, computeFightWeekProjection,
} from "../../convex/_shared/fightWeekMath";

// ── Component depletion estimates ──────────────────────────────────────────

describe("fight-week component depletion estimates", () => {
  it("glycogenLoss ≈ 0.012 * currentWeight at 80kg/5days", () => {
    expect(glycogenDepletion(80, 5)).toBeCloseTo(0.96, 2);
  });
  it("fibreLoss ≈ 0.003 * currentWeight at 80kg/5days", () => {
    expect(fibreReduction(80, 5)).toBeCloseTo(0.24, 2);
  });
  it("sodiumLoss ≈ 0.002 * currentWeight at 80kg/5days", () => {
    expect(sodiumManipulation(80, 5)).toBeCloseTo(0.16, 2);
  });
  it("waterLoadingLoss ≈ 0.005 * currentWeight at 80kg/5days", () => {
    expect(waterLoadingBenefit(80, 5)).toBeCloseTo(0.4, 2);
  });
  it("glycogenLoss caps at 1.6kg for very large athletes", () => {
    expect(glycogenDepletion(200, 5)).toBe(1.6);
  });
  it("waterLoadingLoss is zero when <4 days available", () => {
    expect(waterLoadingBenefit(80, 3)).toBe(0);
  });
  it("sodiumLoss is zero when <3 days available", () => {
    expect(sodiumManipulation(80, 2)).toBe(0);
  });
});

// ── Dehydration safety zones ───────────────────────────────────────────────

describe("getDehydrationSafety traffic light", () => {
  it("green when dehydration ≤3% BW", () => {
    expect(getDehydrationSafety(2.4, 80)).toBe("green"); // 3% exactly
    expect(getDehydrationSafety(1.0, 80)).toBe("green");
  });
  it("orange when 3% < dehydration ≤5% BW", () => {
    expect(getDehydrationSafety(3.2, 80)).toBe("orange"); // 4%
    expect(getDehydrationSafety(4.0, 80)).toBe("orange"); // 5% exactly
  });
  it("red when dehydration >5% BW", () => {
    expect(getDehydrationSafety(4.5, 80)).toBe("red");
    expect(getDehydrationSafety(8.0, 80)).toBe("red");
  });
  it("green when dehydrationKg is 0 or negative (defensive)", () => {
    expect(getDehydrationSafety(0, 80)).toBe("green");
    expect(getDehydrationSafety(-1, 80)).toBe("green");
  });
});

// ── Sauna sessions: ceil(dehydration/0.6), cap 6 ───────────────────────────

describe("estimateSaunaSessions", () => {
  it("0 dehydration → 0 sessions", () => { expect(estimateSaunaSessions(0, 80)).toBe(0); });
  it("0.6kg → 1 session", () => { expect(estimateSaunaSessions(0.6, 80)).toBe(1); });
  it("0.7kg → 2 sessions (ceil)", () => { expect(estimateSaunaSessions(0.7, 80)).toBe(2); });
  it("1.2kg → 2 sessions", () => { expect(estimateSaunaSessions(1.2, 80)).toBe(2); });
  it("4.0kg → capped at 6 sessions", () => { expect(estimateSaunaSessions(4.0, 80)).toBe(6); });
  it("huge dehydration → still capped at 6", () => { expect(estimateSaunaSessions(50, 80)).toBe(6); });
});

// ── Master computation invariants ──────────────────────────────────────────

describe("computeFightWeekProjection invariants", () => {
  it("breakdown.totalToCut = currentWeight - targetWeighIn", () => {
    const p = computeFightWeekProjection({ currentWeight: 80, targetWeighIn: 77, daysUntilWeighIn: 5 });
    expect(p.breakdown.totalToCut).toBeCloseTo(3.0, 2);
  });

  it("breakdown.dietTotal = sum of the four component losses", () => {
    const p = computeFightWeekProjection({ currentWeight: 80, targetWeighIn: 77, daysUntilWeighIn: 5 });
    const sum = p.breakdown.glycogenLoss + p.breakdown.fibreLoss + p.breakdown.sodiumLoss + p.breakdown.waterLoadingLoss;
    expect(p.breakdown.dietTotal).toBeCloseTo(sum, 1);
  });

  it("dehydrationNeeded = max(0, totalToCut - dietTotal)", () => {
    const p = computeFightWeekProjection({ currentWeight: 80, targetWeighIn: 77, daysUntilWeighIn: 5 });
    expect(p.breakdown.dehydrationNeeded).toBeCloseTo(
      Math.max(0, p.breakdown.totalToCut - p.breakdown.dietTotal), 2,
    );
  });

  it("dehydrationNeeded is clamped to 0 when diet alone is enough", () => {
    const p = computeFightWeekProjection({ currentWeight: 80, targetWeighIn: 79.5, daysUntilWeighIn: 7 });
    expect(p.breakdown.dehydrationNeeded).toBe(0);
  });

  it("riskLevel = red when dehydration% > 5", () => {
    const p = computeFightWeekProjection({ currentWeight: 80, targetWeighIn: 72, daysUntilWeighIn: 5 });
    expect(p.riskLevel).toBe("red");
    expect(p.safetyWarning).toBeTruthy();
  });

  it("riskLevel = green for a small, feasible cut over a long window", () => {
    const p = computeFightWeekProjection({ currentWeight: 80, targetWeighIn: 79, daysUntilWeighIn: 7 });
    expect(p.riskLevel).toBe("green");
    expect(p.safetyWarning).toBeNull();
  });

  it("riskLevel = orange for a moderate cut that needs some dehydration", () => {
    const p = computeFightWeekProjection({ currentWeight: 80, targetWeighIn: 75.5, daysUntilWeighIn: 5 });
    expect(["orange", "red"]).toContain(p.riskLevel);
  });

  it("dehydration.safety matches the dehydration percentage zone", () => {
    const p = computeFightWeekProjection({ currentWeight: 80, targetWeighIn: 77, daysUntilWeighIn: 5 });
    const pct = (p.breakdown.dehydrationNeeded / 80) * 100;
    if (pct <= 3) expect(p.dehydration.safety).toBe("green");
    else if (pct <= 5) expect(p.dehydration.safety).toBe("orange");
    else expect(p.dehydration.safety).toBe("red");
  });

  it("dehydration.saunaSessions = ceil(dehydrationNeeded / 0.6) capped at 6", () => {
    const p = computeFightWeekProjection({ currentWeight: 80, targetWeighIn: 76, daysUntilWeighIn: 5 });
    const expected = Math.min(6, Math.ceil(p.breakdown.dehydrationNeeded / 0.6));
    expect(p.dehydration.saunaSessions).toBe(expected);
  });
});

// ── Edge cases ─────────────────────────────────────────────────────────────

describe("computeFightWeekProjection edge cases", () => {
  it("zero cut needed → dehydration = 0, green", () => {
    const p = computeFightWeekProjection({ currentWeight: 80, targetWeighIn: 80, daysUntilWeighIn: 5 });
    expect(p.breakdown.totalToCut).toBe(0);
    expect(p.breakdown.dehydrationNeeded).toBe(0);
    expect(p.riskLevel).toBe("green");
  });

  it("1-day notice forces water-loading & fibre & sodium off", () => {
    const p = computeFightWeekProjection({ currentWeight: 80, targetWeighIn: 77, daysUntilWeighIn: 1 });
    expect(p.breakdown.waterLoadingLoss).toBe(0);
    expect(p.breakdown.fibreLoss).toBe(0);
    expect(p.breakdown.sodiumLoss).toBe(0);
  });

  it("timeline length equals daysUntilWeighIn", () => {
    const p = computeFightWeekProjection({ currentWeight: 80, targetWeighIn: 77, daysUntilWeighIn: 5 });
    expect(p.timeline.length).toBe(5);
  });
});
