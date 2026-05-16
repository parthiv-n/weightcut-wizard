import { describe, it, expect } from "vitest";
import { applyCeilings } from "../ceilings";
import { ScoringConfigV1 } from "../config/v1";

// All existing tests use signals that pass the cold-start guard so that the
// pre-existing rule behaviour is preserved. The new tests at the bottom cover
// the cold-start regression directly.
const baseGuards = { trainingDaysIn28d: 20, acuteLoad: 2000, latestHooper: 12 };

describe("applyCeilings", () => {
  it("caps at 50 when weight cut is dangerous", () => {
    const r = applyCeilings(80, {
      weightCutDangerousDays: 3,
      sleepDebt7d: 0,
      acwr: 1.0,
      ...baseGuards,
    }, ScoringConfigV1);
    expect(r.score).toBe(50);
    expect(r.applied?.ruleId).toBe("weight_cut_dangerous");
  });

  it("does not cap when no flags", () => {
    const r = applyCeilings(75, {
      weightCutDangerousDays: 0,
      sleepDebt7d: 5,
      acwr: 1.0,
      ...baseGuards,
    }, ScoringConfigV1);
    expect(r.score).toBe(75);
    expect(r.applied).toBeNull();
  });

  it("picks the lowest cap when multiple apply", () => {
    const r = applyCeilings(90, {
      weightCutDangerousDays: 3,
      sleepDebt7d: 12,
      acwr: 2.0,
      ...baseGuards,
    }, ScoringConfigV1);
    expect(r.score).toBe(45);
    expect(r.applied?.ruleId).toBe("training_spike");
  });

  // ─── Cold-start regression tests ────────────────────────────────
  // Reproduces the original bug: one logged session against an empty 28-day
  // window produces an artificially huge ACWR. Without the gate the score
  // was wrongly capped at 45.

  it("does NOT fire training_spike with insufficient training days", () => {
    const r = applyCeilings(85, {
      weightCutDangerousDays: 0,
      sleepDebt7d: 0,
      acwr: 4.0,
      trainingDaysIn28d: 1,     // only one session logged
      acuteLoad: 600,
      latestHooper: 12,
    }, ScoringConfigV1);
    expect(r.score).toBe(85);
    expect(r.applied).toBeNull();
  });

  it("does NOT fire training_spike when absolute weekly load is tiny", () => {
    const r = applyCeilings(85, {
      weightCutDangerousDays: 0,
      sleepDebt7d: 0,
      acwr: 2.5,
      trainingDaysIn28d: 18,
      acuteLoad: 100,           // way below the 500 floor
      latestHooper: 12,
    }, ScoringConfigV1);
    expect(r.score).toBe(85);
    expect(r.applied).toBeNull();
  });

  it("does NOT fire training_spike when wellness check-in is good", () => {
    const r = applyCeilings(85, {
      weightCutDangerousDays: 0,
      sleepDebt7d: 0,
      acwr: 2.5,
      trainingDaysIn28d: 18,
      acuteLoad: 1500,
      latestHooper: 20,         // Hooper 20/28 = Good
    }, ScoringConfigV1);
    expect(r.score).toBe(85);
    expect(r.applied).toBeNull();
  });

  it("DOES fire training_spike when all guards are passed", () => {
    const r = applyCeilings(85, {
      weightCutDangerousDays: 0,
      sleepDebt7d: 0,
      acwr: 2.5,
      trainingDaysIn28d: 18,
      acuteLoad: 1500,
      latestHooper: 12,
    }, ScoringConfigV1);
    expect(r.score).toBe(45);
    expect(r.applied?.ruleId).toBe("training_spike");
  });
});
