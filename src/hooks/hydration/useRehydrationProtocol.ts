import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { AIPersistence } from "@/lib/aiPersistence";
import { createAIAbortController, extractEdgeFunctionError } from "@/lib/timeoutWrapper";
import { logger } from "@/lib/logger";
import type { RehydrationProtocol } from "@/pages/hydration/types";

export function useRehydrationProtocol() {
  const { userId, profile: contextProfile, userName } = useUser();
  const { toast } = useToast();
  const { safeAsync, isMounted } = useSafeAsync();
  const { checkAIAccess, openPaywall, incrementLocalUsage, markLimitReached } = useSubscription();
  const aiAbortRef = useRef<AbortController | null>(null);

  const currentWeight = contextProfile?.current_weight_kg ?? 0;

  const [weightLost, setWeightLost] = useState("");
  const [weighInDate, setWeighInDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [weighInTime, setWeighInTime] = useState<string>("16:00");
  const [fightDate, setFightDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [fightTime, setFightTime] = useState<string>("21:00");
  const [glycogenDepletion, setGlycogenDepletion] = useState<string>("moderate");
  const [normalCarbs, setNormalCarbs] = useState<string>("");
  const [fightWeekCarbs, setFightWeekCarbs] = useState<string>("");
  const [protocol, setProtocol] = useState<RehydrationProtocol | null>(null);
  const [loading, setLoading] = useState(false);

  const availableHours = useMemo(() => {
    const weighIn = new Date(`${weighInDate}T${weighInTime}`);
    const fight = new Date(`${fightDate}T${fightTime}`);
    let diffMs = fight.getTime() - weighIn.getTime();
    if (diffMs <= 0) diffMs += 24 * 60 * 60 * 1000;
    const hours = diffMs / (1000 * 60 * 60);
    return Math.max(1, Math.round(hours * 2) / 2);
  }, [weighInDate, weighInTime, fightDate, fightTime]);

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

  // Warmup ping
  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(() => {
      supabase.functions.invoke("rehydration-protocol", { method: "GET" } as any).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [userId]);

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

  const handleGenerateProtocol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWeight) return;

    aiAbortRef.current?.abort();
    const controller = createAIAbortController();
    aiAbortRef.current = controller;

    safeAsync(setLoading)(true);

    try {
      if (!checkAIAccess()) {
        openPaywall();
        return;
      }

      const { data, error } = await supabase.functions.invoke("rehydration-protocol", {
        body: {
          weightLostKg: parseFloat(weightLost),
          availableHours,
          weighInTiming: availableHours <= 6 ? "same-day" : "day-before",
          currentWeightKg: currentWeight,
          glycogenDepletion,
          sex: contextProfile?.sex,
          age: contextProfile?.age,
          heightCm: contextProfile?.height_cm,
          activityLevel: contextProfile?.activity_level,
          trainingFrequency: contextProfile?.training_frequency,
          tdee: contextProfile?.tdee,
          goalWeightKg: contextProfile?.goal_weight_kg,
          fightWeekTargetKg: contextProfile?.fight_week_target_kg,
        },
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;
      if (!isMounted()) return;
      if (error) {
        const errBody = typeof error === 'object' && 'context' in error ? (error as any).context : null;
        if (errBody?.status === 429) {
          markLimitReached();
          openPaywall();
          return;
        }
        throw new Error(await extractEdgeFunctionError(error, "Failed to generate protocol"));
      }

      if (data?.protocol) {
        incrementLocalUsage();
        setProtocol(data.protocol);

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

      }
    } catch (error: any) {
      if (error?.name === 'AbortError' || controller.signal.aborted) return;
      if (!isMounted()) return;
      logger.error("Error generating protocol", error);
      toast({
        title: "Error",
        description: "Failed to generate rehydration protocol",
        variant: "destructive",
      });
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
    // Protocol state
    protocol,
    loading,
    // Derived
    currentWeight,
    profileParts,
    // Actions
    handleGenerateProtocol,
    handleAICancel,
  };
}
