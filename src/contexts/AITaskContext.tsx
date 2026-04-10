import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface AIStep {
  icon: LucideIcon;
  label: string;
  color?: string;
}

export type AITaskType =
  | "meal-analysis" | "ingredient-lookup" | "meal-plan"
  | "diet-analysis" | "weight-analysis" | "rehydration"
  | "fight-week" | "gym-routine" | "training-summary"
  | "fight-camp-coach";

export interface AITask {
  id: string;
  type: AITaskType;
  label: string;
  status: "running" | "done" | "error";
  steps: AIStep[];
  currentStep: number;
  startedAt: number;
  returnPath: string;
  result?: any;
  error?: string;
}

interface AITaskInternal extends AITask {
  completedAt?: number;
  failedAt?: number;
}

interface AITaskContextType {
  tasks: AITask[];
  activeTask: AITask | null;
  addTask: (task: { id: string; type: AITaskType; label: string; steps: AIStep[]; returnPath: string }) => string;
  updateStep: (id: string, step: number) => void;
  completeTask: (id: string, result?: any) => void;
  failTask: (id: string, error: string) => void;
  dismissTask: (id: string) => void;
  getTask: (id: string) => AITask | undefined;
}

const AITaskContext = createContext<AITaskContextType | undefined>(undefined);

export function AITaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<AITaskInternal[]>([]);

  const addTask = useCallback(
    (task: { id: string; type: AITaskType; label: string; steps: AIStep[]; returnPath: string }): string => {
      setTasks((prev) => {
        const filtered = prev.filter((t) => !(t.type === task.type && t.status === "running"));
        return [
          ...filtered,
          {
            ...task,
            status: "running" as const,
            currentStep: 0,
            startedAt: Date.now(),
          },
        ];
      });
      return task.id;
    },
    []
  );

  const updateStep = useCallback((id: string, step: number) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, currentStep: step } : t)));
  }, []);

  const completeTask = useCallback((id: string, result?: any) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: "done" as const, result, currentStep: t.steps.length - 1, completedAt: Date.now() }
          : t
      )
    );
  }, []);

  const failTask = useCallback((id: string, error: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "error" as const, error, failedAt: Date.now() } : t)));
  }, []);

  const dismissTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const getTask = useCallback((id: string): AITask | undefined => {
    return tasks.find((t) => t.id === id);
  }, [tasks]);

  const activeTask: AITask | null =
    [...tasks].reverse().find((t) => t.status === "running") ?? null;

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTasks((prev) => prev.filter((t) => {
        if (t.status === "done" && t.completedAt && now - t.completedAt > 300_000) return false;
        if (t.status === "error" && t.failedAt && now - t.failedAt > 5_000) return false;
        return true;
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AITaskContext.Provider
      value={{ tasks, activeTask, addTask, updateStep, completeTask, failTask, dismissTask, getTask }}
    >
      {children}
    </AITaskContext.Provider>
  );
}

export function useAITask() {
  const context = useContext(AITaskContext);
  if (!context) {
    throw new Error("useAITask must be used within AITaskProvider");
  }
  return context;
}
