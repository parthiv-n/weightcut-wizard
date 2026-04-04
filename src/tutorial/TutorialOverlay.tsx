import { Component, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

class OverlayErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {}
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function TutorialOverlayInner({
  isActive,
  currentStep,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: OverlayProps) {
  if (!isActive || !currentStep) return null;

  return createPortal(
    <div
      className="fixed inset-0"
      style={{
        zIndex: 10003,
        pointerEvents: "none",
        width: "100vw",
        height: "100dvh",
      }}
      aria-live="polite"
      aria-label="Tutorial"
    >
      <TutorialTooltip
        step={currentStep}
        stepIndex={currentStepIndex}
        totalSteps={totalSteps}
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
