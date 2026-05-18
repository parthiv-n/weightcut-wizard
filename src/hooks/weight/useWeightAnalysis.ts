/**
 * useWeightAnalysis — drives the "Get AI weight strategy" surface inside the
 * WeightTracker page. After the 2026-05-18 refactor this hook is functionally
 * a re-skin of the onboarding plan generator: it calls
 * `api.actions.weightTrackerAnalysis.run` (which now returns the same
 * card-timeline shape as `generateWeightPlan`) and exposes the resulting plan
 * directly so the page can render it through the shared `InlinePlanDisplay`.
 *
 * Notable behaviour:
 *  - No paywall: the action is free for everyone (matches generateWeightPlan).
 *  - Cache: persists the plan via `AIPersistence` so it survives a refresh.
 *    The cache key was renamed from `weight_analysis` -> `weight_plan_v2` so
 *    legacy entries (the rich macros/protocol shape) never bleed into the new
 *    `InlinePlanDisplay` renderer. The hook also actively deletes the legacy
 *    key on load so we don't leak storage.
 *  - `applyNutritionTargets` still pushes the plan's macros into the user's
 *    profile so the Nutrition page picks them up. We read from `targetCalories`
 *    and the first week of `weeklyPlan` (where InlinePlanDisplay sources its
 *    headline macro strip from).
 */
import { useState, useRef } from "react";
import { useAction, useMutation } from "convex/react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useAITask } from "@/contexts/AITaskContext";
import { AIPersistence } from "@/lib/aiPersistence";
import { createAIAbortController } from "@/lib/timeoutWrapper";
import { logger } from "@/lib/logger";
import { nutritionCache } from "@/lib/nutritionCache";
import { api } from "../../../convex/_generated/api";
import { Scale, TrendingDown, CheckCircle } from "lucide-react";
import type { Profile } from "@/pages/weight/types";

/** The new analysis-result shape returned by `weightTrackerAnalysis.run`
 *  matches `InlinePlanDisplay`'s expected `PlanData` (see
 *  `src/components/onboarding/InlinePlanDisplay.tsx`). We keep this as `any`
 *  here so we don't have to duplicate the structural type, but the action's
 *  contract is enforced by `CutPlanSchema` + the normalisers. */
export type WeightAnalysisPlan = any;

interface UseWeightAnalysisParams {
  profile: Profile | null;
}

/** Cache key. v2 marks the new InlinePlanDisplay-compatible shape so legacy
 *  payloads from the pre-refactor protocol shape are not loaded. */
const CACHE_KEY = "weight_plan_v2";
/** Old cache key from the rich macros/protocol era; purged on load. */
const LEGACY_CACHE_KEY = "weight_analysis";

