/**
 * Tests for the deterministic hour-by-hour rehydration distribution.
 *
 * Source under test: convex/_shared/rehydrationMath.ts
 *   - `computeRehydrationTotals(args)` — weight + window → totals.
 *   - `buildHourlyProtocol(totals)`    — phased distribution.
 *
 * Distribution rule (Reale 2018 / ISSN 2025):
 *   - First 25% of hours ("Rapid Rehydration"): 40% of fluid + sodium
 *   - Middle 50%        ("Active Recovery"):    40% of fluid + sodium + 60% carbs
 *   - Final 25%         ("Pre-Comp Top-Up"):    20% of fluid + sodium + 40% carbs
 *
 * Per-hour caps (1000 ml fluid, 90 g carbs) can clamp aggressive windows,
 * deliberately pulling totals below the prescribed sum — see the "per-hour
 * caps" suite below.
 */

import { describe, it, expect } from "vitest";
import {
  buildHourlyProtocol, computeRehydrationTotals,
  type RehydrationTotals, type HourlyStepDeterministic,
} from "../../convex/_shared/rehydrationMath";

function sumBy<T>(arr: T[], pick: (x: T) => number): number {
  return arr.reduce((acc, x) => acc + pick(x), 0);
}
function classifyPhases(steps: HourlyStepDeterministic[]) {
  return {
    rapid: steps.filter((s) => s.phase === "Rapid Rehydration"),
    active: steps.filter((s) => s.phase === "Active Recovery"),
    preComp: steps.filter((s) => s.phase === "Pre-Comp Top-Up"),
  };
}

// 80kg/10h: fluid stays under 1000ml/h cap (sums exact); carbs bind at 90g/h.
const FIXTURE_80KG_10H = computeRehydrationTotals({ weighInWeightKg: 80, hoursUntilFight: 10 });
// 50kg/16h: per-hour rates well under both caps — documented ratios hold.
const FIXTURE_UNCAPPED = computeRehydrationTotals({ weighInWeightKg: 50, hoursUntilFight: 16 });

// ── 1. Sum conservation ────────────────────────────────────────────────────

describe("buildHourlyProtocol — sum conservation", () => {
  it("sum of fluid ≈ totalFluidLitres * 1000 ml (±50 ml) on a 10-hour window", () => {
    const steps = buildHourlyProtocol(FIXTURE_80KG_10H);
    const sumML = sumBy(steps, (s) => s.fluidML);
    const target = FIXTURE_80KG_10H.totalFluidLitres * 1000;
    expect(sumML).toBeGreaterThan(target - 50);
    expect(sumML).toBeLessThan(target + 50);
  });

  it("sum of carbs ≈ totalCarbsG (±5 g) on the UNCAPPED fixture (50kg/16h)", () => {
    // Use the uncapped fixture because the 90 g/h ceiling clamps active +
    // pre-comp hours on heavier athletes, delivering less than the total.
    const steps = buildHourlyProtocol(FIXTURE_UNCAPPED);
    const sumCarbs = sumBy(steps, (s) => s.carbsG);
    expect(sumCarbs).toBeGreaterThan(FIXTURE_UNCAPPED.totalCarbsG - 5);
    expect(sumCarbs).toBeLessThan(FIXTURE_UNCAPPED.totalCarbsG + 5);
  });

  it("sum of sodium roughly matches totalSodiumMg (±50 mg)", () => {
    const steps = buildHourlyProtocol(FIXTURE_80KG_10H);
    const sumNa = sumBy(steps, (s) => s.sodiumMg);
    expect(sumNa).toBeGreaterThan(FIXTURE_80KG_10H.totalSodiumMg - 50);
    expect(sumNa).toBeLessThan(FIXTURE_80KG_10H.totalSodiumMg + 50);
  });
});

// ── 2. Phase split (25/50/25 hours, 40/40/20 fluid, 0/60/40 carbs) ─────────

