import { CalendarRange, Compass, Gauge, Info, Layers, ShieldAlert } from "lucide-react";
import { TutorialDialog, type TutorialCard } from "./TutorialDialog";

type Props = {
  open: boolean;
  onClose: () => void;
};

// Six cards distilled from the original 7-section explainer accordion.
// Each blurb is rewritten to fit one card without scrolling. The component
// breakdown lives in the calibration tour, so this tutorial focuses on the
// concepts that aren't already covered there: number, labels, phases,
// ceilings, daily use, and limits.
const CARDS: TutorialCard[] = [
  {
    key: "number",
    title: "What the number means",
    icon: Gauge,
    blurb:
      "Fight Form Score is a single 0 to 100 figure that blends short-term readiness (recovery, training, sleep) with long-term progress (weight cut, nutrition). The number on screen is a 3-day rolling average, so one bad day will not tank it.",
  },
  {
    key: "labels",
    title: "The four labels",
    icon: Compass,
    blurb:
      "Sharp (80+) means you are peaking. Sharpening (60 to 79) means you are on track. Off Pace (40 to 59) means you are drifting. At Risk (under 40) means something is wrong, check the limiter and any ceiling banner first.",
  },
  {
    key: "components",
    title: "The five components",
    icon: Layers,
    blurb:
      "Training Load, Sleep, Weight Cut, Wellness, and Nutrition each score 0 to 100 and combine into the final number. Tap the dots under the ring on the dashboard to see which one is driving or limiting your score right now.",
  },
  {
    key: "phases",
    title: "Camp phase matters",
    icon: CalendarRange,
    blurb:
      "Component weights shift automatically. In Build phase (more than 14 days out) Training Load and Weight Cut carry the most. In Peak phase (7 to 14 days) Sleep and Weight Cut get heavier. In Fight Week, Weight Cut, Sleep, and Wellness dominate.",
  },
  {
    key: "ceilings",
    title: "Soft ceilings",
    icon: ShieldAlert,
    blurb:
      "Some signals are dangerous enough to cap your score. Cutting over 2% bodyweight per week caps it at 50. Sleep debt over 10 hours caps it at 65. A training spike (ACWR over 1.8) caps it at 45. A lock icon appears at the cap boundary when one fires.",
  },
  {
    key: "daily",
    title: "Day-to-day use",
    icon: Info,
    blurb:
      "Check the score in the morning. The label tells you whether to push or recover. Read the limiter (the component holding the score down) and pick that as your next lever. Optimise for the components, not the number; the number will follow.",
  },
];

export function FightFormHowItWorksTour({ open, onClose }: Props) {
  return (
    <TutorialDialog
      open={open}
      onClose={onClose}
      cards={CARDS}
      eyebrow="How your score works"
    />
  );
}
