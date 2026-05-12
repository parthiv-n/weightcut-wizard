import { useState, useEffect, useMemo, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useAITask } from "@/contexts/AITaskContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { AIPersistence } from "@/lib/aiPersistence";
import { createAIAbortController } from "@/lib/timeoutWrapper";
import { logger } from "@/lib/logger";
import { ToastAction } from "@/components/ui/toast";
import { Droplets, Activity, CheckCircle } from "lucide-react";
import { createElement } from "react";
import type { RehydrationProtocol } from "@/pages/hydration/types";

export function useRehydrationProtocol() {
  const { userId, profile: contextProfile, userName } = useUser();
  const { toast } = useToast();
  const { addTask, completeTask, failTask } = useAITask();
  const { safeAsync, isMounted } = useSafeAsync();
  const { checkAIAccess, openNoGemsDialog, onAICallSuccess, handleAILimitError } = useSubscription();
  const rehydrationProtocolAction = useAction(api.actions.rehydrationProtocol.run);
  const aiAbortRef = useRef<AbortController | null>(null);

  const currentWeight = contextProfile?.current_weight_kg ?? 0;
  const fightWeekTarget = contextProfile?.fight_week_target_kg ?? contextProfile?.goal_weight_kg ?? null;
  const targetDate = contextProfile?.target_date ?? null;

  // Prefill weight-lost = current - fight-week target (if both present and current > target)
  const initialWeightLost = (() => {
    if (!currentWeight || !fightWeekTarget) return "";
    const diff = currentWeight - fightWeekTarget;
    if (diff <= 0 || diff > 15) return "";
    return diff.toFixed(1);
  })();
  // Prefill fight date from profile target_date when sensible (today or future)
  const initialFightDate = (() => {
    if (!targetDate) return new Date().toISOString().split("T")[0];
    const d = new Date(targetDate);
    if (isNaN(d.getTime())) return new Date().toISOString().split("T")[0];
    return d.toISOString().split("T")[0];
  })();

  const [weightLost, setWeightLost] = useState(initialWeightLost);
  const [weighInDate, setWeighInDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [weighInTime, setWeighInTime] = useState<string>("16:00");
  const [fightDate, setFightDate] = useState<string>(initialFightDate);
  const [fightTime, setFightTime] = useState<string>("21:00");
  const [glycogenDepletion, setGlycogenDepletion] = useState<string>("moderate");
  const [normalCarbs, setNormalCarbs] = useState<string>("");
  const [fightWeekCarbs, setFightWeekCarbs] = useState<string>("");
  const [protocol, setProtocol] = useState<RehydrationProtocol | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const availableHours = useMemo(() => {
    const weighIn = new Date(`${weighInDate}T${weighInTime}`);
    const fight = new Date(`${fightDate}T${fightTime}`);
    let diffMs = fight.getTime() - weighIn.getTime();
    if (diffMs <= 0) diffMs += 24 * 60 * 60 * 1000;
    const hours = diffMs / (1000 * 60 * 60);
    return Math.max(1, Math.round(hours * 2) / 2);
  }, [weighInDate, weighInTime, fightDate, fightTime]);

  // Awake hours: subtract 8h sleep for long windows (>10h)
  const awakeHours = useMemo(() => {
    return availableHours > 10 ? Math.max(4, Math.round(availableHours - 8)) : availableHours;
  }, [availableHours]);

  // Auto-derive glycogen depletion from carb inputs
  useEffect(() => {
    const normal = parseFloat(normalCarbs);
    const fightWeek = parseFloat(fightWeekCarbs);
    if (!normal || !fightWeek || normal <= 0) return;
    if (fightWeek < 50) {
      setGlycogenDepletion("significant");
    } else {
      const reduction = ((normal - fightWeek) / normal) * 100;
      setGlycogenDepletion(reduction >= 50 ? "moderate" : "none");
    }
  }, [normalCarbs, fightWeekCarbs]);

  useEffect(() => {
    loadPersistedProtocol();
  }, [userId]);

  // No warmup needed under Convex — actions are co-located with the deployment.

  const loadPersistedProtocol = () => {
    if (!userId || protocol) return;
    try {
      const persistedData = AIPersistence.load(userId, "rehydration_protocol");
      if (persistedData) {
        setProtocol(persistedData.protocol);
        if (persistedData.inputs) {
          setWeightLost(persistedData.inputs.weightLost || "");
          if (persistedData.inputs.weighInDate) setWeighInDate(persistedData.inputs.weighInDate);
          setWeighInTime(persistedData.inputs.weighInTime || persistedData.inputs.startTime || "16:00");
          if (persistedData.inputs.fightDate) setFightDate(persistedData.inputs.fightDate);
          setFightTime(persistedData.inputs.fightTime || "21:00");
          setGlycogenDepletion(persistedData.inputs.glycogenDepletion || "moderate");
          setNormalCarbs(persistedData.inputs.normalCarbs || "");
          setFightWeekCarbs(persistedData.inputs.fightWeekCarbs || "");
        }
      }
    } catch (error) {
      logger.error("Error loading persisted protocol", error);
    }
  };

  // Toast helper that includes a "Try again" action which re-runs generation.
  // Kept as a closure so the retry references the latest event handler.
  const showFailureToast = (title: string, description: string, retry: () => void) => {
    toast({
      title,
      description,
      variant: "destructive",
      action: createElement(
        ToastAction,
        { altText: "Try again", onClick: retry },
        "Try again",
      ),
    });
  };

  const handleGenerateProtocol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWeight) return;

    if (!checkAIAccess()) {
      openNoGemsDialog();
      return;
    }

    aiAbortRef.current?.abort();
    const controller = createAIAbortController();
    aiAbortRef.current = controller;

    safeAsync(setLoading)(true);
    safeAsync(setLastError)(null);
    // Intentionally NOT clearing `protocol` here — if the call fails the user
    // keeps their previous result visible instead of an empty page.
    const taskId = addTask({
      id: `rehydration-${Date.now()}`,
      type: "rehydration",
      label: "Generating Protocol",
      steps: [
        { icon: Droplets, label: "Calculating fluid needs" },
        { icon: Activity, label: "Planning timeline" },
        { icon: CheckCircle, label: "Generating protocol" },
      ],
      returnPath: "/weight-cut?tab=rehydration",
    });

    const retry = () => {
      // Synthesise a submit event so callers don't need to forward one.
      const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
      void handleGenerateProtocol(fakeEvent);
    };

    try {
      const weightLostKg = parseFloat(weightLost);
      const weighInWeightKg = Math.max(0.1, currentWeight - weightLostKg);
      // Action signature: { weighInWeightKg, fightWeightKg?, hoursUntilFight, sex, dehydrationPercent? }
      const sexNarrow: "male" | "female" =
        contextProfile?.sex === "female" ? "female" : "male";

      let data: any;
      try {
        data = await rehydrationProtocolAction({
          weighInWeightKg,
          fightWeightKg: currentWeight,
          hoursUntilFight: availableHours,
          sex: sexNarrow,
        });
      } catch (err: any) {
        if (await handleAILimitError(err)) { failTask(taskId, "Limit reached"); return; }
        throw new Error(err?.message || "Failed to generate protocol");
      }

      if (controller.signal.aborted) return;
      if (!isMounted()) return;

      if (data?.protocol) {
        onAICallSuccess();
        setProtocol(data.protocol);
        setLastError(null);

        // Only persist on success — failed/partial responses never reach this branch.
        if (userId) {
          AIPersistence.save(
            userId,
            "rehydration_protocol",
            {
              protocol: data.protocol,
              inputs: { weightLost, weighInDate, weighInTime, fightDate, fightTime, glycogenDepletion, normalCarbs, fightWeekCarbs },
            },
            168
          );
        }
        completeTask(taskId, data.protocol);
      } else {
        // Defensive: backend returned successfully but without the expected envelope.
        // Likely a backend regression — surface clearly and log to Sentry.
        const msg = "We had a partial response. Please try again.";
        logger.error("Rehydration protocol envelope missing", undefined, { data });
        failTask(taskId, msg);
        setLastError(msg);
        showFailureToast("AI didn't complete", msg, retry);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError' || controller.signal.aborted) return;
      if (!isMounted()) return;
      const msg = error?.message || "AI couldn't complete the protocol. Please try again.";
      failTask(taskId, msg);
      setLastError(msg);
      logger.error("Error generating protocol", error);
      showFailureToast("Protocol unavailable", msg, retry);
    } finally {
      safeAsync(setLoading)(false);
    }
  };

  const handleAICancel = () => {
    aiAbortRef.current?.abort();
    safeAsync(setLoading)(false);
  };

  // Profile summary
  const profileParts = [
    userName || "Athlete",
    currentWeight ? `${currentWeight}kg` : null,
    contextProfile?.sex ? (contextProfile.sex === "male" ? "Male" : "Female") : null,
    contextProfile?.age ? `${contextProfile.age}y` : null,
  ].filter(Boolean);

  return {
    // Input state
    weightLost, setWeightLost,
    weighInDate, setWeighInDate,
    weighInTime, setWeighInTime,
    fightDate, setFightDate,
    fightTime, setFightTime,
    glycogenDepletion,
    normalCarbs, setNormalCarbs,
    fightWeekCarbs, setFightWeekCarbs,
    availableHours,
    awakeHours,
    // Protocol state
    protocol,
    loading,
    lastError,
    // Derived
    currentWeight,
    profileParts,
    // Actions
    handleGenerateProtocol,
    handleAICancel,
  };
}
