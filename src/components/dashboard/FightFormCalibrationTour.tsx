import { Activity, Apple, Bed, HeartPulse, Scale } from "lucide-react";
import type { SubScore, SubScoreKey } from "@/scoring/types";
import { TutorialDialog, type TutorialCard } from "./TutorialDialog";

type Props = {
  open: boolean;
  onClose: () => void;
  subScores: Record<SubScoreKey, SubScore> | null;
};

type ComponentCard = {
  key: SubScoreKey;
  title: string;
  icon: TutorialCard["icon"];
  blurb: string;
  inputs: string;
};

const COMPONENTS: ComponentCard[] = [
  {
    key: "trainingLoad",
    title: "Training Load",
    icon: Activity,
    blurb:
      "We watch the ratio of your last 7 days of training to your last 28. The sweet spot is 0.8 to 1.3. Below that you're detraining; above that you're spiking risk.",
    inputs: "Inputs: gym sessions with RPE + duration.",
  },
  {
    key: "sleep",
    title: "Sleep",
    icon: Bed,
    blurb:
      "Your 7-day sleep debt against an 8-hour target. One hour short every night costs about 5 to 6 points off this component.",
    inputs: "Inputs: nightly sleep log.",
  },
  {
    key: "weightCut",
    title: "Weight Cut",
    icon: Scale,
    blurb:
      "Your weekly loss rate vs a sustainable 0.3 to 1.0% of bodyweight. We also factor whether your current pace will hit goal weight by fight night.",
    inputs: "Inputs: morning weight log.",
  },
  {
    key: "wellness",
    title: "Wellness",
    icon: HeartPulse,
    blurb:
      "Your Hooper Index, which combines sleep quality, fatigue, soreness, and stress. Compared to your own baseline, not a population average.",
    inputs: "Inputs: daily wellness check-in.",
  },
  {
    key: "nutritionAdherence",
    title: "Nutrition",
    icon: Apple,
    blurb:
      "How many days in the last 7 you hit your calorie target within 10%, plus whether protein cleared 80% of target each day.",
    inputs: "Inputs: meals logged with macros.",
  },
];

export function FightFormCalibrationTour({ open, onClose, subScores }: Props) {
  const cards: TutorialCard[] = COMPONENTS.map((c) => {
    const sub = subScores ? subScores[c.key] : null;
    return {
      key: c.key,
      title: c.title,
      icon: c.icon,
      blurb: c.blurb,
      meta: c.inputs,
      rightSlot: sub ? (
        <p className="text-[11px] text-muted-foreground">
          Your current value:{" "}
          <span className="display-number tabular-nums text-foreground">
            {Math.round(sub.value)}
          </span>
          /100
        </p>
      ) : undefined,
    };
  });

  return (
    <TutorialDialog
      open={open}
      onClose={onClose}
      cards={cards}
      eyebrow="How your score works"
    />
  );
}
