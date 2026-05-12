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
