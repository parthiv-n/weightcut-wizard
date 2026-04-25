import { useCallback } from "react";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { optimisticUpdateManager, createNutritionTargetUpdate } from "@/lib/optimisticUpdates";
import { nutritionCache } from "@/lib/nutritionCache";
import { logger } from "@/lib/logger";
import type { EditingTargets, MacroGoals } from "@/pages/nutrition/types";

interface UseSaveNutritionTargetsArgs {
  setDailyCalorieTarget: React.Dispatch<React.SetStateAction<number>>;
  setAiMacroGoals: React.Dispatch<React.SetStateAction<MacroGoals | null>>;
  setIsEditTargetsDialogOpen: (open: boolean) => void;
}

/**
 * Persist user-edited macro/calorie targets to the profile row,
 * with optimistic cache update and toast surface for validation errors.
 */
export function useSaveNutritionTargets({
  setDailyCalorieTarget,
  setAiMacroGoals,
  setIsEditTargetsDialogOpen,
}: UseSaveNutritionTargetsArgs) {
  const { userId, profile, refreshProfile } = useUser();
  const { toast } = useToast();

  return useCallback(async (editingTargets: EditingTargets) => {
    const calories = parseFloat(editingTargets.calories);
    if (isNaN(calories) || calories <= 0) {
      toast({ title: "Invalid calories", description: "Please enter a valid calorie target (greater than 0)", variant: "destructive" });
      return;
    }
    if (calories < 800 || calories > 5000) {
      toast({ title: "Calorie range warning", description: "Calorie target is outside recommended range (800-5000 kcal/day)", variant: "destructive" });
      return;
    }

    const macroCalories = (parseFloat(editingTargets.protein) || 0) * 4
      + (parseFloat(editingTargets.carbs) || 0) * 4
      + (parseFloat(editingTargets.fats) || 0) * 9;
    const macroDiff = Math.abs(macroCalories - calories);
    if (macroDiff > 50) {
      toast({
        title: "Macro-calorie mismatch",
        description: `Your macros add up to ${Math.round(macroCalories)} kcal, which is ${Math.round(macroDiff)} kcal ${macroCalories > calories ? "over" : "under"} your calorie goal. Saving anyway.`,
      });
    }

    try {
      if (!userId) throw new Error("Not authenticated");

      const originalProfile = { ...profile };
      const optimisticProfile = {
        ...profile,
        manual_nutrition_override: true,
        ai_recommended_calories: Math.round(calories),
        ai_recommended_protein_g: editingTargets.protein ? parseFloat(editingTargets.protein) : profile?.ai_recommended_protein_g,
        ai_recommended_carbs_g: editingTargets.carbs ? parseFloat(editingTargets.carbs) : profile?.ai_recommended_carbs_g,
        ai_recommended_fats_g: editingTargets.fats ? parseFloat(editingTargets.fats) : profile?.ai_recommended_fats_g,
      };

      setDailyCalorieTarget(Math.round(calories));
      if (editingTargets.protein) setAiMacroGoals((prev) => (prev ? { ...prev, proteinGrams: parseFloat(editingTargets.protein) } : prev));
      if (editingTargets.carbs) setAiMacroGoals((prev) => (prev ? { ...prev, carbsGrams: parseFloat(editingTargets.carbs) } : prev));
      if (editingTargets.fats) setAiMacroGoals((prev) => (prev ? { ...prev, fatsGrams: parseFloat(editingTargets.fats) } : prev));
      setIsEditTargetsDialogOpen(false);

      const updateOperation = async () => {
        const updateData: any = { manual_nutrition_override: true, ai_recommended_calories: Math.round(calories) };
        if (editingTargets.protein) { const v = parseFloat(editingTargets.protein); if (!isNaN(v) && v >= 0) updateData.ai_recommended_protein_g = v; }
        if (editingTargets.carbs) { const v = parseFloat(editingTargets.carbs); if (!isNaN(v) && v >= 0) updateData.ai_recommended_carbs_g = v; }
        if (editingTargets.fats) { const v = parseFloat(editingTargets.fats); if (!isNaN(v) && v >= 0) updateData.ai_recommended_fats_g = v; }

        const { supabase } = await import("@/integrations/supabase/client");
        const { error } = await withSupabaseTimeout(
          supabase.from("profiles").update(updateData).eq("id", userId),
          undefined,
          "Update nutrition targets"
        );
        if (error) {
          if (error.code === "PGRST204") throw new Error("Database schema is missing required columns.");
          throw error;
        }
      };

      const update = createNutritionTargetUpdate(userId, optimisticProfile, originalProfile, updateOperation);
      update.onError = (error: any) => {
        refreshProfile();
        logger.error("Error updating targets", error);
        toast({
          title: "Error",
          description: error.message || "Failed to update nutrition targets. Changes have been reverted.",
          variant: "destructive",
        });
      };

      const success = await optimisticUpdateManager.executeOptimisticUpdate(update);
      if (success) {
        nutritionCache.remove(userId, "profile");
        nutritionCache.remove(userId, "macroGoals");
        refreshProfile();
      }
    } catch (error: any) {
      logger.error("Error in optimistic update setup", error);
      toast({ title: "Error", description: error.message || "Failed to update nutrition targets", variant: "destructive" });
    }
  }, [userId, profile, refreshProfile, toast, setDailyCalorieTarget, setAiMacroGoals, setIsEditTargetsDialogOpen]);
}
