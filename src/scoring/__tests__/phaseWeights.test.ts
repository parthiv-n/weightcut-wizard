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
