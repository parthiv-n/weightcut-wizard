import { motion } from "motion/react";

interface TutorialNavProps {
  isFirstStep: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
}

// Solid backgrounds so the buttons read clearly against any page
// content behind them. Both share the same shadow + border treatment
// so they feel like one widget without competing for attention.
const BACK_BG = "rgba(0,0,0,0.55)";
const BACK_BORDER = "1px solid rgba(255,255,255,0.12)";

export function TutorialNav({ isFirstStep, isLastStep, onBack, onNext }: TutorialNavProps) {
  return (
    <motion.div
      className="flex w-full max-w-[78vw] gap-2"
      style={{ zIndex: 1 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: 0.08 }}
    >
      {!isFirstStep && (
        <button
          type="button"
          onClick={onBack}
          className="h-11 flex-1 rounded-xl text-[14px] font-medium text-white active:scale-[0.98] transition-transform shadow-[0_12px_28px_rgba(0,0,0,0.35)]"
          style={{
            background: BACK_BG,
            backdropFilter: "blur(18px) saturate(150%)",
            WebkitBackdropFilter: "blur(18px) saturate(150%)",
            border: BACK_BORDER,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          Back
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        className="h-11 flex-1 rounded-xl bg-primary text-[14px] font-bold text-primary-foreground active:scale-[0.98] transition-transform shadow-[0_12px_28px_rgba(0,0,0,0.35)]"
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {isLastStep ? "Got it" : "Next"}
      </button>
    </motion.div>
  );
}
