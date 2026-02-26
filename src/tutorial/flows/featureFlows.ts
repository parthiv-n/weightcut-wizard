import type { TutorialFlow } from "../types";

export const hydrationFeatureFlow: TutorialFlow = {
  id: "hydrationFeature",
  version: 1,
  steps: [
    {
      id: "hydration-welcome",
      title: "Hydration Tracking",
      description:
        "Track your daily water intake to stay on top of your hydration during your weight cut.",
      position: "center",
    },
  ],
};

export const fightWeekFeatureFlow: TutorialFlow = {
  id: "fightWeekFeature",
  version: 1,
  steps: [
    {
      id: "fight-week-welcome",
      title: "Fight Week Protocol",
      description:
        "Manage your water loading, sodium manipulation, and final weight cut strategy all in one place.",
      position: "center",
    },
  ],
};

export const featureFlows: TutorialFlow[] = [
  hydrationFeatureFlow,
  fightWeekFeatureFlow,
];
