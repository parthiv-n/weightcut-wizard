import type { TutorialStep } from "./types";

export interface ProgressSection {
  id: string;
  label: string;
  stepIds: string[];
}

export const ONBOARDING_SECTIONS: ProgressSection[] = [
  { id: "welcome", label: "Welcome", stepIds: ["welcome"] },
  { id: "dashboard", label: "Dashboard", stepIds: ["dashboard-overview"] },
  { id: "score", label: "Score", stepIds: ["score-number", "score-labels", "score-components", "score-phases", "score-ceilings", "score-daily-use"] },
  { id: "nutrition", label: "Nutrition", stepIds: ["nutrition-page", "nutrition-features"] },
  { id: "weight", label: "Weight", stepIds: ["weight-tracker-page"] },
  { id: "cut", label: "Cut", stepIds: ["fight-week-page", "rehydration-page"] },
  { id: "camps", label: "Camps", stepIds: ["fight-camps-page", "training-calendar-page"] },
  { id: "recovery", label: "Recovery", stepIds: ["recovery-page", "sleep-page"] },
  { id: "sendoff", label: "Wrap", stepIds: ["quick-tips", "pro-features", "all-done"] },
];

export function computeSegmentFills(
  activeSteps: TutorialStep[],
  currentStepIndex: number,
): number[] {
  const activeIds = new Set(activeSteps.map((s) => s.id));
  const presentSections = ONBOARDING_SECTIONS.map((section) => ({
    ...section,
    stepIds: section.stepIds.filter((id) => activeIds.has(id)),
  })).filter((section) => section.stepIds.length > 0);

  const currentId = activeSteps[currentStepIndex]?.id ?? null;

  return presentSections.map((section) => {
    const idx = currentId ? section.stepIds.indexOf(currentId) : -1;
    if (idx >= 0) {
      return (idx + 1) / section.stepIds.length;
    }
    const allBefore = section.stepIds.every((id) => {
      const stepIdx = activeSteps.findIndex((s) => s.id === id);
      return stepIdx >= 0 && stepIdx < currentStepIndex;
    });
    return allBefore ? 1 : 0;
  });
}
