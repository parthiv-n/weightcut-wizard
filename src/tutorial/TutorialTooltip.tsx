import { useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { TutorialStep } from "./types";

interface TooltipProps {
  step: TutorialStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

const EDGE_INSET = 16;

export function TutorialTooltip({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: TooltipProps) {
  const prefersReduced = useReducedMotion();
  const tooltipEl = useRef<HTMLDivElement | null>(null);
  const setTooltipRef = useCallback((el: HTMLDivElement | null) => { tooltipEl.current = el; }, []);

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;

  const motionProps = prefersReduced
    ? {}
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.1 },
      };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step.id}
        ref={setTooltipRef}
        className="fixed max-w-[340px] rounded-3xl p-5
          bg-[rgba(18,18,20,0.97)]
          border border-[rgba(255,255,255,0.08)]
          shadow-[0_12px_48px_rgba(0,0,0,0.6)]"
        style={{
          pointerEvents: "auto",
          zIndex: 10004,
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          top: "50%",
          left: EDGE_INSET,
          right: EDGE_INSET,
          marginLeft: "auto",
          marginRight: "auto",
          transform: "translateY(-50%)",
        }}
        {...motionProps}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] text-muted-foreground/60 font-medium tabular-nums tracking-wide">
            {stepIndex + 1} / {totalSteps}
          </span>
          <button
            onClick={onSkip}
            className="min-h-[44px] min-w-[44px] flex items-center justify-end
              text-xs text-muted-foreground/60 active:text-foreground transition-colors font-medium
              touch-manipulation"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            Skip
          </button>
        </div>

        {/* Content */}
        <h3 className="text-base font-bold text-foreground mb-1.5 leading-snug">
          {step.title}
        </h3>
        <p className="text-[13px] text-muted-foreground/80 leading-relaxed mb-4">
          {step.description}
        </p>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          {!isFirstStep ? (
            <button
              onClick={onPrev}
              className="min-h-[44px] min-w-[44px] flex items-center justify-start
                text-sm text-muted-foreground active:text-foreground transition-colors font-medium
                touch-manipulation"
            >
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onNext}
            className="min-h-[44px] px-7 rounded-xl text-sm font-bold text-primary-foreground
              bg-gradient-to-r from-primary to-secondary
              shadow-lg shadow-primary/20
              active:scale-95 transition-transform touch-manipulation"
          >
            {isLastStep ? "Done" : "Next"}
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-4 flex-wrap">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === stepIndex
                  ? "w-5 bg-primary"
                  : i < stepIndex
                    ? "w-1.5 bg-primary/50"
                    : "w-1.5 bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
