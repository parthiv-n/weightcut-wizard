import { Component, useEffect, type ReactNode } from "react";
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
  const hasTarget = !!(currentStep?.target);
  useBodyScrollLock(isActive, hasTarget);

  if (!isActive || !currentStep) return null;

  const targetEl = currentStep.target ? resolveTarget(currentStep) : null;

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
      <TutorialSpotlight targetEl={targetEl} />
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
