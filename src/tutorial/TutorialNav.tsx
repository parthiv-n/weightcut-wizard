import { motion } from "motion/react";
import { X } from "lucide-react";

interface TutorialNavProps {
  isFirstStep: boolean;
  isLastStep: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

export function TutorialNav({ isFirstStep, isLastStep, onBack, onNext, onSkip }: TutorialNavProps) {
  return (
    <>
      <button
        type="button"
        onClick={onSkip}
        aria-label="Skip tutorial"
        className="absolute z-10 flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-white/85"
        style={{
          top: "calc(env(safe-area-inset-top) + 14px)",
          right: "calc(env(safe-area-inset-right) + 14px)",
          background: "rgba(255,255,255,0.10)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.10)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.4} />
        Skip
      </button>

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
    </>
  );
}
