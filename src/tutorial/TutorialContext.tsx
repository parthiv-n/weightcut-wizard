import {
  createContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { TutorialManager } from "./tutorialManager";
import { tutorialPersistence } from "./tutorialPersistence";
import { onboardingFlow } from "./flows/onboardingFlow";
import { featureFlows } from "./flows/featureFlows";
import { TutorialOverlay } from "./TutorialOverlay";
import type {
  TutorialStep,
  TutorialManagerState,
  UserTutorialState,
} from "./types";
import { deriveGoalType } from "./types";

export interface TutorialContextValue {
  isActive: boolean;
  currentStep: TutorialStep | null;
  currentStepIndex: number;
  totalSteps: number;
  next: () => void;
  prev: () => void;
  skip: () => void;
  triggerTutorial: (flowId: string) => void;
  replayTutorial: (flowId: string) => void;
}

export const TutorialContext = createContext<TutorialContextValue | null>(null);

/** Delay before showing tooltip after a route navigation (lets lazy page load + animate) */
const NAV_SETTLE_MS = 600;

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { userId, profile, hasProfile } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const managerRef = useRef(new TutorialManager());
  const autoTriggeredRef = useRef(false);
  const pausedFlowRef = useRef<{ flowId: string; stepIndex: number } | null>(null);
  const isPausingRef = useRef(false);

  // Whether we're waiting for a navigation to settle before revealing the tooltip
  const [waitingForNav, setWaitingForNav] = useState(false);

  const [state, setState] = useState<TutorialManagerState>({
    isActive: false,
    currentFlow: null,
    currentStep: null,
    currentStepIndex: 0,
    totalSteps: 0,
    activeSteps: [],
  });

  // Build user state for condition evaluation
  const getUserState = useCallback((): UserTutorialState => {
    return {
      goalType: deriveGoalType(profile),
      currentRoute: location.pathname,
      hasProfile: hasProfile,
      profileData: profile,
    };
  }, [profile, hasProfile, location.pathname]);

  // Register all flows on mount
  useEffect(() => {
    const manager = managerRef.current;
    manager.registerFlow(onboardingFlow);
    manager.registerFlows(featureFlows);
  }, []);

  // Subscribe to manager state changes
  useEffect(() => {
    const manager = managerRef.current;
    const unsub = manager.subscribe((newState) => {
      setState(newState);

      // If flow just completed (isActive false but currentFlow present), persist
      // But NOT if we're just pausing (navigating away mid-tutorial)
      if (!newState.isActive && newState.currentFlow && userId && !isPausingRef.current) {
        tutorialPersistence.markFlowCompleted(
          userId,
          newState.currentFlow.id,
          newState.currentFlow.version
        );
      }
    });
    return unsub;
  }, [userId]);

  // Persist progress on step changes
  useEffect(() => {
    if (state.isActive && state.currentFlow && userId) {
      tutorialPersistence.saveProgress(
        userId,
        state.currentFlow.id,
        state.currentStepIndex
      );
    }
  }, [state.isActive, state.currentFlow, state.currentStepIndex, userId]);

  // --- Navigation handling ---
  // When the current step has a `navigateTo` that differs from location, navigate there.
  // Hide the tooltip while navigating, then reveal once the route matches.
  useEffect(() => {
    if (!state.isActive || !state.currentStep) return;

    const target = state.currentStep.navigateTo;
    if (!target) {
      // No navigation needed — make sure overlay is visible
      setWaitingForNav(false);
      return;
    }

    if (location.pathname !== target) {
      // Need to navigate — hide overlay during transition
      setWaitingForNav(true);
      navigate(target);
    }
  }, [state.currentStep, state.isActive, location.pathname, navigate]);

  // When we arrive at the correct route after a navigateTo, reveal the tooltip after settling
  useEffect(() => {
    if (!waitingForNav || !state.isActive || !state.currentStep) return;

    const target = state.currentStep.navigateTo;
    if (target && location.pathname === target) {
      const t = setTimeout(() => setWaitingForNav(false), NAV_SETTLE_MS);
      return () => clearTimeout(t);
    }
  }, [waitingForNav, location.pathname, state.isActive, state.currentStep]);

  // Auto-trigger onboarding on /dashboard
  useEffect(() => {
    if (
      location.pathname === "/dashboard" &&
      userId &&
      hasProfile &&
      !autoTriggeredRef.current &&
      !state.isActive
    ) {
      // Check if we should resume a paused flow
      if (pausedFlowRef.current) {
        const { flowId, stepIndex } = pausedFlowRef.current;
        pausedFlowRef.current = null;
        const timer = setTimeout(() => {
          managerRef.current.start(flowId, getUserState(), stepIndex);
        }, 400);
        return () => clearTimeout(timer);
      }

      // Check if onboarding already completed
      if (tutorialPersistence.isFlowCompleted(userId, onboardingFlow)) {
        autoTriggeredRef.current = true;
        return;
      }

      // Start onboarding after dashboard animations finish
      autoTriggeredRef.current = true;
      const timer = setTimeout(() => {
        managerRef.current.start("onboarding", getUserState());
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [location.pathname, userId, hasProfile, state.isActive, getUserState]);

  // Pause on route change — ONLY if the user navigated manually (not via tutorial navigation).
  // If the step has `navigateTo`, we expect the route to differ temporarily.
  useEffect(() => {
    if (!state.isActive || !state.currentStep) return;

    const step = state.currentStep;
    // If the step specifies navigateTo, the context handles navigation — don't pause
    if (step.navigateTo) return;
    // If the step specifies a route and we're not on it, pause
    if (step.route && step.route !== location.pathname) {
      pausedFlowRef.current = {
        flowId: state.currentFlow!.id,
        stepIndex: state.currentStepIndex,
      };
      isPausingRef.current = true;
      managerRef.current.skip();
      isPausingRef.current = false;
    }
  }, [location.pathname, state.isActive, state.currentStep, state.currentFlow, state.currentStepIndex]);

  const next = useCallback(() => {
    managerRef.current.next(getUserState());
  }, [getUserState]);

  const prev = useCallback(() => {
    managerRef.current.prev(getUserState());
  }, [getUserState]);

  const skip = useCallback(() => {
    pausedFlowRef.current = null;
    if (state.currentFlow && userId) {
      tutorialPersistence.markFlowCompleted(
        userId,
        state.currentFlow.id,
        state.currentFlow.version
      );
    }
    managerRef.current.skip();
    // Navigate back to dashboard when skipping mid-tour on another page
    if (location.pathname !== "/dashboard") {
      navigate("/dashboard");
    }
  }, [state.currentFlow, userId, location.pathname, navigate]);

  const triggerTutorial = useCallback(
    (flowId: string) => {
      managerRef.current.start(flowId, getUserState());
    },
    [getUserState]
  );

  const replayTutorial = useCallback(
    (flowId: string) => {
      if (userId) {
        tutorialPersistence.clearFlow(userId, flowId);
      }
      autoTriggeredRef.current = false;
      managerRef.current.start(flowId, getUserState());
    },
    [userId, getUserState]
  );

  // Don't show overlay while waiting for navigation to settle
  const showOverlay = state.isActive && !waitingForNav;

  const value: TutorialContextValue = {
    isActive: state.isActive,
    currentStep: state.currentStep,
    currentStepIndex: state.currentStepIndex,
    totalSteps: state.totalSteps,
    next,
    prev,
    skip,
    triggerTutorial,
    replayTutorial,
  };

  return (
    <TutorialContext.Provider value={value}>
      {children}
      <TutorialOverlay
        isActive={showOverlay}
        currentStep={state.currentStep}
        currentStepIndex={state.currentStepIndex}
        totalSteps={state.totalSteps}
        onNext={next}
        onPrev={prev}
        onSkip={skip}
        resolveTarget={(step) => managerRef.current.resolveTarget(step)}
      />
    </TutorialContext.Provider>
  );
}