describe("buildHourlyProtocol — phase split (25/50/25)", () => {
  it("12-hour window: 3h rapid + 6h active + 3h pre-comp", () => {
    const totals = computeRehydrationTotals({ weighInWeightKg: 80, hoursUntilFight: 12 });
    const { rapid, active, preComp } = classifyPhases(buildHourlyProtocol(totals));
    expect(rapid).toHaveLength(3);
    expect(active).toHaveLength(6);
    expect(preComp).toHaveLength(3);
  });

  it("rapid phase gets ~40% of total fluid (±5%)", () => {
    const steps = buildHourlyProtocol(FIXTURE_80KG_10H);
    const { rapid } = classifyPhases(steps);
    const ratio = sumBy(rapid, (s) => s.fluidML) / (FIXTURE_80KG_10H.totalFluidLitres * 1000);
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.45);
  });

  it("active phase gets ~40% of fluid AND ~60% of carbs (uncapped fixture)", () => {
    const steps = buildHourlyProtocol(FIXTURE_UNCAPPED);
    const { active } = classifyPhases(steps);
    const fluidRatio = sumBy(active, (s) => s.fluidML) / (FIXTURE_UNCAPPED.totalFluidLitres * 1000);
    const carbsRatio = sumBy(active, (s) => s.carbsG) / Math.max(1, FIXTURE_UNCAPPED.totalCarbsG);
    expect(fluidRatio).toBeGreaterThan(0.35);
    expect(fluidRatio).toBeLessThan(0.45);
    expect(carbsRatio).toBeGreaterThan(0.55);
    expect(carbsRatio).toBeLessThan(0.65);
  });

  it("pre-comp phase gets ~20% fluid (always) and ~40% carbs (uncapped)", () => {
    // Fluid: 80kg/10h is fine (no cap pressure). Carbs: needs uncapped fixture.
    const fluidSteps = buildHourlyProtocol(FIXTURE_80KG_10H);
    const fluidRatio = sumBy(classifyPhases(fluidSteps).preComp, (s) => s.fluidML)
      / (FIXTURE_80KG_10H.totalFluidLitres * 1000);
    expect(fluidRatio).toBeGreaterThan(0.15);
    expect(fluidRatio).toBeLessThan(0.25);

    const carbSteps = buildHourlyProtocol(FIXTURE_UNCAPPED);
    const carbsRatio = sumBy(classifyPhases(carbSteps).preComp, (s) => s.carbsG)
      / Math.max(1, FIXTURE_UNCAPPED.totalCarbsG);
    expect(carbsRatio).toBeGreaterThan(0.35);
    expect(carbsRatio).toBeLessThan(0.45);
  });

  it("rapid phase carries 0 carbs (carbs start in active phase)", () => {
    const steps = buildHourlyProtocol(FIXTURE_80KG_10H);
    expect(sumBy(classifyPhases(steps).rapid, (s) => s.carbsG)).toBe(0);
  });
});

// ── 3. Edge windows ────────────────────────────────────────────────────────

describe("buildHourlyProtocol — edge windows", () => {
  it("1-hour window collapses into a single rapid phase without error", () => {
    const totals = computeRehydrationTotals({ weighInWeightKg: 80, hoursUntilFight: 1 });
    const steps = buildHourlyProtocol(totals);
    expect(steps).toHaveLength(1);
    expect(steps[0].hour).toBe(1);
    expect(steps[0].carbsG).toBe(0);
    expect(steps[0].fluidML).toBeLessThanOrEqual(1000);
  });

  it("24-hour window: 6 rapid + 12 active + 6 pre-comp", () => {
    const totals = computeRehydrationTotals({ weighInWeightKg: 80, hoursUntilFight: 24 });
    const steps = buildHourlyProtocol(totals);
    expect(steps).toHaveLength(24);
    const { rapid, active, preComp } = classifyPhases(steps);
    expect(rapid).toHaveLength(6);
    expect(active).toHaveLength(12);
    expect(preComp).toHaveLength(6);
  });
});

// ── 4. Per-hour caps (documented engine behaviour) ─────────────────────────

describe("buildHourlyProtocol — per-hour caps", () => {
  it("no hour exceeds 1000 ml of fluid (gastric emptying ceiling)", () => {
    const totals = computeRehydrationTotals({ weighInWeightKg: 120, hoursUntilFight: 4 });
    for (const s of buildHourlyProtocol(totals)) expect(s.fluidML).toBeLessThanOrEqual(1000);
  });

  it("no hour exceeds the carb ceiling (90 g)", () => {
    const totals = computeRehydrationTotals({ weighInWeightKg: 120, hoursUntilFight: 4 });
    for (const s of buildHourlyProtocol(totals)) {
      expect(s.carbsG).toBeLessThanOrEqual(totals.maxCarbsPerHour);
    }
  });

  it("carb cap deletes carbs from total on aggressive windows (pinned behaviour)", () => {
    // 80kg/10h: total=800g; pre-comp share 160g/h → clamped to 90g/h. Pinned
    // so the backend agent doesn't silently change it without coordinating.
    const steps = buildHourlyProtocol(FIXTURE_80KG_10H);
    expect(sumBy(steps, (s) => s.carbsG)).toBeLessThan(FIXTURE_80KG_10H.totalCarbsG);
  });
});

// ── 5. Step shape ──────────────────────────────────────────────────────────

describe("HourlyStepDeterministic shape", () => {
  it("each step has hour, phase, fluidML, sodiumMg, carbsG as finite values", () => {
    const totals: RehydrationTotals = FIXTURE_80KG_10H;
    for (const s of buildHourlyProtocol(totals)) {
      expect(typeof s.hour).toBe("number");
      expect(typeof s.phase).toBe("string");
      expect(Number.isFinite(s.fluidML)).toBe(true);
      expect(Number.isFinite(s.sodiumMg)).toBe(true);
      expect(Number.isFinite(s.carbsG)).toBe(true);
    }
  });
});
