import { useState, useRef } from "react";
import { useMutation } from "convex/react";
import { useAIAction } from "@/hooks/useAIAction";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useAITask } from "@/contexts/AITaskContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { AIPersistence } from "@/lib/aiPersistence";
import { createAIAbortController } from "@/lib/timeoutWrapper";
import { logger } from "@/lib/logger";
import { nutritionCache } from "@/lib/nutritionCache";
import { api } from "../../../convex/_generated/api";
import { Scale, TrendingDown, CheckCircle } from "lucide-react";
import type { AIAnalysis, Profile, DebugData } from "@/pages/weight/types";

interface UseWeightAnalysisParams {
  profile: Profile | null;
}

export function useWeightAnalysis({ profile }: UseWeightAnalysisParams) {
  const { userId, refreshProfile } = useUser();
  const { toast } = useToast();
  const { addTask, completeTask, failTask } = useAITask();
  const { openPaywall, handlePaywallError } = useSubscription();
  const { hasAccess: hasAiAccess } = useFeatureAccess("AI_WEIGHT_ANALYSIS");
  const updateGoalsMut = useMutation(api.profiles.updateGoals);
  const weightTrackerAnalysisAction = useAIAction(api.actions.weightTrackerAnalysis.run, "AI_WEIGHT_ANALYSIS");
  const aiAbortRef = useRef<AbortController | null>(null);

  const [analyzingWeight, setAnalyzingWeight] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiAnalysisWeight, setAiAnalysisWeight] = useState<number | null>(null);
  const [aiAnalysisTarget, setAiAnalysisTarget] = useState<number | null>(null);
  const [unsafeGoalDialogOpen, setUnsafeGoalDialogOpen] = useState(false);
  const [debugDialogOpen, setDebugDialogOpen] = useState(false);
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [targetsApplied, setTargetsApplied] = useState(false);
  const [applyingTargets, setApplyingTargets] = useState(false);

  const loadPersistedAnalysis = () => {
    if (!userId) return;
    try {
      const persisted = AIPersistence.load(userId, "weight_analysis");
      if (persisted) {
        const { analysis, currentWeight, fightWeekTarget } = persisted;
        // Shape check: the rich macros/protocol shape has requiredWeeklyLoss as a number.
        // The migration-era stripped shape lacks it and crashes the UI on .toFixed.
        if (analysis && typeof analysis.requiredWeeklyLoss === "number") {
          setAiAnalysis(analysis);
          setAiAnalysisWeight(currentWeight);
          setAiAnalysisTarget(fightWeekTarget);
        } else if (analysis) {
          AIPersistence.remove(userId, "weight_analysis");
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
    setTargetsApplied(false);
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

    const fightWeekTarget = profile.fight_week_target_kg || profile.goal_weight_kg;
    if (!fightWeekTarget) {
      toast({
        title: "Target Weight Required",
        description: "Please set a target weight in Goals to get AI analysis.",
        variant: "destructive",
      });
      return;
    }

    if (!hasAiAccess) {
      openPaywall();
      return;
    }

    aiAbortRef.current?.abort();
    const controller = createAIAbortController();
    aiAbortRef.current = controller;

    setAnalyzingWeight(true);
    const taskId = addTask({
      id: `weight-analysis-${Date.now()}`,
      type: "weight-analysis",
      label: "Analyzing Progress",
      steps: [
        { icon: Scale, label: "Loading weight data" },
        { icon: TrendingDown, label: "Analyzing trends" },
        { icon: CheckCircle, label: "Generating insights" },
      ],
      returnPath: "/weight",
    });

    try {

      const currentWeight = profile.current_weight_kg;
      const currentWeightSource = "profile.current_weight_kg";

      if (isGoalUnrealistic(currentWeight, fightWeekTarget, profile.target_date)) {
        setUnsafeGoalDialogOpen(true);
      }

      const requestPayload = {
        weightHistory: [] as Array<{ date: string; weight_kg: number }>,
        currentWeight,
        goalWeight: fightWeekTarget,
        targetDate: profile.target_date,
      };

      let data: any = null;
      let error: any = null;
      try {
        data = await weightTrackerAnalysisAction(requestPayload);
      } catch (err: any) {
        error = err;
      }

      // The Convex action returns parsed analysis JSON directly (no `analysis` wrapper).
      // Normalise to the shape the rest of this hook expects.
      const analysis = data && !data.analysis ? data : data?.analysis;

      if (analysis && userId) {
        AIPersistence.save(userId, "weight_analysis", { analysis, currentWeight, fightWeekTarget }, 24);
      }
      if (controller.signal.aborted) return;

      const debugInfo: DebugData = {
        requestPayload,
        rawResponse: data || error,
        parsedResponse: analysis || null,
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
        if (await handlePaywallError(error)) { failTask(taskId, "Pro required"); return; }
        const msg = error?.message || "AI analysis unavailable";
        toast({
          title: "AI analysis unavailable",
          description: msg,
          variant: "destructive"
        });
      } else if (analysis) {
        if (typeof analysis.requiredWeeklyLoss !== "number") {
          failTask(taskId, "Server returned an unexpected response shape");
          toast({
            title: "AI analysis unavailable",
            description: "The server returned an incomplete response. Please try again.",
            variant: "destructive",
          });
          return;
        }
        setTargetsApplied(false);
        setAiAnalysis(analysis);
        setAiAnalysisWeight(currentWeight);
        setAiAnalysisTarget(fightWeekTarget);

        if (userId) {
          AIPersistence.save(userId, "weight_analysis", {
            analysis,
            currentWeight,
            fightWeekTarget,
          }, 24);
        }
        completeTask(taskId, analysis);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      failTask(taskId, err?.message || "Something went wrong");
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

  const applyNutritionTargets = async () => {
    if (!userId || !aiAnalysis) return;
    setApplyingTargets(true);
    try {
      await updateGoalsMut({
        manualNutritionOverride: false,
        aiRecommendedCalories: aiAnalysis.recommendedCalories,
        aiRecommendedProteinG: aiAnalysis.proteinGrams,
        aiRecommendedCarbsG: aiAnalysis.carbsGrams,
        aiRecommendedFatsG: aiAnalysis.fatsGrams,
      });
      nutritionCache.remove(userId, 'profile');
      nutritionCache.remove(userId, 'macroGoals');
      await refreshProfile();
      setTargetsApplied(true);
    } catch (err: any) {
      logger.error("Error applying nutrition targets", err);
      toast({ title: "Failed to apply targets", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setApplyingTargets(false);
    }
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
    targetsApplied,
    applyingTargets,
    applyNutritionTargets,
  };
}
