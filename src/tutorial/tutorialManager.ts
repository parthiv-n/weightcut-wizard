import type {
  TutorialFlow,
  TutorialStep,
  TutorialManagerState,
  UserTutorialState,
} from "./types";

export type TutorialListener = (state: TutorialManagerState) => void;

function getInitialState(): TutorialManagerState {
  return {
    isActive: false,
    currentFlow: null,
    currentStep: null,
    currentStepIndex: 0,
    totalSteps: 0,
    activeSteps: [],
  };
}

export class TutorialManager {
  private flows = new Map<string, TutorialFlow>();
  private state: TutorialManagerState = getInitialState();
  private listeners = new Set<TutorialListener>();
  private transitioning = false;

  // --- Registration ---

  registerFlow(flow: TutorialFlow): void {
    this.flows.set(flow.id, flow);
  }

  registerFlows(flows: TutorialFlow[]): void {
    flows.forEach((f) => this.registerFlow(f));
  }

  getFlow(flowId: string): TutorialFlow | undefined {
    return this.flows.get(flowId);
  }

  // --- Lifecycle ---

  start(flowId: string, userState: UserTutorialState, resumeIndex = 0): void {
    const flow = this.flows.get(flowId);
    if (!flow) return;

    const activeSteps = this.getActiveSteps(flow, userState);
    if (activeSteps.length === 0) return;

    const startIndex = Math.min(resumeIndex, activeSteps.length - 1);

    this.state = {
      isActive: true,
      currentFlow: flow,
      currentStep: activeSteps[startIndex],
      currentStepIndex: startIndex,
      totalSteps: activeSteps.length,
      activeSteps,
    };
    this.notify();
  }

  next(userState: UserTutorialState): void {
    if (!this.state.isActive || !this.state.currentFlow || this.transitioning) return;
    this.transitioning = true;

    const { activeSteps, currentStepIndex } = this.state;
    let nextIndex = currentStepIndex + 1;

    // Skip steps whose target is missing from DOM
    // (but don't skip navigateTo steps — the target will appear after navigation)
    while (nextIndex < activeSteps.length) {
      const step = activeSteps[nextIndex];
      if (!step.target || step.navigateTo || this.resolveTarget(step)) break;
      nextIndex++;
    }

    if (nextIndex >= activeSteps.length) {
      this.complete();
    } else {
      this.state = {
        ...this.state,
        currentStep: activeSteps[nextIndex],
        currentStepIndex: nextIndex,
      };
      this.notify();
    }

    this.transitioning = false;
  }

  prev(userState: UserTutorialState): void {
    if (!this.state.isActive || !this.state.currentFlow || this.transitioning) return;
    this.transitioning = true;

    const { activeSteps, currentStepIndex } = this.state;
    let prevIndex = currentStepIndex - 1;

    // Skip steps whose target is missing
    // (but don't skip navigateTo steps — the target will appear after navigation)
    while (prevIndex >= 0) {
      const step = activeSteps[prevIndex];
      if (!step.target || step.navigateTo || this.resolveTarget(step)) break;
      prevIndex--;
    }

    if (prevIndex >= 0) {
      this.state = {
        ...this.state,
        currentStep: activeSteps[prevIndex],
        currentStepIndex: prevIndex,
      };
      this.notify();
    }

    this.transitioning = false;
  }

  skip(): void {
    this.complete();
  }

  private complete(): void {
    const flow = this.state.currentFlow;
    // Reset state but keep flow reference so context can persist completion
    this.state = { ...getInitialState(), currentFlow: flow };
    this.notify();
    // Clear the flow reference after notifying
    this.state = getInitialState();
  }

  // --- Queries ---

  getState(): TutorialManagerState {
    return this.state;
  }

  resolveTarget(step: TutorialStep): HTMLElement | null {
    if (!step.target) return null;
    return document.querySelector<HTMLElement>(
      `[data-tutorial="${step.target}"]`
    );
  }

  getActiveSteps(
    flow: TutorialFlow,
    userState: UserTutorialState
  ): TutorialStep[] {
    return flow.steps.filter(
      (step) => !step.condition || step.condition(userState)
    );
  }

  // --- Subscription ---

  subscribe(listener: TutorialListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = { ...this.state };
    this.listeners.forEach((l) => l(snapshot));
  }
}
