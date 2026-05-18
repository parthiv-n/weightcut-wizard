import { describe, it, expect } from "vitest";
import { computeSegmentFills, ONBOARDING_SECTIONS } from "../sections";
import type { TutorialStep } from "../types";

function step(id: string): TutorialStep {
  return { id, title: "", description: "", position: "center" };
}

const allSteps: TutorialStep[] = [
  step("welcome"),
  step("dashboard-overview"),
  step("score-number"),
  step("score-labels"),
  step("score-components"),
  step("score-phases"),
  step("score-ceilings"),
  step("score-daily-use"),
  step("nutrition-page"),
  step("nutrition-features"),
  step("weight-tracker-page"),
  step("fight-week-page"),
  step("rehydration-page"),
  step("fight-camps-page"),
  step("training-calendar-page"),
  step("recovery-page"),
  step("sleep-page"),
  step("your-corner"),
  step("feed-view-once"),
  step("quick-tips"),
  step("pro-features"),
  step("all-done"),
];

describe("ONBOARDING_SECTIONS", () => {
  it("has ten sections", () => {
    expect(ONBOARDING_SECTIONS).toHaveLength(10);
  });
  it("covers every onboarding step id exactly once", () => {
    const ids = ONBOARDING_SECTIONS.flatMap((s) => s.stepIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(allSteps.map((s) => s.id));
  });
});

describe("computeSegmentFills", () => {
  it("fills the first segment to 1 when on the only step in it", () => {
    const fills = computeSegmentFills(allSteps, 0);
    expect(fills[0]).toBe(1);
    expect(fills[1]).toBe(0);
  });
  it("fills a multi-step segment proportionally", () => {
    const fills = computeSegmentFills(allSteps, 2);
    expect(fills[2]).toBeCloseTo(1 / 6, 5);
  });
  it("marks completed segments as 1", () => {
    const fills = computeSegmentFills(allSteps, 8);
    expect(fills[0]).toBe(1);
    expect(fills[1]).toBe(1);
    expect(fills[2]).toBe(1);
  });
  it("collapses the Cut section when goalType filters those steps out", () => {
    const filtered = allSteps.filter(
      (s) => s.id !== "fight-week-page" && s.id !== "rehydration-page",
    );
    const fills = computeSegmentFills(filtered, 0);
    expect(fills).toHaveLength(9);
  });
});