export function useWeightAnalysis({ profile }: UseWeightAnalysisParams) {
  const { userId, refreshProfile } = useUser();
  const { toast } = useToast();
  const { addTask, completeTask, failTask } = useAITask();
  const updateGoalsMut = useMutation(api.profiles.updateGoals);
  // No `useAIAction` wrapper / no feature gate: weightTrackerAnalysis is free
  // for every tier to mirror the generateWeightPlan policy.
  const weightTrackerAnalysisAction = useAction(
    api.actions.weightTrackerAnalysis.run,
  );
  const aiAbortRef = useRef<AbortController | null>(null);

  const [analyzingWeight, setAnalyzingWeight] = useState(false);
  const [analysisPlan, setAnalysisPlan] = useState<WeightAnalysisPlan | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [unsafeGoalDialogOpen, setUnsafeGoalDialogOpen] = useState(false);
  const [targetsApplied, setTargetsApplied] = useState(false);
  const [applyingTargets, setApplyingTargets] = useState(false);

  /** Restore the most recent generated plan from local storage. Silently
   *  removes the legacy `weight_analysis` payload so we never accidentally
   *  feed the old protocol shape to `InlinePlanDisplay`. */
  const loadPersistedAnalysis = () => {
    if (!userId) return;
    // Purge the pre-refactor cache key first.
    try {
      AIPersistence.remove(userId, LEGACY_CACHE_KEY);
    } catch {
      /* best-effort */
    }
    try {
      const persisted = AIPersistence.load(userId, CACHE_KEY);
      // Structural sanity: must have weeklyPlan[] to be usable.
      if (
        persisted &&
        Array.isArray(persisted.weeklyPlan) &&
        persisted.weeklyPlan.length > 0
      ) {
        setAnalysisPlan(persisted);
      } else if (persisted) {
        AIPersistence.remove(userId, CACHE_KEY);
      }
    } catch (error) {
      logger.error("Error loading persisted weight plan", error);
    }
  };

  const clearAnalysis = () => {
    if (!userId) return;
    setAnalysisPlan(null);
    setAnalysisOpen(false);
    AIPersistence.remove(userId, CACHE_KEY);
    setTargetsApplied(false);
  };

  const isGoalUnrealistic = (
    currentWeight: number,
    fightWeekTarget: number,
    targetDate: string,
  ): boolean => {
    const target = new Date(targetDate);
    const today = new Date();
    const daysRemaining = Math.ceil(
      (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    const weeksRemaining = Math.max(1, daysRemaining / 7);
    const weightRemaining = currentWeight - fightWeekTarget;
    const requiredWeeklyLoss = weightRemaining / weeksRemaining;
    return requiredWeeklyLoss > 1.5;
  };

  const getAIAnalysis = async () => {
    if (!profile) return;

    const fightWeekTarget =
      profile.fight_week_target_kg || profile.goal_weight_kg;
    if (!fightWeekTarget) {
      toast({
        title: "Target Weight Required",
        description: "Please set a target weight in Goals to get AI analysis.",
        variant: "destructive",
      });
      return;
    }

    aiAbortRef.current?.abort();
    const controller = createAIAbortController();
    aiAbortRef.current = controller;

    setAnalyzingWeight(true);
    setAnalysisOpen(true);
    const taskId = addTask({
      id: `weight-analysis-${Date.now()}`,
      type: "weight-analysis",
      label: "Refreshing Your Plan",
      steps: [
        { icon: Scale, label: "Loading your numbers" },
        { icon: TrendingDown, label: "Calculating calorie target" },
        { icon: CheckCircle, label: "Building week timeline" },
      ],
      returnPath: "/weight",
    });

    try {
      const currentWeight = profile.current_weight_kg;

      if (
        profile.target_date &&
        isGoalUnrealistic(currentWeight, fightWeekTarget, profile.target_date)
      ) {
        setUnsafeGoalDialogOpen(true);
      }

      // The action falls back to profile fields when args are omitted, but we
      // pass them explicitly so the UI stays the source of truth for the
      // exact numbers it shows the user.
      const requestPayload = {
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

      if (controller.signal.aborted) return;

      if (error) {
        const msg = error?.message || "AI analysis unavailable";
        failTask(taskId, msg);
        toast({
          title: "AI analysis unavailable",
          description: msg,
          variant: "destructive",
        });
        return;
      }

      if (
        !data ||
        !Array.isArray(data.weeklyPlan) ||
        data.weeklyPlan.length === 0
      ) {
        failTask(taskId, "Server returned an unexpected response shape");
        toast({
          title: "AI analysis unavailable",
          description: "The server returned an incomplete plan. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Persist + render.
      if (userId) {
        AIPersistence.save(userId, CACHE_KEY, data, 24);
      }
      setTargetsApplied(false);
      setAnalysisPlan(data);
      completeTask(taskId, data);
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) return;
      failTask(taskId, err?.message || "Something went wrong");
      toast({
        title: "AI analysis unavailable",
        description: err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setAnalyzingWeight(false);
    }
  };

  const handleAICancel = () => {
    aiAbortRef.current?.abort();
    setAnalyzingWeight(false);
  };

  /** Push the plan's headline calorie + macro targets into the user's
   *  nutrition profile. Reads from `targetCalories` (server-computed) and the
   *  first weekly row, which is the same source `InlinePlanDisplay`'s stat
   *  strip renders from. */
  const applyNutritionTargets = async () => {
    if (!userId || !analysisPlan) return;
    const week1 = Array.isArray(analysisPlan.weeklyPlan)
      ? analysisPlan.weeklyPlan[0]
      : null;
    if (!week1) return;
    const recommendedCalories: number | undefined =
      typeof analysisPlan.targetCalories === "number"
        ? analysisPlan.targetCalories
        : typeof week1.calories === "number"
          ? week1.calories
          : undefined;
    if (typeof recommendedCalories !== "number") return;

    setApplyingTargets(true);
    try {
      await updateGoalsMut({
        manualNutritionOverride: false,
        aiRecommendedCalories: recommendedCalories,
        aiRecommendedProteinG: week1.protein_g,
        aiRecommendedCarbsG: week1.carbs_g,
        aiRecommendedFatsG: week1.fats_g,
      });
      nutritionCache.remove(userId, "profile");
      nutritionCache.remove(userId, "macroGoals");
      await refreshProfile();
      setTargetsApplied(true);
    } catch (err: any) {
      logger.error("Error applying nutrition targets", err);
      toast({
        title: "Failed to apply targets",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setApplyingTargets(false);
    }
  };

  return {
    analyzingWeight,
    analysisPlan,
    analysisOpen,
    setAnalysisOpen,
    unsafeGoalDialogOpen,
    setUnsafeGoalDialogOpen,
    loadPersistedAnalysis,
    clearAnalysis,
    getAIAnalysis,
    handleAICancel,
    targetsApplied,
    applyingTargets,
    applyNutritionTargets,
  };
}
