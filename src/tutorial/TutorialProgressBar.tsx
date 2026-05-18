import { motion } from "motion/react";
import { computeSegmentFills } from "./sections";
import type { TutorialStep } from "./types";

interface TutorialProgressBarProps {
  activeSteps: TutorialStep[];
  currentStepIndex: number;
}

export function TutorialProgressBar({ activeSteps, currentStepIndex }: TutorialProgressBarProps) {
  const fills = computeSegmentFills(activeSteps, currentStepIndex);

  return (
    <div
      className="flex w-full gap-1.5"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)", paddingLeft: 16, paddingRight: 16 }}
      aria-label="Tutorial progress"
    >
      {fills.map((fill, i) => (
        <div key={i} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-white/85"
            initial={false}
            animate={{ width: `${Math.round(fill * 100)}%` }}
            transition={{ type: "spring", stiffness: 180, damping: 26 }}
          />
        </div>
      ))}
    </div>
  );
}
