import { Component, useEffect, useState, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TutorialSpotlight } from "./TutorialSpotlight";
import { TutorialTooltip } from "./TutorialTooltip";
import type { TutorialStep } from "./types";

interface OverlayProps {
  isActive: boolean;
  currentStep: TutorialStep | null;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  resolveTarget: (step: TutorialStep) => HTMLElement | null;
}

// Inline error boundary so overlay silently fails
class OverlayErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // silent — tutorial overlay is non-critical
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

/**
 * Lock background scrolling when spotlighting a specific element.
 * For full-page showcase steps (no target), leave scroll unlocked
 * so the page content is visible behind the lighter dim.
 */
function useBodyScrollLock(active: boolean, hasTarget: boolean) {
  useEffect(() => {
    // Only lock scroll when spotlighting a specific element
    if (!active || !hasTarget) return;

    const html = document.documentElement;
    const prevHtmlOverflow = html.style.overflow;
    html.style.overflow = "hidden";

    const scrollContainer = document.querySelector<HTMLElement>(
      ".flex-1.overflow-auto"
    );
    const prevContainerOverflow = scrollContainer?.style.overflow ?? "";
    if (scrollContainer) scrollContainer.style.overflow = "hidden";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      if (scrollContainer) scrollContainer.style.overflow = prevContainerOverflow;
    };
  }, [active, hasTarget]);
}

/**
 * Poll for a target element up to ~2s after the step changes.
 * Handles lazy-loaded pages where the DOM element isn't available immediately.
 */
function useResolvedTarget(
  step: TutorialStep | null,
  resolveTarget: (step: TutorialStep) => HTMLElement | null,
  isActive: boolean
): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isActive || !step?.target) {
      setEl(null);
      return;
    }

    // Try immediately
    const found = resolveTarget(step);
    if (found) {
      setEl(found);
      return;
    }

    // Poll every 100ms for up to 2s
    let elapsed = 0;
    intervalRef.current = setInterval(() => {
      elapsed += 100;
      const resolved = resolveTarget(step);
      if (resolved || elapsed >= 2000) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setEl(resolved);
      }
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [step?.id, step?.target, isActive, resolveTarget]);

  return el;
}

function TutorialOverlayInner({
  isActive,
  currentStep,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  resolveTarget,
}: OverlayProps) {
  const targetEl = useResolvedTarget(currentStep, resolveTarget, isActive);
  const hasTarget = !!(currentStep?.target);
  useBodyScrollLock(isActive, hasTarget);

  if (!isActive || !currentStep) return null;

  return createPortal(
    <div
      className="fixed inset-0"
      style={{
        zIndex: 10003,
        pointerEvents: "none",
        // Cover full dynamic viewport on mobile
        width: "100vw",
        height: "100dvh",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
      }}
      aria-live="polite"
      aria-label="Tutorial"
    >
      <TutorialSpotlight targetEl={targetEl} offset={currentStep.spotlightOffset} />
      <TutorialTooltip
        step={currentStep}
        stepIndex={currentStepIndex}
        totalSteps={totalSteps}
        targetEl={targetEl}
        onNext={onNext}
        onPrev={onPrev}
        onSkip={onSkip}
      />
    </div>,
    document.body
  );
}

export function TutorialOverlay(props: OverlayProps) {
  return (
    <OverlayErrorBoundary>
      <TutorialOverlayInner {...props} />
    </OverlayErrorBoundary>
  );
}
