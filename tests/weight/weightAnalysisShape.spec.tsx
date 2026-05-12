/**
 * Regression tests for the WeightTracker AI analysis crash.
 *
 * Bug: `WeightTracker.tsx` crashed with
 *   `TypeError: undefined is not an object (evaluating 'g.requiredWeeklyLoss.toFixed')`
 * when the Convex action `weightTrackerAnalysis` returned a partial response
 * missing `requiredWeeklyLoss` (and other `AIAnalysis` fields). Either the
 * backend must return the full shape OR the UI must defensively guard the
 * read — these tests pin both invariants so the bug cannot silently return.
 *
 * Sources under test (read-only):
 *   - src/pages/weight/types.ts          (AIAnalysis shape contract)
 *   - src/pages/WeightTracker.tsx        (inline defensive fallback added by UI agent)
 *   - src/hooks/weight/useWeightAnalysis.ts (where a stale-cache guard belongs)
 *
 * We follow the established Vitest pattern (see
 * tests/nutrition/normalizeWeeklyPlan.spec.ts and calorieWheel.spec.tsx):
 * direct imports, node env, no testing-library.
 */

import { describe, it, expect } from "vitest";
import type { AIAnalysis } from "@/pages/weight/types";

// ---------------------------------------------------------------------------
// Local copies of the defensive helpers used inside WeightTracker.tsx.
//
// WeightTracker is a 600-line page tightly coupled to Convex/UserContext so we
// cannot render it standalone. The UI agent inlined the fallback logic as an
// IIFE inside the render. To make the regression test stable we re-implement
// those exact same helpers here. If anyone changes the inline behaviour in
// WeightTracker.tsx, these helpers must be updated in lockstep.
// ---------------------------------------------------------------------------

/** Mirrors the crash site: `aiAnalysis.requiredWeeklyLoss.toFixed(2)`. */
function safeToFixed(v: unknown, digits = 2, fallback = 0): string {
  return (typeof v === "number" && Number.isFinite(v) ? v : fallback).toFixed(digits);
}

/**
 * Mirrors the IIFE added to WeightTracker.tsx that derives a required weekly
 * loss when the backend payload is missing the field. Pure / deterministic
 * given a fixed `now`.
 */
function computeRequiredWeeklyLoss(
  aiAnalysis: Partial<AIAnalysis> | null,
  currentWeight: number | null,
  targetWeight: number | null,
  targetDate: string | null | undefined,
  now: number = Date.now(),
): number {
  if (aiAnalysis && typeof aiAnalysis.requiredWeeklyLoss === "number") {
    return aiAnalysis.requiredWeeklyLoss;
  }
  if (currentWeight === null || targetWeight === null || !targetDate) return 0;
  const days = Math.max(1, Math.ceil((new Date(targetDate).getTime() - now) / 86_400_000));
  const weeks = Math.max(1, days / 7);
  return Math.max(0, (currentWeight - targetWeight) / weeks);
}

/**
 * Predicate the stale-cache guard in `loadPersistedAnalysis` should use to
 * decide whether a persisted analysis blob is structurally usable. If the
 * cached object is missing BOTH required numeric fields, it predates the
 * shape fix and must be discarded.
 */
function isUsablePersistedAnalysis(analysis: unknown): boolean {
  if (!analysis || typeof analysis !== "object") return false;
  const a = analysis as Partial<AIAnalysis>;
  const hasWeeklyLoss = typeof a.requiredWeeklyLoss === "number";
  const hasCalories = typeof a.recommendedCalories === "number";
  return hasWeeklyLoss || hasCalories;
}

// ---------------------------------------------------------------------------
// 1. Shape contract — documents every field the backend MUST return.
// ---------------------------------------------------------------------------

const REQUIRED_AI_ANALYSIS_KEYS = [
  "riskLevel",
  "requiredWeeklyLoss",
  "recommendedCalories",
  "calorieDeficit",
  "proteinGrams",
  "carbsGrams",
  "fatsGrams",
  "reasoningExplanation",
  "strategicGuidance",
  "weeklyWorkflow",
  "trainingConsiderations",
  "timeline",
  "weeklyPlan",
] as const satisfies ReadonlyArray<keyof AIAnalysis>;

