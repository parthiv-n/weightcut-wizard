import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { TutorialStep, TooltipPosition } from "./types";

interface TooltipProps {
  step: TutorialStep;
  stepIndex: number;
  totalSteps: number;
  targetEl: HTMLElement | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

const GAP = 10;
const BOTTOM_NAV_HEIGHT = 64;
const EDGE_INSET = 12;

/**
 * Measure safe-area-inset-bottom once (home indicator on notch iPhones).
 * Lazy probe — created on first call, measured, then removed.
 */
let _cachedSafeBottom: number | null = null;
function getSafeAreaBottom(): number {
  if (_cachedSafeBottom !== null) return _cachedSafeBottom;
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden";
    document.body.appendChild(probe);
    _cachedSafeBottom = probe.offsetHeight || 0;
    document.body.removeChild(probe);
  } catch {
    _cachedSafeBottom = 0;
  }
  return _cachedSafeBottom;
}

/** Get effective viewport, preferring iOS visualViewport when available */
function getViewport() {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}

/**
 * Compute only the vertical (top) position of the tooltip.
 * Horizontal centering is handled entirely by CSS (left:12px; right:12px; margin:auto).
 */
function computeTop(
  targetEl: HTMLElement | null,
  preferred: TooltipPosition,
  tooltipEl: HTMLElement | null
): { top: number; resolvedPosition: "above" | "below" | "center" } {
  const vp = getViewport();
  const safeBottom = getSafeAreaBottom();
  const usableBottom = vp.height - BOTTOM_NAV_HEIGHT - safeBottom;
  const th = tooltipEl?.offsetHeight ?? 180;

  // Center mode — no target element
  if (!targetEl || preferred === "center") {
    return {
      top: Math.max(EDGE_INSET, (usableBottom - th) / 2),
      resolvedPosition: "center",
    };
  }

  const tr = targetEl.getBoundingClientRect();

  // Try preferred vertical side, then flip
  const spaceAbove = tr.top - GAP - EDGE_INSET;
  const spaceBelow = usableBottom - tr.bottom - GAP;

  const wantsBelow = preferred === "bottom" || preferred === "right";

  if (wantsBelow && spaceBelow >= th) {
    return { top: tr.bottom + GAP, resolvedPosition: "below" };
  }
  if (!wantsBelow && spaceAbove >= th) {
    return { top: tr.top - GAP - th, resolvedPosition: "above" };
  }
  // Flip
  if (spaceBelow >= th) {
    return { top: tr.bottom + GAP, resolvedPosition: "below" };
  }
  if (spaceAbove >= th) {
    return { top: tr.top - GAP - th, resolvedPosition: "above" };
  }
  // Neither side fits — clamp into usable area
  return {
    top: Math.max(EDGE_INSET, Math.min(usableBottom - th, tr.bottom + GAP)),
    resolvedPosition: "below",
  };
}

export function TutorialTooltip({
  step,
  stepIndex,
  totalSteps,
  targetEl,
  onNext,
  onPrev,
  onSkip,
}: TooltipProps) {
  const prefersReduced = useReducedMotion();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [topPx, setTopPx] = useState(0);
  const [resolved, setResolved] = useState<"above" | "below" | "center">("center");

  const updatePos = useCallback(() => {
    const result = computeTop(targetEl, step.position, tooltipRef.current);
    setTopPx(result.top);
    setResolved(result.resolvedPosition);
  }, [targetEl, step.position]);

  // Recompute when step changes — immediate pass avoids visible jump,
  // delayed pass refines after spotlight scroll settles.
  useEffect(() => {
    updatePos();
    const t = setTimeout(updatePos, 380);
    return () => clearTimeout(t);
  }, [updatePos, step.id]);

  // Recompute on resize, scroll, iOS visual viewport changes
  useEffect(() => {
    window.addEventListener("resize", updatePos, { passive: true });
    window.addEventListener("scroll", updatePos, { passive: true });
    window.visualViewport?.addEventListener("resize", updatePos);
    window.visualViewport?.addEventListener("scroll", updatePos);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos);
      window.visualViewport?.removeEventListener("resize", updatePos);
      window.visualViewport?.removeEventListener("scroll", updatePos);
    };
  }, [updatePos]);

  const isCenter = resolved === "center";
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;

  const motionProps = prefersReduced
    ? {}
    : {
        initial: { opacity: 0, y: resolved === "above" ? -8 : 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: resolved === "above" ? -8 : 8 },
        transition: { duration: 0.25, ease: [0.32, 0.72, 0, 1] },
      };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step.id}
        ref={tooltipRef}
        /*
         * Horizontal positioning is 100% CSS — left/right insets + margin:auto.
         * This can NEVER overflow on any screen width.
         * Only `top` is computed in JS.
         */
        className="fixed max-w-[320px] rounded-2xl p-4
          bg-[rgba(20,20,22,0.95)]
          border border-[rgba(255,255,255,0.1)]
          shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        style={{
          pointerEvents: "auto",
          zIndex: 10004,
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          top: topPx,
          left: EDGE_INSET,
          right: EDGE_INSET,
          marginLeft: "auto",
          marginRight: "auto",
        }}
        {...motionProps}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium tabular-nums">
            {stepIndex + 1} of {totalSteps}
          </span>
          <button
            onClick={onSkip}
            className="min-h-[44px] min-w-[44px] flex items-center justify-end
              text-xs text-muted-foreground active:text-foreground transition-colors font-medium
              touch-manipulation"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            Skip
          </button>
        </div>

        {/* Content */}
        <h3 className="text-[15px] font-semibold text-foreground mb-1 leading-snug">
          {step.title}
        </h3>
        <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
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
            className="min-h-[44px] px-6 rounded-xl text-sm font-bold text-primary-foreground
              bg-gradient-to-r from-primary to-secondary
              shadow-lg shadow-primary/20
              active:scale-95 transition-transform touch-manipulation"
          >
            {isLastStep ? "Done" : "Next"}
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === stepIndex
                  ? "w-4 bg-primary"
                  : i < stepIndex
                    ? "w-1.5 bg-primary/50"
                    : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
