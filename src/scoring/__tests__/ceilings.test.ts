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
