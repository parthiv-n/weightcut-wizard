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
