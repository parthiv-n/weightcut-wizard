import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { AIPersistence } from "@/lib/aiPersistence";
import { createAIAbortController, extractEdgeFunctionError } from "@/lib/timeoutWrapper";
import { logger } from "@/lib/logger";
import type { AIAnalysis, Profile, DebugData } from "@/pages/weight/types";

interface UseWeightAnalysisParams {
  profile: Profile | null;
}

export function useWeightAnalysis({ profile }: UseWeightAnalysisParams) {
  const { userId } = useUser();
  const { toast } = useToast();
  const aiAbortRef = useRef<AbortController | null>(null);

  const [analyzingWeight, setAnalyzingWeight] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiAnalysisWeight, setAiAnalysisWeight] = useState<number | null>(null);
  const [aiAnalysisTarget, setAiAnalysisTarget] = useState<number | null>(null);
  const [unsafeGoalDialogOpen, setUnsafeGoalDialogOpen] = useState(false);
  const [debugDialogOpen, setDebugDialogOpen] = useState(false);
  const [debugData, setDebugData] = useState<DebugData | null>(null);

  const loadPersistedAnalysis = () => {
    if (!userId) return;
    try {
      const persisted = AIPersistence.load(userId, "weight_analysis");
      if (persisted) {
        const { analysis, currentWeight, fightWeekTarget } = persisted;
        if (analysis) {
          setAiAnalysis(analysis);
          setAiAnalysisWeight(currentWeight);
          setAiAnalysisTarget(fightWeekTarget);
        }
      }
    } catch (error) {
      logger.error("Error loading persisted analysis", error);
    }
  };

  const clearAnalysis = () => {
    if (!userId) return;
    setAiAnalysis(null);
    setAiAnalysisWeight(null);
    setAiAnalysisTarget(null);
    AIPersistence.remove(userId, "weight_analysis");
  };

  const isGoalUnrealistic = (currentWeight: number, fightWeekTarget: number, targetDate: string): boolean => {
    const target = new Date(targetDate);
    const today = new Date();
    const daysRemaining = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const weeksRemaining = Math.max(1, daysRemaining / 7);
    const weightRemaining = currentWeight - fightWeekTarget;
    const requiredWeeklyLoss = weightRemaining / weeksRemaining;
    return requiredWeeklyLoss > 1.5;
  };

  const getAIAnalysis = async () => {
    if (!profile) return;

    const fightWeekTarget = profile.fight_week_target_kg;
    if (!fightWeekTarget) {
      toast({
        title: "Fight Week Target Required",
        description: "Please set your fight week target weight in Goals to get AI analysis.",
        variant: "destructive",
      });
      return;
    }

    aiAbortRef.current?.abort();
    const controller = createAIAbortController();
    aiAbortRef.current = controller;

    setAnalyzingWeight(true);

    try {
      const currentWeight = profile.current_weight_kg;
      const currentWeightSource = "profile.current_weight_kg";

      if (isGoalUnrealistic(currentWeight, fightWeekTarget, profile.target_date)) {
        setUnsafeGoalDialogOpen(true);
      }

      const requestPayload = {
        currentWeight,
        goalWeight: fightWeekTarget,
        weighInDayWeight: profile.goal_weight_kg,
        targetDate: profile.target_date,
        activityLevel: profile.activity_level,
        age: profile.age,
        sex: profile.sex,
        heightCm: profile.height_cm,
        tdee: profile.tdee,
      };

      const { data, error } = await supabase.functions.invoke("weight-tracker-analysis", {
        body: requestPayload,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      const debugInfo: DebugData = {
        requestPayload,
        rawResponse: data || error,
        parsedResponse: data?.analysis || null,
        currentWeightSource,
        currentWeightValue: currentWeight,
        latestWeightLog: null,
        profileData: {
          current_weight_kg: profile.current_weight_kg,
          goal_weight_kg: profile.goal_weight_kg,
          fight_week_target_kg: profile.fight_week_target_kg,
          target_date: profile.target_date,
          activity_level: profile.activity_level,
          age: profile.age,
          sex: profile.sex,
          height_cm: profile.height_cm,
          tdee: profile.tdee
        }
      };
      setDebugData(debugInfo);

      if (error) {
        const msg = await extractEdgeFunctionError(error, "AI analysis unavailable");
        toast({
          title: "AI analysis unavailable",
          description: msg,
          variant: "destructive"
        });
      } else if (data?.analysis) {
        setAiAnalysis(data.analysis);
        setAiAnalysisWeight(currentWeight);
        setAiAnalysisTarget(fightWeekTarget);

        if (userId) {
          AIPersistence.save(userId, "weight_analysis", {
            analysis: data.analysis,
            currentWeight,
            fightWeekTarget,
          }, 24);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      toast({
        title: "AI analysis unavailable",
        description: err?.message || "Something went wrong",
        variant: "destructive"
      });
    } finally {
      setAnalyzingWeight(false);
    }
  };

  const handleAICancel = () => {
    aiAbortRef.current?.abort();
    setAnalyzingWeight(false);
  };

  return {
    analyzingWeight,
    aiAnalysis,
    aiAnalysisWeight,
    aiAnalysisTarget,
    unsafeGoalDialogOpen, setUnsafeGoalDialogOpen,
    debugDialogOpen, setDebugDialogOpen,
    debugData,
    loadPersistedAnalysis,
    clearAnalysis,
    getAIAnalysis,
    handleAICancel,
  };
}
