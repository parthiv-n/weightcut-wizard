import type { TutorialPersistenceData, TutorialFlow } from "./types";

const STORAGE_PREFIX = "wcw_tutorial_";

function getKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function getDefault(): TutorialPersistenceData {
  return {
    completedFlows: {},
    currentFlow: null,
    currentStepIndex: 0,
  };
}

export const tutorialPersistence = {
  load(userId: string): TutorialPersistenceData {
    try {
      const raw = localStorage.getItem(getKey(userId));
      if (!raw) return getDefault();
      return JSON.parse(raw) as TutorialPersistenceData;
    } catch {
      return getDefault();
    }
  },

  save(userId: string, data: TutorialPersistenceData): void {
    try {
      localStorage.setItem(getKey(userId), JSON.stringify(data));
    } catch {
      // localStorage full or unavailable — silent fail
    }
  },

  isFlowCompleted(userId: string, flow: TutorialFlow): boolean {
    const data = this.load(userId);
    const storedVersion = data.completedFlows[flow.id];
    return storedVersion !== undefined && storedVersion >= flow.version;
  },

  markFlowCompleted(userId: string, flowId: string, version: number): void {
    const data = this.load(userId);
    data.completedFlows[flowId] = version;
    data.currentFlow = null;
    data.currentStepIndex = 0;
    this.save(userId, data);
  },

  saveProgress(userId: string, flowId: string, stepIndex: number): void {
    const data = this.load(userId);
    data.currentFlow = flowId;
    data.currentStepIndex = stepIndex;
    this.save(userId, data);
  },

  clearFlow(userId: string, flowId: string): void {
    const data = this.load(userId);
    delete data.completedFlows[flowId];
    if (data.currentFlow === flowId) {
      data.currentFlow = null;
      data.currentStepIndex = 0;
    }
    this.save(userId, data);
  },

  clearAll(userId: string): void {
    try {
      localStorage.removeItem(getKey(userId));
    } catch {
      // silent
    }
  },
};
