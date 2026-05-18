import { motion } from "motion/react";

interface TutorialNavProps {
  isFirstStep: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function TutorialNav({ isFirstStep, isLastStep, onBack, onNext }: TutorialNavProps) {
  return (
    <motion.div
      className="flex w-full max-w-[78vw] gap-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: 0.08 }}
    >
      {!isFirstStep && (
        <button
          type="button"
          onClick={onBack}
          className="h-11 flex-1 rounded-xl text-[14px] font-medium text-white/70 active:bg-white/10"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          Back
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        className="h-11 flex-1 rounded-xl bg-primary text-[14px] font-bold text-primary-foreground active:scale-[0.98] transition-transform"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        {isLastStep ? "Got it" : "Next"}
      </button>
    </motion.div>
  );
}