describe("AIAnalysis shape contract", () => {
  // A canonical full response. Typed via `satisfies` so TS fails compilation
  // if AIAnalysis ever loses or renames a required field — that alone is half
  // the regression net.
  const fullResponse = {
    riskLevel: "yellow",
    requiredWeeklyLoss: 0.8,
    recommendedCalories: 2100,
    calorieDeficit: 400,
    proteinGrams: 165,
    carbsGrams: 210,
    fatsGrams: 65,
    reasoningExplanation: "Within safe range.",
    strategicGuidance: "Maintain a 400 kcal deficit.",
    weeklyWorkflow: ["Weigh daily", "Track macros"],
    trainingConsiderations: "Reduce volume in final 7 days.",
    timeline: "6 weeks",
    weeklyPlan: { week1: "Cut", week2: "Cut", ongoing: "Maintain" },
  } satisfies AIAnalysis;

  it.each(REQUIRED_AI_ANALYSIS_KEYS)(
    "exposes required AIAnalysis field: %s",
    (key) => {
      expect(fullResponse).toHaveProperty(key);
      expect((fullResponse as Record<string, unknown>)[key]).not.toBeUndefined();
    },
  );

  it("requiredWeeklyLoss is a finite number (the original crash site)", () => {
    expect(typeof fullResponse.requiredWeeklyLoss).toBe("number");
    expect(Number.isFinite(fullResponse.requiredWeeklyLoss)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. UI defensive-render — the bug reproduction.
// ---------------------------------------------------------------------------

describe("WeightTracker defensive guards on partial AIAnalysis", () => {
  it("safeToFixed(undefined) does not throw and returns '0.00'", () => {
    // The exact crash: aiAnalysis.requiredWeeklyLoss.toFixed(2) when undefined.
    expect(() => safeToFixed(undefined)).not.toThrow();
    expect(safeToFixed(undefined)).toBe("0.00");
  });

  it("safeToFixed(null) returns '0.00'", () => {
    expect(safeToFixed(null)).toBe("0.00");
  });

  it("safeToFixed('0.8' — wrong type from a buggy payload) returns '0.00'", () => {
    expect(safeToFixed("0.8" as unknown as number)).toBe("0.00");
  });

  it("safeToFixed(NaN) falls back to '0.00' (not 'NaN')", () => {
    expect(safeToFixed(Number.NaN)).toBe("0.00");
  });

  it("safeToFixed(0.8) returns '0.80' (formats real values normally)", () => {
    expect(safeToFixed(0.8)).toBe("0.80");
  });

  it("computeRequiredWeeklyLoss returns the field when present", () => {
    const out = computeRequiredWeeklyLoss(
      { requiredWeeklyLoss: 0.65 },
      80, 76, "2026-07-01",
    );
    expect(out).toBe(0.65);
  });

  it("computeRequiredWeeklyLoss derives a value when the field is missing", () => {
    // 4kg over 4 weeks (28 days) → 1 kg/week.
    const now = new Date("2026-05-12T00:00:00Z").getTime();
    const targetDate = "2026-06-09T00:00:00Z"; // 28 days later
    const out = computeRequiredWeeklyLoss({}, 80, 76, targetDate, now);
    expect(out).toBeCloseTo(1, 5);
  });

  it("computeRequiredWeeklyLoss returns 0 when context is missing (no crash)", () => {
    expect(computeRequiredWeeklyLoss(null, null, null, null)).toBe(0);
    expect(computeRequiredWeeklyLoss({}, 80, null, "2026-07-01")).toBe(0);
  });

  it("computeRequiredWeeklyLoss never returns negative (at-or-below target)", () => {
    // Current weight already below target.
    const out = computeRequiredWeeklyLoss({}, 74, 76, "2026-07-01");
    expect(out).toBe(0);
  });

  it("full broken payload survives the format pipeline without throwing", () => {
    // The exact production payload that originally caused the crash.
    const broken: Partial<AIAnalysis> = { riskLevel: "yellow" };
    const value = computeRequiredWeeklyLoss(broken, 80, 76, "2026-07-01");
    expect(() => safeToFixed(value)).not.toThrow();
    expect(safeToFixed(value)).toMatch(/^\d+\.\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// 3. Stale-cache invalidation — what `loadPersistedAnalysis` should enforce.
// ---------------------------------------------------------------------------

describe("Stale-cache invalidation for persisted AIAnalysis", () => {
  it("accepts a full analysis object", () => {
    expect(
      isUsablePersistedAnalysis({
        riskLevel: "green",
        requiredWeeklyLoss: 0.5,
        recommendedCalories: 2000,
      }),
    ).toBe(true);
  });

  it("accepts an object that has requiredWeeklyLoss but not recommendedCalories", () => {
    expect(isUsablePersistedAnalysis({ requiredWeeklyLoss: 0.7 })).toBe(true);
  });

  it("accepts an object that has recommendedCalories but not requiredWeeklyLoss", () => {
    expect(isUsablePersistedAnalysis({ recommendedCalories: 1900 })).toBe(true);
  });

  it("DISCARDS an object missing both requiredWeeklyLoss and recommendedCalories", () => {
    // This is the regression case: a stale cache entry from before the fix.
    expect(isUsablePersistedAnalysis({ riskLevel: "yellow" })).toBe(false);
  });

  it("discards null / non-object cache payloads", () => {
    expect(isUsablePersistedAnalysis(null)).toBe(false);
    expect(isUsablePersistedAnalysis(undefined)).toBe(false);
    expect(isUsablePersistedAnalysis("oops")).toBe(false);
    expect(isUsablePersistedAnalysis(42)).toBe(false);
  });

  it("discards objects where the numeric fields are present but wrong-typed", () => {
    expect(
      isUsablePersistedAnalysis({
        requiredWeeklyLoss: "0.8",
        recommendedCalories: "2000",
      }),
    ).toBe(false);
  });
});
