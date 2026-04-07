import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useAITask } from "@/contexts/AITaskContext";
import { AIPersistence } from "@/lib/aiPersistence";
import { createAIAbortController, extractEdgeFunctionError } from "@/lib/timeoutWrapper";
import { logger } from "@/lib/logger";
import { Activity, Utensils, Sparkles } from "lucide-react";
import type { Meal } from "@/pages/nutrition/types";

interface UseMealPlanGenerationParams {
  selectedDate: string;
  dailyCalorieTarget: number;
  setDailyCalorieTarget: React.Dispatch<React.SetStateAction<number>>;
  safetyStatus: "green" | "yellow" | "red";
  setSafetyStatus: React.Dispatch<React.SetStateAction<"green" | "yellow" | "red">>;
  safetyMessage: string;
  setSafetyMessage: React.Dispatch<React.SetStateAction<string>>;
  mealPlanIdeas: Meal[];
  setMealPlanIdeas: React.Dispatch<React.SetStateAction<Meal[]>>;
  aiAbortRef: React.MutableRefObject<AbortController | null>;
}

export function useMealPlanGeneration(params: UseMealPlanGenerationParams) {
  const {
    selectedDate, dailyCalorieTarget, setDailyCalorieTarget,
    safetyStatus, setSafetyStatus, safetyMessage, setSafetyMessage,
    mealPlanIdeas, setMealPlanIdeas, aiAbortRef,
  } = params;

  const { isSessionValid, checkSessionValidity, refreshSession, userId, profile: contextProfile } = useUser();
  const profile = contextProfile;
  const { toast } = useToast();
  const { checkAIAccess, openPaywall, incrementLocalUsage, markLimitReached } = useSubscription();
  const { addTask, completeTask, failTask } = useAITask();

  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);

  const handleGenerateMealPlan = useCallback(async () => {
    if (!aiPrompt.trim()) {
      toast({ title: "Please enter a prompt", description: "Describe what kind of meals you'd like", variant: "destructive" });
      return;
    }

    if (!checkAIAccess()) {
      openPaywall();
      return;
    }

    aiAbortRef.current?.abort();
    const controller = createAIAbortController();
    aiAbortRef.current = controller;

    setGeneratingPlan(true);
    setIsAiDialogOpen(false);
    const taskId = addTask({
      id: `meal-plan-${Date.now()}`,
      type: "meal-plan",
      label: "Generating Meal Plan",
      steps: [
        { icon: Activity, label: "Analyzing nutritional needs" },
        { icon: Utensils, label: "Designing meal structure" },
        { icon: Sparkles, label: "Optimizing recipes" },
      ],
      returnPath: "/nutrition",
    });
    try {
      if (!isSessionValid) {
        const sessionValid = await checkSessionValidity();
        if (!sessionValid) {
          toast({ title: "Authentication Required", description: "Your session has expired. Please refresh the page and log in again.", variant: "destructive" });
          setGeneratingPlan(false);
          return;
        }
      }

      if (!userId) {
        throw new Error("Authentication required. Please log in again.");
      }

      const userData = profile ? {
        currentWeight: profile.current_weight_kg,
        goalWeight: profile.goal_weight_kg,
        tdee: profile.tdee,
        daysToWeighIn: profile.target_date ? Math.ceil(
          (new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        ) : 0,
      } : null;

      const response = await supabase.functions.invoke("meal-planner", {
        body: { prompt: aiPrompt, userData, action: "generate" },
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (response.error) {
        const errBody = typeof response.error === 'object' && 'context' in response.error ? (response.error as any).context : null;
        if (errBody?.status === 429) {
          markLimitReached();
          openPaywall();
          return;
        }
        throw new Error(await extractEdgeFunctionError(response.error, "Failed to generate meal plan"));
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      incrementLocalUsage();

      const { mealPlan, dailyCalorieTarget: target, safetyStatus: status, safetyMessage: message } = response.data;

      const ideasToStore: Meal[] = [];

      if (mealPlan && mealPlan.meals && Array.isArray(mealPlan.meals)) {
        mealPlan.meals.forEach((meal: any, idx: number) => {
          const mealType = meal.type || "meal";
          const timestamp = Date.now() + idx;
          const mealProtein = meal.protein || 0;
          const mealCarbs = meal.carbs || 0;
          const mealFats = meal.fats || 0;

          ideasToStore.push({
            id: `idea-${mealType}-${timestamp}`,
            meal_name: meal.name || `${mealType} meal`,
            calories: mealProtein * 4 + mealCarbs * 4 + mealFats * 9,
            protein_g: mealProtein,
            carbs_g: mealCarbs,
            fats_g: mealFats,
            meal_type: mealType as "breakfast" | "lunch" | "dinner" | "snack",
            portion_size: meal.portion || "1 serving",
            recipe_notes: meal.recipe || "",
            ingredients: meal.ingredients || undefined,
            is_ai_generated: true,
            date: selectedDate,
          });
        });
      } else if (mealPlan && typeof mealPlan === 'object') {
        const mealTypes = ['breakfast', 'lunch', 'dinner'];
        mealTypes.forEach(mealType => {
          if (mealPlan[mealType]) {
            const meal = mealPlan[mealType];
            const mp = meal.protein || 0;
            const mc = meal.carbs || 0;
            const mf = meal.fats || 0;
            ideasToStore.push({
              id: `idea-${mealType}-${Date.now()}`,
              meal_name: meal.name || `${mealType} meal`,
              calories: mp * 4 + mc * 4 + mf * 9,
              protein_g: mp,
              carbs_g: mc,
              fats_g: mf,
              meal_type: mealType as "breakfast" | "lunch" | "dinner",
              portion_size: meal.portion || "1 serving",
              recipe_notes: meal.recipe || "",
              ingredients: meal.ingredients || undefined,
              is_ai_generated: true,
              date: selectedDate,
            });
          }
        });

        if (mealPlan.snacks && Array.isArray(mealPlan.snacks)) {
          mealPlan.snacks.forEach((snack: any, idx: number) => {
            const sp = snack.protein || 0;
            const sc = snack.carbs || 0;
            const sf = snack.fats || 0;
            ideasToStore.push({
              id: `idea-snack-${idx}-${Date.now()}`,
              meal_name: snack.name || "Snack",
              calories: sp * 4 + sc * 4 + sf * 9,
              protein_g: sp,
              carbs_g: sc,
              fats_g: sf,
              meal_type: "snack",
              portion_size: snack.portion || "1 serving",
              recipe_notes: snack.recipe || "",
              ingredients: snack.ingredients || undefined,
              is_ai_generated: true,
              date: selectedDate,
            });
          });
        }
      }

      if (ideasToStore.length === 0) {
        toast({ title: "No meals found", description: "The AI response didn't contain parseable meal data. Please try a different prompt.", variant: "destructive" });
        return;
      }

      setMealPlanIdeas(prev => [...prev, ...ideasToStore]);
      setDailyCalorieTarget(target || dailyCalorieTarget);
      setSafetyStatus(status || safetyStatus);
      setSafetyMessage(message || safetyMessage);

      const accumulatedIdeas = [...mealPlanIdeas, ...ideasToStore];
      if (userId) {
        AIPersistence.save(userId, 'meal_plans', {
          meals: accumulatedIdeas,
          dailyCalorieTarget: target || dailyCalorieTarget,
          safetyStatus: status || safetyStatus,
          safetyMessage: message || safetyMessage,
          prompt: aiPrompt
        }, 24);
      }

      setIsAiDialogOpen(false);
      setAiPrompt("");
      completeTask(taskId, response.data);
    } catch (error: any) {
      if (error?.name === 'AbortError' || controller.signal.aborted) return;
      logger.error("Error generating meal plan", error);

      let errorMsg = "Failed to generate meal plan";

      if (error?.message?.includes("authorization") || error?.code === 401) {
        try {
          const refreshSuccess = await refreshSession();
          if (refreshSuccess) {
            errorMsg = "Session refreshed. Please try again.";
          } else {
            errorMsg = "Session expired. Please refresh the page and log in again.";
          }
        } catch {
          errorMsg = "Authentication failed. Please refresh the page and log in again.";
        }
      } else if (error?.message) {
        if (error.message.includes('429') || error.message.includes('quota')) {
          errorMsg = "AI service is temporarily busy. Please try again in a few minutes.";
        } else if (error.message.includes('404')) {
          errorMsg = "AI service temporarily unavailable. Please try again later.";
        } else {
          errorMsg = error.message;
        }
      }

      failTask(taskId, errorMsg);
      toast({ title: "Error generating meal plan", description: errorMsg, variant: "destructive" });
    } finally {
      setGeneratingPlan(false);
    }
  }, [aiPrompt, isSessionValid, checkSessionValidity, userId, profile, selectedDate, dailyCalorieTarget, safetyStatus, safetyMessage, mealPlanIdeas, setMealPlanIdeas, setDailyCalorieTarget, setSafetyStatus, setSafetyMessage, aiAbortRef, refreshSession, toast]);

  return {
    generatingPlan, setGeneratingPlan,
    aiPrompt, setAiPrompt,
    isAiDialogOpen, setIsAiDialogOpen,
    handleGenerateMealPlan,
  };
}
