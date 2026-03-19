import { useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { AIPersistence } from "@/lib/aiPersistence";
import { createAIAbortController, extractEdgeFunctionError } from "@/lib/timeoutWrapper";
import { triggerHapticSuccess } from "@/lib/haptics";
import { logger } from "@/lib/logger";
import type { Meal, MacroGoals } from "@/pages/nutrition/types";
import type { DietAnalysisResult } from "@/types/dietAnalysis";

interface UseDietAnalysisParams {
  meals: Meal[];
  selectedDate: string;
  dailyCalorieTarget: number;
  aiMacroGoals: MacroGoals | null;
  dietAnalysis: DietAnalysisResult | null;
  setDietAnalysis: React.Dispatch<React.SetStateAction<DietAnalysisResult | null>>;
  dietAnalysisLoading: boolean;
  setDietAnalysisLoading: React.Dispatch<React.SetStateAction<boolean>>;
  aiAbortRef: React.MutableRefObject<AbortController | null>;
}

export function useDietAnalysis(params: UseDietAnalysisParams) {
  const {
    meals, selectedDate, dailyCalorieTarget, aiMacroGoals,
    dietAnalysis, setDietAnalysis, dietAnalysisLoading, setDietAnalysisLoading,
    aiAbortRef,
  } = params;

  const { userId, profile: contextProfile } = useUser();
  const { toast } = useToast();

  const handleAnalyseDiet = useCallback(async (forceRefresh = false) => {
    if (!userId || meals.length === 0) return;

    const cacheKey = `diet_analysis_${selectedDate}`;
    if (!forceRefresh) {
      const cached = AIPersistence.load(userId, cacheKey);
      if (cached) {
        setDietAnalysis(cached);
        return;
      }
    }

    aiAbortRef.current?.abort();
    const dietController = createAIAbortController();
    aiAbortRef.current = dietController;

    setDietAnalysisLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyse-diet", {
        body: {
          meals: meals.map(m => ({
            meal_name: m.meal_name,
            calories: m.calories,
            protein_g: m.protein_g || 0,
            carbs_g: m.carbs_g || 0,
            fats_g: m.fats_g || 0,
            meal_type: m.meal_type,
            ingredients: m.ingredients,
          })),
          profile: contextProfile ? {
            age: contextProfile.age,
            sex: contextProfile.sex,
            height_cm: contextProfile.height_cm,
            current_weight_kg: contextProfile.current_weight_kg,
            activity_level: contextProfile.activity_level,
            training_frequency: contextProfile.training_frequency,
          } : {},
          macroGoals: aiMacroGoals ? {
            calorieTarget: dailyCalorieTarget,
            proteinGrams: aiMacroGoals.proteinGrams,
            carbsGrams: aiMacroGoals.carbsGrams,
            fatsGrams: aiMacroGoals.fatsGrams,
          } : {},
          date: selectedDate,
        },
        signal: dietController.signal,
      });

      if (dietController.signal.aborted) return;
      if (error) throw new Error(await extractEdgeFunctionError(error, "Could not analyse your diet"));
      if (data?.error) throw new Error(data.error);

      const result = data.analysisData as DietAnalysisResult;
      setDietAnalysis(result);
      AIPersistence.save(userId, cacheKey, result, 6);
      triggerHapticSuccess();
    } catch (error: any) {
      if (error?.name === 'AbortError' || dietController.signal.aborted) return;
      logger.error("Error analysing diet", error);
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Could not analyse your diet",
        variant: "destructive",
      });
    } finally {
      setDietAnalysisLoading(false);
    }
  }, [userId, meals, selectedDate, dailyCalorieTarget, aiMacroGoals, setDietAnalysis, setDietAnalysisLoading, aiAbortRef, contextProfile, toast]);

  return { handleAnalyseDiet };
}
