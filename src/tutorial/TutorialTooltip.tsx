import { useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Sparkles, X } from "lucide-react";
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

/**
 * App tutorial tooltip — visual template ported from the Fight Form
 * calibration `TutorialDialog` so both flows feel like one product:
 *  - Tiny eyebrow "X of Y · Tutorial" instead of an inline counter.
 *  - Icon squircle on the left of the title (uses Sparkles fallback
 *    since `TutorialStep` doesn't carry a per-step icon — easy to wire
 *    one in later if any flow wants per-step iconography).
 *  - Larger title + relaxed body copy at 13.5px/leading-relaxed.
 *  - Centered dot pager (animated active dot) at the bottom.
 *  - Footer: ghost "Back" + filled "Next/Got it" — same word the
 *    Fight Form tour uses on the last step.
 *  - Skip lives as a discreet X in the top-right (mirrors the Dialog's
 *    built-in close affordance) so the bottom row is just navigation.
 */
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
        initial: { opacity: 0, scale: 0.97 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.97 },
        transition: { duration: 0.16, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
      };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step.id}
        ref={setTooltipRef}
        className="fixed max-w-sm w-auto rounded-3xl bg-card border border-border shadow-[0_12px_48px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.6)] overflow-hidden"
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
        {/* Discreet skip — mirrors the Dialog's built-in close X. */}
        <button
          onClick={onSkip}
          aria-label="Skip tutorial"
          className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground active:bg-muted/60 transition-colors"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <X className="h-4 w-4" strokeWidth={2.4} />
        </button>

        <div className="p-6 pr-12 space-y-5">
          {/* Eyebrow — same shape as the Fight Form tour. */}
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 font-bold">
            {stepIndex + 1} of {totalSteps} · Tutorial
          </span>

          {/* Title row with icon squircle. */}
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-2xl bg-muted/40 border border-border/50 flex items-center justify-center shrink-0">
              <Sparkles className="size-5 text-foreground/80" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold leading-tight">{step.title}</h3>
            </div>
          </div>

          {/* Body */}
          <p className="text-[13.5px] text-muted-foreground leading-relaxed">
            {step.description}
          </p>

          {/* Dot pager — centered, animated active dot. */}
          <div className="flex justify-center gap-1.5 pt-1">
            {Array.from({ length: totalSteps }, (_, i) => (
              <span
                key={i}
                className={
                  i === stepIndex
                    ? "h-1.5 w-5 rounded-full bg-foreground transition-all"
                    : "h-1.5 w-1.5 rounded-full bg-muted-foreground/30 transition-all"
                }
              />
            ))}
          </div>

          {/* Footer — ghost Back + filled Next/Got it. */}
          <div className="flex gap-2 pt-1">
            {!isFirstStep && (
              <button
                onClick={onPrev}
                className="flex-1 h-11 rounded-xl text-[14px] font-medium text-muted-foreground active:bg-muted/40 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={onNext}
              className="flex-1 h-11 rounded-xl text-[14px] font-bold text-primary-foreground bg-primary active:scale-[0.98] transition-transform"
            >
              {isLastStep ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
