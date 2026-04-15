import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Plus, Sparkles, Calendar as CalendarIcon, Loader2, Settings, Edit2, X, Activity, Utensils, Database, PieChart as PieChartIcon, Search, CheckCircle, ChevronDown, ChevronUp, ChevronRight, ScanLine, Dumbbell, Sunrise, Salad, UtensilsCrossed, Apple, Mic, MicOff, Gem, Copy, RotateCcw, Star, Camera } from "lucide-react";
import wizardLogo from "@/assets/wizard-logo.webp";
import { MealCard } from "@/components/nutrition/MealCard";
import { MealCardSkeleton } from "@/components/ui/skeleton-loader";
import { MacroPieChart } from "@/components/nutrition/MacroPieChart";
const FoodSearchDialog = lazy(() => import("@/components/nutrition/FoodSearchDialog").then(m => ({ default: m.FoodSearchDialog })));
const BarcodeScanner = lazy(() => import("@/components/nutrition/BarcodeScanner").then(m => ({ default: m.BarcodeScanner })));
import { format, subDays, addDays } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { nutritionLogSchema } from "@/lib/validation";
import { useUser } from "@/contexts/UserContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { optimisticUpdateManager, createNutritionTargetUpdate } from "@/lib/optimisticUpdates";
import { nutritionCache } from "@/lib/nutritionCache";
const AIGeneratingOverlay = lazy(() => import("@/components/AIGeneratingOverlay").then(m => ({ default: m.AIGeneratingOverlay })));
import { triggerHapticSelection } from "@/lib/haptics";
const DietAnalysisCard = lazy(() => import("@/components/nutrition/DietAnalysisCard").then(m => ({ default: m.DietAnalysisCard })));
import { ShareButton } from "@/components/share/ShareButton";
const ShareCardDialog = lazy(() => import("@/components/share/ShareCardDialog").then(m => ({ default: m.ShareCardDialog })));
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { NutritionCard } from "@/components/share/cards/NutritionCard";
import { logger } from "@/lib/logger";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useAITask } from "@/contexts/AITaskContext";
import { useGems } from "@/hooks/useGems";
import { AICompactOverlay } from "@/components/AICompactOverlay";

import type { Ingredient, Meal, ManualMealForm, INITIAL_MANUAL_MEAL } from "@/pages/nutrition/types";
import {
  useNutritionState,
  useNutritionData,
  useMealOperations,
  useAIMealAnalysis,
  useMealPlanGeneration,
  useDietAnalysis,
  useNutritionWisdom,
  useMacroCalculation,
  useQuickMealActions,
  setQuickAddSheetOpenRef,
} from "@/hooks/nutrition";

export default function Nutrition() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userId, profile: contextProfile, refreshProfile } = useUser();
  const profile = contextProfile;

  // ── Shared state ──
  const state = useNutritionState();
  const {
    meals, setMeals, mealPlanIdeas, setMealPlanIdeas,
    selectedDate, setSelectedDate,
    dailyCalorieTarget, setDailyCalorieTarget,
    aiMacroGoals, setAiMacroGoals,
    safetyStatus, setSafetyStatus, safetyMessage, setSafetyMessage,
    totalCalories, totalProtein, totalCarbs, totalFats,
  } = state;

  // ── UI state ──
  const [isQuickAddSheetOpen, setIsQuickAddSheetOpen] = useState(false);
  const [quickAddTab, setQuickAddTab] = useState<"ai" | "manual">("ai");
  const [expandedMealActions, setExpandedMealActions] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [expandedMealIdeas, setExpandedMealIdeas] = useState<Set<string>>(new Set());
  const [isEditTargetsDialogOpen, setIsEditTargetsDialogOpen] = useState(false);
  const [editingTargets, setEditingTargets] = useState({ calories: "", protein: "", carbs: "", fats: "" });
  const [showMealSuccess, setShowMealSuccess] = useState(false);
  const [isFoodSearchOpen, setIsFoodSearchOpen] = useState(false);
  const [foodSearchMealType, setFoodSearchMealType] = useState<string>("snack");
  const [manualMeal, setManualMeal] = useState<ManualMealForm>({
    meal_name: "", calories: "", protein_g: "", carbs_g: "", fats_g: "",
    meal_type: "breakfast", portion_size: "", recipe_notes: "", ingredients: [],
  });

  // ── Hooks ──
  const nutritionData = useNutritionData({
    selectedDate, meals, setMeals, mealPlanIdeas, setMealPlanIdeas,
    dailyCalorieTarget, setDailyCalorieTarget,
    aiMacroGoals, setAiMacroGoals, setSafetyStatus, setSafetyMessage,
  });

  const mealOps = useMealOperations({
    meals, setMeals, mealPlanIdeas, setMealPlanIdeas,
    selectedDate, loadMeals: nutritionData.loadMeals,
  });

  const aiMeal = useAIMealAnalysis({
    manualMeal, setManualMeal,
    saveMealToDb: mealOps.saveMealToDb,
    setIsQuickAddSheetOpen,
    setQuickAddTab,
  });

  const mealPlan = useMealPlanGeneration({
    selectedDate, dailyCalorieTarget, setDailyCalorieTarget,
    safetyStatus, setSafetyStatus, safetyMessage, setSafetyMessage,
    mealPlanIdeas, setMealPlanIdeas, aiAbortRef: aiMeal.aiAbortRef,
  });

  const dietAnalysisHook = useDietAnalysis({
    meals, selectedDate, dailyCalorieTarget, aiMacroGoals,
    dietAnalysis: nutritionData.dietAnalysis,
    setDietAnalysis: nutritionData.setDietAnalysis,
    dietAnalysisLoading: nutritionData.dietAnalysisLoading,
    setDietAnalysisLoading: nutritionData.setDietAnalysisLoading,
    aiAbortRef: aiMeal.aiAbortRef,
  });

  const wisdom = useNutritionWisdom({
    totalCalories, totalProtein, totalCarbs, totalFats,
    dailyCalorieTarget, aiMacroGoals, mealsLength: meals.length,
  });

  const quickActions = useQuickMealActions({ meals, selectedDate, saveMealToDb: mealOps.saveMealToDb });

  const macroCalc = useMacroCalculation();

  const { gems, isPremium: gemsIsPremium, consumeGem } = useGems();

  const gemBadge = !gemsIsPremium ? (
    <span className="inline-flex items-center gap-0.5 ml-1.5 text-muted-foreground">
      <Gem className="h-3 w-3" />
      <span className="text-[13px] font-medium tabular-nums">{gems}</span>
    </span>
  ) : null;

  // ── Derived ──
  const loading = mealPlan.generatingPlan || mealOps.loggingMeal !== null || mealOps.savingAllMeals;
  const isAiActive = mealPlan.generatingPlan || aiMeal.aiAnalyzing || aiMeal.aiAnalyzingIngredient || nutritionData.dietAnalysisLoading;

  const handleDeleteMeal = useCallback((meal: Meal) => {
    mealOps.initiateDeleteMeal(meal);
  }, [mealOps.initiateDeleteMeal]);

  // Effective macro goals: AI values when available, otherwise derive from calorie target
  const effectiveMacroGoals = useMemo(() => {
    if (aiMacroGoals) return aiMacroGoals;
    return {
      proteinGrams: Math.round((dailyCalorieTarget * 0.30) / 4),
      carbsGrams: Math.round((dailyCalorieTarget * 0.40) / 4),
      fatsGrams: Math.round((dailyCalorieTarget * 0.30) / 9),
      recommendedCalories: dailyCalorieTarget,
    };
  }, [aiMacroGoals, dailyCalorieTarget]);

  const groupedMeals = useMemo(() => {
    const groups: Record<string, Meal[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const m of meals) {
      const type = (m.meal_type || "snack").toLowerCase();
      if (type in groups) {
        groups[type].push(m);
      } else {
        groups["snack"].push(m);
      }
    }
    return groups;
  }, [meals]);

  // Voice dictation for AI meal description
  const handleVoiceTranscript = useCallback((text: string) => {
    aiMeal.setAiMealDescription(prev => prev ? prev + " " + text : text);
  }, [aiMeal.setAiMealDescription]);
  const handleVoiceError = useCallback((error: string) => {
    toast({ title: "Voice Input", description: error, variant: "destructive" });
  }, [toast]);
  const { isListening, isSupported: voiceSupported, startListening, stopListening, interimText } = useSpeechRecognition({
    onTranscript: handleVoiceTranscript,
    onError: handleVoiceError,
  });

  // Track if user has seen the AI placeholder before
  const [hasSeenAiPlaceholder, setHasSeenAiPlaceholder] = useState(() => {
    try { return localStorage.getItem("wcw_ai_meal_placeholder_seen") === "1"; } catch { return false; }
  });
  useEffect(() => {
    if (isQuickAddSheetOpen && quickAddTab === "ai" && !hasSeenAiPlaceholder) {
      setHasSeenAiPlaceholder(true);
      try { localStorage.setItem("wcw_ai_meal_placeholder_seen", "1"); } catch {}
    }
  }, [isQuickAddSheetOpen, quickAddTab, hasSeenAiPlaceholder]);

  // Warmup analyze-meal edge function when quick add sheet opens on AI tab
  useEffect(() => {
    setQuickAddSheetOpenRef(isQuickAddSheetOpen);
    if (isQuickAddSheetOpen && quickAddTab === "ai" && userId) {
      import("@/integrations/supabase/client").then(({ supabase }) => {
        supabase.functions.invoke("analyze-meal", { method: "GET" } as any).catch(() => { });
      });
    }
  }, [isQuickAddSheetOpen, quickAddTab, userId]);

  // Warmup food-search edge function so search dialog opens instantly
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => {
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/food-search`, {
        method: "GET",
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [userId]);

  // Preload FoodSearchDialog chunk so it's ready when user taps search
  useEffect(() => {
    const t = setTimeout(() => {
      import("@/components/nutrition/FoodSearchDialog").catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // Auto-open from URL params (deferred to avoid race with QuickLog sheet close)
  useEffect(() => {
    let tab: "ai" | "manual" | null = null;
    if (searchParams.get("openAddMeal") === "true") {
      tab = "ai";
      searchParams.delete("openAddMeal");
    }
    if (searchParams.get("openManualMeal") === "true") {
      tab = "manual";
      searchParams.delete("openManualMeal");
    }
    if (tab) {
      const targetTab = tab;
      setSearchParams(searchParams, { replace: true });
      const t = setTimeout(() => {
        setQuickAddTab(targetTab);
        setIsQuickAddSheetOpen(true);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [searchParams, setSearchParams]);

  // Auto-calculate meal totals from ingredients
  useEffect(() => {
    if (manualMeal.ingredients.length > 0) {
      const hasNutritionData = manualMeal.ingredients.some(ing => ing.calories_per_100g !== undefined);
      if (hasNutritionData) {
        let tc = 0, tp = 0, tcarb = 0, tf = 0;
        manualMeal.ingredients.forEach((ingredient) => {
          if (ingredient.calories_per_100g !== undefined) tc += (ingredient.calories_per_100g * ingredient.grams) / 100;
          if (ingredient.protein_per_100g !== undefined) tp += (ingredient.protein_per_100g * ingredient.grams) / 100;
          if (ingredient.carbs_per_100g !== undefined) tcarb += (ingredient.carbs_per_100g * ingredient.grams) / 100;
          if (ingredient.fats_per_100g !== undefined) tf += (ingredient.fats_per_100g * ingredient.grams) / 100;
        });
        setManualMeal(prev => ({
          ...prev,
          calories: Math.round(tc).toString(),
          protein_g: Math.round(tp * 10) / 10 !== 0 ? (Math.round(tp * 10) / 10).toString() : "",
          carbs_g: Math.round(tcarb * 10) / 10 !== 0 ? (Math.round(tcarb * 10) / 10).toString() : "",
          fats_g: Math.round(tf * 10) / 10 !== 0 ? (Math.round(tf * 10) / 10).toString() : "",
        }));
      }
    }
  }, [manualMeal.ingredients]);

  const handleAddManualMeal = async () => {
    const validationResult = nutritionLogSchema.safeParse({
      meal_name: manualMeal.meal_name,
      calories: parseInt(manualMeal.calories),
      protein_g: manualMeal.protein_g ? parseFloat(manualMeal.protein_g) : null,
      carbs_g: manualMeal.carbs_g ? parseFloat(manualMeal.carbs_g) : null,
      fats_g: manualMeal.fats_g ? parseFloat(manualMeal.fats_g) : null,
      meal_type: manualMeal.meal_type,
      portion_size: manualMeal.portion_size || null,
      recipe_notes: manualMeal.recipe_notes || null,
    });

    if (!validationResult.success) {
      toast({ title: "Validation Error", description: validationResult.error.errors[0].message, variant: "destructive" });
      return;
    }

    try {
      await mealOps.saveMealToDb({
        meal_name: manualMeal.meal_name,
        calories: parseInt(manualMeal.calories),
        protein_g: manualMeal.protein_g ? parseFloat(manualMeal.protein_g) : null,
        carbs_g: manualMeal.carbs_g ? parseFloat(manualMeal.carbs_g) : null,
        fats_g: manualMeal.fats_g ? parseFloat(manualMeal.fats_g) : null,
        meal_type: manualMeal.meal_type,
        portion_size: manualMeal.portion_size || null,
        recipe_notes: manualMeal.recipe_notes || null,
        ingredients: manualMeal.ingredients.length > 0 ? manualMeal.ingredients : null,
        is_ai_generated: false,
      });

      setIsQuickAddSheetOpen(false);
      setShowMealSuccess(true);
      setTimeout(() => setShowMealSuccess(false), 1500);
      setManualMeal({
        meal_name: "", calories: "", protein_g: "", carbs_g: "", fats_g: "",
        meal_type: "breakfast", portion_size: "", recipe_notes: "", ingredients: [],
      });
      aiMeal.setAiMealDescription("");
      aiMeal.setNewIngredient({ name: "", grams: "" });
      aiMeal.setBarcodeBaseMacros(null);
      aiMeal.setServingMultiplier(1);
    } catch (error) {
      logger.error("Error in optimistic meal update setup", error);
      toast({ title: "Error", description: "Failed to add meal", variant: "destructive" });
    }
  };

  const cancelAI = () => {
    aiMeal.cancelAI();
    mealPlan.setGeneratingPlan(false);
    nutritionData.setDietAnalysisLoading(false);
  };

  const getOverlayProps = () => {
    if (nutritionData.dietAnalysisLoading) {
      return {
        steps: [
          { icon: Utensils, label: "Reviewing meals", color: "text-blue-400" },
          { icon: PieChartIcon, label: "Estimating micronutrients", color: "text-green-500" },
          { icon: Search, label: "Identifying gaps", color: "text-yellow-400" },
          { icon: Sparkles, label: "Generating recommendations", color: "text-blue-400" },
        ],
        title: "Analysing Diet", subtitle: "This usually takes 20\u201340 seconds...",
        retry: () => dietAnalysisHook.handleAnalyseDiet(),
      };
    }
    if (mealPlan.generatingPlan) {
      return {
        steps: [
          { icon: Activity, label: "Analyzing nutritional needs", color: "text-blue-400" },
          { icon: Utensils, label: "Designing meal structure", color: "text-green-500" },
          { icon: Sparkles, label: "Optimizing recipes", color: "text-yellow-400" },
        ],
        title: "Generating Meal Plan", subtitle: "This usually takes 30\u201360 seconds...",
        retry: () => mealPlan.handleGenerateMealPlan(),
      };
    }
    if (aiMeal.aiAnalyzing) {
      return {
        steps: [
          { icon: Search, label: "Identifying food items", color: "text-blue-400" },
          { icon: Database, label: "Retrieving macros", color: "text-blue-500" },
          { icon: CheckCircle, label: "Finalizing log", color: "text-green-400" },
        ],
        title: "Analyzing Meal", subtitle: "This usually takes 10\u201320 seconds...", retry: null,
      };
    }
    if (aiMeal.aiAnalyzingIngredient) {
      return {
        steps: [
          { icon: Search, label: "Searching database", color: "text-blue-400" },
          { icon: PieChartIcon, label: "Calculating portion macros", color: "text-yellow-500" },
        ],
        title: "Analyzing Ingredient", subtitle: "This usually takes 10\u201320 seconds...", retry: null,
      };
    }
    return { steps: [], title: "", subtitle: "", retry: null };
  };

  const overlayProps = getOverlayProps();

  const openFoodSearch = useCallback((mealType: string) => {
    setFoodSearchMealType(mealType);
    setIsFoodSearchOpen(true);
  }, []);

  const handleEditTargets = useCallback(() => {
    setEditingTargets({
      calories: dailyCalorieTarget.toString(),
      protein: effectiveMacroGoals.proteinGrams.toString(),
      carbs: effectiveMacroGoals.carbsGrams.toString(),
      fats: effectiveMacroGoals.fatsGrams.toString(),
    });
    setIsEditTargetsDialogOpen(true);
  }, [dailyCalorieTarget, effectiveMacroGoals]);

  const handleDietAnalysisDismiss = useCallback(() => {
    nutritionData.setDietAnalysis(null);
    if (userId) import("@/lib/aiPersistence").then(({ AIPersistence }) => AIPersistence.remove(userId, `diet_analysis_${selectedDate}`));
  }, [userId, selectedDate, nutritionData.setDietAnalysis]);

  const handleFoodSearchSelected = useCallback((food: any) => {
    mealOps.handleFoodSearchSelected(food, foodSearchMealType);
  }, [mealOps.handleFoodSearchSelected, foodSearchMealType]);

  const handleSheetOpenChange = useCallback((open: boolean) => {
    setIsQuickAddSheetOpen(open);
    if (!open) { aiMeal.setIngredientLookupError(null); aiMeal.setBarcodeBaseMacros(null); aiMeal.setServingMultiplier(1); aiMeal.setAiLineItems([]); aiMeal.setAiAnalysisComplete(false); }
  }, [aiMeal.setIngredientLookupError, aiMeal.setBarcodeBaseMacros, aiMeal.setServingMultiplier, aiMeal.setAiLineItems, aiMeal.setAiAnalysisComplete]);

  const handleSaveTargets = async () => {
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
        description: `Your macros add up to ${Math.round(macroCalories)} kcal, which is ${Math.round(macroDiff)} kcal ${macroCalories > calories ? 'over' : 'under'} your calorie goal. Saving anyway.`,
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
      if (editingTargets.protein) setAiMacroGoals(prev => prev ? { ...prev, proteinGrams: parseFloat(editingTargets.protein) } : prev);
      if (editingTargets.carbs) setAiMacroGoals(prev => prev ? { ...prev, carbsGrams: parseFloat(editingTargets.carbs) } : prev);
      if (editingTargets.fats) setAiMacroGoals(prev => prev ? { ...prev, fatsGrams: parseFloat(editingTargets.fats) } : prev);
      setIsEditTargetsDialogOpen(false);

      const updateOperation = async () => {
        const updateData: any = {
          manual_nutrition_override: true,
          ai_recommended_calories: Math.round(calories),
        };
        if (editingTargets.protein) { const v = parseFloat(editingTargets.protein); if (!isNaN(v) && v >= 0) updateData.ai_recommended_protein_g = v; }
        if (editingTargets.carbs) { const v = parseFloat(editingTargets.carbs); if (!isNaN(v) && v >= 0) updateData.ai_recommended_carbs_g = v; }
        if (editingTargets.fats) { const v = parseFloat(editingTargets.fats); if (!isNaN(v) && v >= 0) updateData.ai_recommended_fats_g = v; }

        const { error } = await withSupabaseTimeout(
          (await import("@/integrations/supabase/client")).supabase.from("profiles").update(updateData).eq("id", userId),
          undefined, "Update nutrition targets"
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
        toast({ title: "Error", description: error.message || "Failed to update nutrition targets. Changes have been reverted.", variant: "destructive" });
      };

      const success = await optimisticUpdateManager.executeOptimisticUpdate(update);
      if (success) {
        nutritionCache.remove(userId, 'profile');
        nutritionCache.remove(userId, 'macroGoals');
        refreshProfile();
      }
    } catch (error: any) {
      logger.error("Error in optimistic update setup", error);
      toast({ title: "Error", description: error.message || "Failed to update nutrition targets", variant: "destructive" });
    }
  };

  const { tasks, dismissTask } = useAITask();
  const aiTask = tasks.find(t => t.status === "running" && ["meal-analysis", "ingredient-lookup", "meal-plan", "diet-analysis"].includes(t.type));

  // Pick up completed AI tasks and apply results to local state
  const handledTaskRef = useRef<string | null>(null);
  useEffect(() => {
    const done = tasks.find(t => t.status === "done" && t.type === "diet-analysis" && t.result && handledTaskRef.current !== t.id);
    if (done) {
      handledTaskRef.current = done.id;
      nutritionData.setDietAnalysis(done.result);
      dismissTask(done.id);
    }
  }, [tasks, dismissTask, nutritionData.setDietAnalysis]);

  return (
    <>
      {aiTask && (
        <div className="sticky top-0 z-50 px-3 sm:px-5 md:px-6 pt-2 pb-2 max-w-7xl mx-auto bg-background/95">
          <AICompactOverlay
            isOpen={true}
            isGenerating={true}
            steps={aiTask.steps}
            startedAt={aiTask.startedAt}            title={aiTask.label}
            onCancel={() => { cancelAI(); dismissTask(aiTask.id); }}
          />
        </div>
      )}
      <div className="animate-page-in space-y-2.5 p-3 sm:p-5 md:p-6 max-w-7xl mx-auto overflow-x-hidden">

        {/* Wizard's Nutrition Wisdom */}
        <button
          className="w-full text-left rounded-xl card-surface p-3 border border-border hover:border-primary/30 active:scale-[0.99] transition-all group"
          onClick={() => wisdom.generateTrainingFoodIdeas()}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/15 p-1.5 flex-shrink-0 group-hover:bg-primary/20 transition-colors">
              <img src={wizardLogo} alt="Wizard" className="w-8 h-8 rounded-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-sm">Wizard's Daily Wisdom</h3>
                  <Dumbbell className="h-3.5 w-3.5 text-primary/60" />
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {wisdom.trainingWisdomLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {wisdom.aiWisdomLoading ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin text-primary/50" />
                    <span className="text-muted-foreground/50">Updating advice…</span>
                  </span>
                ) : wisdom.aiWisdomAdvice ? (
                  <span>
                    <Sparkles className="inline h-3 w-3 text-primary/40 mr-0.5 -mt-0.5" />
                    {wisdom.aiWisdomAdvice}
                  </span>
                ) : (
                  wisdom.getNutritionWisdom()
                )}
              </p>
              <p className="text-[13px] text-primary/50 mt-1 font-medium">Tap for pre & post training food ideas →</p>
            </div>
          </div>
        </button>

        {/* MFP Dashboard: Calories + Macros */}
        <MacroPieChart
          calories={totalCalories}
          calorieTarget={dailyCalorieTarget}
          protein={totalProtein}
          carbs={totalCarbs}
          fats={totalFats}
          proteinGoal={effectiveMacroGoals.proteinGrams}
          carbsGoal={effectiveMacroGoals.carbsGrams}
          fatsGoal={effectiveMacroGoals.fatsGrams}
          onEditTargets={handleEditTargets}
        />

        {/* Date Navigator */}
        <div className="relative flex items-center justify-center gap-3">
          <button
            onClick={() => { setSelectedDate(format(subDays(new Date(selectedDate), 1), "yyyy-MM-dd")); triggerHapticSelection(); }}
            className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button
            onClick={() => { setSelectedDate(format(new Date(), "yyyy-MM-dd")); triggerHapticSelection(); }}
            className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded-full bg-muted/40 hover:bg-muted/70 active:scale-[0.97] transition-all"
          >
            <CalendarIcon className="h-3 w-3 text-primary" />
            {selectedDate === format(new Date(), "yyyy-MM-dd") ? "Today" : format(new Date(selectedDate), "EEE, MMM d")}
          </button>
          <button
            onClick={() => { setSelectedDate(format(addDays(new Date(selectedDate), 1), "yyyy-MM-dd")); triggerHapticSelection(); }}
            className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <ShareButton onClick={nutritionData.handleShareOpen} className="absolute right-0" />
        </div>

        {meals.length === 0 && selectedDate === format(new Date(), "yyyy-MM-dd") && !loading && !nutritionData.mealsLoading && (
          <div className="card-surface rounded-xl border border-border p-3">
            <div className="flex items-start gap-2.5">
              <div className="rounded-full bg-primary/15 p-2 flex-shrink-0">
                <Utensils className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm">No Meals Logged Today</h3>
                <p className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
                  Describe what you ate and AI will calculate the macros for you.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Button variant="outline" size="sm" className="h-7 text-[13px] font-semibold"
                    onClick={() => { setQuickAddTab("ai"); setIsQuickAddSheetOpen(true); }}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />Quick Add with AI
                  </Button>
                  {quickActions.previousDayMealCount > 0 && (
                    <Button variant="outline" size="sm" className="h-7 text-[13px] font-semibold"
                      onClick={quickActions.copyPreviousDay} disabled={quickActions.copyingPreviousDay}
                    >
                      {quickActions.copyingPreviousDay ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                      Copy Yesterday ({quickActions.previousDayMealCount})
                    </Button>
                  )}
                  {quickActions.lastMeal && (
                    <Button variant="outline" size="sm" className="h-7 text-[13px] font-semibold max-w-[200px]"
                      onClick={() => quickActions.repeatLastMeal()}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                      <span className="truncate">Repeat: {quickActions.lastMeal.meal_name}</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Meal success indicator */}
        {showMealSuccess && (
          <div className="flex items-center justify-center gap-1.5 text-success animate-[fadeSlideUp_0.3s_ease-out_both]">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Meal added</span>
          </div>
        )}

        {/* Meal Sections (MFP-style) */}
        <div className="space-y-2">
          {(["breakfast", "lunch", "dinner", "snack"] as const).map((mealType) => {
            const groupMeals = groupedMeals[mealType];
            const groupCalories = groupMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
            const isActionExpanded = expandedMealActions === mealType;
            const MealIcon = { breakfast: Sunrise, lunch: Salad, dinner: UtensilsCrossed, snack: Apple }[mealType];
            const mealIconColor = { breakfast: "text-orange-400", lunch: "text-blue-400", dinner: "text-purple-400", snack: "text-green-400" }[mealType];
            const hasMeals = groupMeals.length > 0;
            const isSectionCollapsed = !hasMeals && !nutritionData.mealsLoading
              ? !collapsedSections.has(`${mealType}_expanded`)
              : collapsedSections.has(mealType);
            const toggleSection = () => {
              setCollapsedSections(prev => {
                const next = new Set(prev);
                if (!hasMeals && !nutritionData.mealsLoading) {
                  // Empty section: toggle via _expanded key
                  if (next.has(`${mealType}_expanded`)) next.delete(`${mealType}_expanded`);
                  else next.add(`${mealType}_expanded`);
                } else {
                  // Section with meals: toggle via mealType key
                  if (next.has(mealType)) next.delete(mealType);
                  else next.add(mealType);
                }
                return next;
              });
            };

            return (
              <div key={mealType} className="card-surface overflow-hidden">
                <button
                  type="button"
                  onClick={toggleSection}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 active:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <MealIcon className={`h-3.5 w-3.5 ${mealIconColor}`} />
                    <h3 className="text-[13px] font-semibold capitalize">{mealType}</h3>
                    <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${isSectionCollapsed ? "-rotate-90" : ""}`} />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">
                    {groupCalories > 0 ? `${Math.round(groupCalories)} kcal` : ""}
                  </span>
                </button>
                {!isSectionCollapsed && (
                  <>
                {groupMeals.length > 0 ? (
                  <div className="px-2">
                    {groupMeals.map((meal) => (
                      <MealCard key={meal.id} meal={meal} onDelete={() => handleDeleteMeal(meal)} onFavorite={() => quickActions.toggleFavorite(meal)} isFavorited={quickActions.isFavorited(meal)} />
                    ))}
                  </div>
                ) : nutritionData.mealsLoading ? (
                  <div className="px-2 pb-1">
                    <MealCardSkeleton />
                  </div>
                ) : null}
                <div className="border-t border-border/10">
                  <button
                    onClick={() => setExpandedMealActions(isActionExpanded ? null : mealType)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold text-primary/80 hover:text-primary hover:bg-primary/5 active:bg-primary/10 active:scale-[0.99] transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />Add Food
                    {isActionExpanded ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
                  </button>
                  {isActionExpanded && (
                    <div className={`grid ${quickActions.lastMeal ? "grid-cols-5" : "grid-cols-4"} gap-1 px-3 pb-3 pt-1 animate-fade-in`}>
                      <button onClick={() => openFoodSearch(mealType)} className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors">
                        <Search className="h-4 w-4 text-blue-500" /><span className="text-[13px] text-muted-foreground">Search</span>
                      </button>
                      <Suspense fallback={<div className="flex flex-col items-center gap-1 py-2"><ScanLine className="h-4 w-4 text-muted-foreground" /><span className="text-[13px] text-muted-foreground">Scan</span></div>}>
                        <BarcodeScanner onFoodScanned={aiMeal.handleBarcodeScanned} disabled={mealPlan.generatingPlan || mealOps.savingAllMeals}
                          className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors !h-auto !border-0 !bg-transparent !px-0" />
                      </Suspense>
                      <button onClick={() => { setManualMeal(prev => ({ ...prev, meal_type: mealType })); setQuickAddTab("ai"); setIsQuickAddSheetOpen(true); setExpandedMealActions(null); }}
                        className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors">
                        <Sparkles className="h-4 w-4 text-blue-500" /><span className="text-[13px] text-muted-foreground">Quick</span>
                      </button>
                      <button onClick={() => {
                        setManualMeal(prev => ({ ...prev, meal_type: mealType, meal_name: "", calories: "", protein_g: "", carbs_g: "", fats_g: "", portion_size: "", recipe_notes: "", ingredients: [] }));
                        aiMeal.setAiMealDescription(""); aiMeal.setAiLineItems([]); aiMeal.setAiAnalysisComplete(false);
                        setQuickAddTab("manual"); setIsQuickAddSheetOpen(true); setExpandedMealActions(null);
                      }} className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors">
                        <Edit2 className="h-4 w-4 text-green-500" /><span className="text-[13px] text-muted-foreground">Manual</span>
                      </button>
                      {quickActions.lastMeal && (
                        <button onClick={() => { quickActions.repeatLastMeal(mealType); setExpandedMealActions(null); }}
                          className="flex flex-col items-center gap-1 py-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors">
                          <RotateCcw className="h-4 w-4 text-amber-500" /><span className="text-[13px] text-muted-foreground">Repeat</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Favorites Section */}
        {quickActions.favorites.length > 0 && (
          <div className="card-surface overflow-hidden">
            <button
              type="button"
              onClick={() => setCollapsedSections(prev => {
                const next = new Set(prev);
                if (next.has("favorites")) next.delete("favorites"); else next.add("favorites");
                return next;
              })}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 active:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                <h3 className="text-[13px] font-semibold">Favorites</h3>
                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${collapsedSections.has("favorites") ? "-rotate-90" : ""}`} />
              </div>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">{quickActions.favorites.length}</span>
            </button>
            {!collapsedSections.has("favorites") && (
              <div className="px-2 pb-2 space-y-0.5">
                {quickActions.favorites.slice(0, 10).map((fav, i) => (
                  <button key={`${fav.meal_name}-${i}`} onClick={() => quickActions.logFavorite(fav)}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl hover:bg-muted/30 active:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                      <span className="text-[13px] font-semibold truncate">{fav.meal_name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[13px] tabular-nums text-muted-foreground">{fav.calories} kcal</span>
                      <Plus className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Diet Analysis Section */}
        <div data-tutorial="analyse-diet">
          {nutritionData.dietAnalysis ? (
            <Suspense fallback={null}>
              <DietAnalysisCard
                analysis={nutritionData.dietAnalysis}
                onDismiss={handleDietAnalysisDismiss}
                onRefresh={() => dietAnalysisHook.handleAnalyseDiet(true)}
                refreshing={nutritionData.dietAnalysisLoading}
              />
            </Suspense>
          ) : meals.length > 0 && (
            <button onClick={() => dietAnalysisHook.handleAnalyseDiet()} disabled={nutritionData.dietAnalysisLoading}
              className="card-surface w-full p-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform rounded-xl">
              <Sparkles className="h-3.5 w-3.5 text-primary" /><span className="text-sm font-medium text-foreground">Analyse Diet{gemBadge}</span>
            </button>
          )}
        </div>

        {/* AI Meal Ideas Section */}
        <div className="space-y-2" data-tutorial="generate-meal-plan">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Meal Plan Ideas</h2>
            <Button onClick={() => mealPlan.setIsAiDialogOpen(true)} size="sm" variant="ghost"
              className="h-8 text-xs gap-1.5 rounded-lg text-primary font-medium">
              <Sparkles className="h-3 w-3" />Generate
            </Button>
          </div>
          {mealPlanIdeas.length === 0 ? (
            <div className="card-surface border-dashed py-7 text-center">
              {mealPlan.generatingPlan ? (
                <>
                  <Sparkles className="h-5 w-5 text-primary mx-auto mb-1.5 animate-pulse" />
                  <p className="text-[13px] font-medium text-foreground">Generating meal ideas...</p>
                  <div className="flex justify-center gap-1 mt-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 text-primary/50 mx-auto mb-1.5 mix-blend-screen" />
                  <p className="text-[13px] font-medium text-foreground">No meal ideas yet</p>
                  <p className="text-[13px] text-foreground/60 mt-0.5">Generate AI meal suggestions above</p>
                </>
              )}
            </div>
          ) : (
            <ErrorBoundary>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button onClick={() => mealOps.saveMealIdeasToDatabase(mealPlanIdeas)} disabled={mealOps.savingAllMeals || mealOps.loggingMeal !== null}
                    size="sm" className="flex-1 h-8 text-xs rounded-xl">
                    <Plus className="mr-1 h-3 w-3" />Save All ({mealPlanIdeas.length})
                  </Button>
                  <Button onClick={mealOps.clearMealIdeas} variant="outline" size="sm" className="h-8 text-xs rounded-xl">
                    <X className="mr-1 h-3 w-3" />Clear
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {mealPlanIdeas.map((meal) => {
                    const p = meal.protein_g || 0, c = meal.carbs_g || 0, f = meal.fats_g || 0;
                    const pCal = p * 4, cCal = c * 4, fCal = f * 9;
                    const macroTotal = pCal + cCal + fCal;
                    const R = 22, CIRC = 2 * Math.PI * R;
                    const pArc = macroTotal > 0 ? (pCal / macroTotal) * CIRC : 0;
                    const cArc = macroTotal > 0 ? (cCal / macroTotal) * CIRC : 0;
                    const fArc = macroTotal > 0 ? (fCal / macroTotal) * CIRC : 0;
                    const isExpanded = expandedMealIdeas.has(meal.id);
                    const hasDetails = (meal.ingredients && Array.isArray(meal.ingredients) && meal.ingredients.length > 0) || meal.recipe_notes;
                    const mealTypeButtons = [
                      { type: "breakfast", Icon: Sunrise, color: "text-orange-400", label: "Bkfst" },
                      { type: "lunch", Icon: Salad, color: "text-blue-400", label: "Lunch" },
                      { type: "dinner", Icon: UtensilsCrossed, color: "text-purple-400", label: "Dinner" },
                      { type: "snack", Icon: Apple, color: "text-green-400", label: "Snack" },
                    ];

                    return (
                      <div key={meal.id} className="card-surface overflow-hidden transition-all duration-0">
                        <div className={`p-3 ${hasDetails ? "cursor-pointer active:bg-white/[0.02] transition-colors" : ""}`}
                          onClick={() => { if (!hasDetails) return; setExpandedMealIdeas(prev => { const next = new Set(prev); if (next.has(meal.id)) next.delete(meal.id); else next.add(meal.id); return next; }); }}>
                          <div className="flex items-start gap-3">
                            <div className="relative flex-shrink-0" style={{ width: 44, height: 44 }}>
                              <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
                                <circle cx="28" cy="28" r={R} fill="none" stroke="hsl(var(--border) / 0.15)" strokeWidth="4" />
                                {macroTotal > 0 && (<>
                                  <circle cx="28" cy="28" r={R} fill="none" stroke="#3b82f6" strokeWidth="4" strokeDasharray={`${pArc} ${CIRC - pArc}`} strokeDashoffset={0} strokeLinecap="butt" />
                                  <circle cx="28" cy="28" r={R} fill="none" stroke="#f97316" strokeWidth="4" strokeDasharray={`${cArc} ${CIRC - cArc}`} strokeDashoffset={-pArc} strokeLinecap="butt" />
                                  <circle cx="28" cy="28" r={R} fill="none" stroke="#a855f7" strokeWidth="4" strokeDasharray={`${fArc} ${CIRC - fArc}`} strokeDashoffset={-(pArc + cArc)} strokeLinecap="butt" />
                                </>)}
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center"><span className="text-[13px] font-bold tabular-nums">{meal.calories}</span></div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-sm leading-tight text-foreground">{meal.meal_name}</h4>
                              {meal.portion_size && <p className="text-[13px] text-foreground/80 mt-0.5">{meal.portion_size}</p>}
                              <div className="flex items-center gap-3 mt-2">
                                <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /><span className="text-[13px] tabular-nums font-medium">{Math.round(p)}g P</span></div>
                                <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-orange-500" /><span className="text-[13px] tabular-nums font-medium">{Math.round(c)}g C</span></div>
                                <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-purple-500" /><span className="text-[13px] tabular-nums font-medium">{Math.round(f)}g F</span></div>
                              </div>
                            </div>
                            {hasDetails && <ChevronDown className={`h-4 w-4 text-muted-foreground/50 flex-shrink-0 mt-1 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />}
                          </div>
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-border/20 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                              {meal.ingredients && Array.isArray(meal.ingredients) && meal.ingredients.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-1.5">Ingredients</p>
                                  <div className="space-y-0.5">
                                    {meal.ingredients.map((ing: Ingredient, idx: number) => (
                                      <div key={idx} className="flex items-center justify-between text-[13px] py-0.5">
                                        <span className="text-foreground/80">{ing.name}</span>
                                        <span className="text-foreground/60 tabular-nums ml-2 flex-shrink-0">{ing.grams}g</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {meal.recipe_notes && (
                                <div className="mt-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-1">Method</p>
                                  <p className="text-[13px] text-foreground/80 leading-relaxed">{meal.recipe_notes}</p></div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="border-t border-white/10 grid grid-cols-4 bg-black/10">
                          {mealTypeButtons.map((btn) => (
                            <button key={btn.type} onClick={() => mealOps.handleLogMealIdea(meal, btn.type)}
                              disabled={mealOps.loggingMeal === meal.id || mealOps.savingAllMeals}
                              className="flex flex-col items-center gap-0.5 py-2 text-[13px] font-medium text-foreground/80 hover:text-primary hover:bg-primary/5 active:bg-primary/10 active:scale-[0.97] transition-all disabled:opacity-40 border-r border-white/5 last:border-r-0">
                              <btn.Icon className={`h-3.5 w-3.5 ${btn.color}`} /><span>{btn.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ErrorBoundary>
          )}
        </div>

        {/* Food Search Dialog */}
        <Suspense fallback={null}>
          <FoodSearchDialog open={isFoodSearchOpen} onOpenChange={setIsFoodSearchOpen}
            onFoodSelected={handleFoodSearchSelected} mealType={foodSearchMealType} />
        </Suspense>

        {/* Quick Add Bottom Sheet */}
        <Dialog open={isQuickAddSheetOpen} onOpenChange={handleSheetOpenChange}>
          <DialogContent className="sm:max-w-[300px] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl p-0 border-0 bg-card/95 backdrop-blur-xl shadow-2xl gap-0">
            {aiTask && (
              <AICompactOverlay
                isOpen={true}
                isGenerating={true}
                steps={aiTask.steps}
            startedAt={aiTask.startedAt}                title={aiTask.label}
                onCancel={() => { cancelAI(); dismissTask(aiTask.id); }}
              />
            )}
            <div className="px-3 pt-3 pb-2">
              <DialogHeader><DialogTitle className="text-[13px] font-semibold text-center pr-8">Add Meal</DialogTitle></DialogHeader>
            </div>
            <div className="px-3">
              <div className="flex gap-0.5 p-0.5 rounded-md bg-muted/40 mb-2 mt-0.5">
                <button onClick={() => setQuickAddTab("ai")} className={`flex-1 py-1 text-[13px] font-semibold rounded transition-all ${quickAddTab === "ai" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  <Sparkles className="h-2.5 w-2.5 inline mr-0.5 -mt-0.5" />AI
                </button>
                <button onClick={() => setQuickAddTab("manual")} className={`flex-1 py-1 text-[13px] font-semibold rounded transition-all ${quickAddTab === "manual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  <Edit2 className="h-2.5 w-2.5 inline mr-0.5 -mt-0.5" />Manual
                </button>
              </div>
              <Select value={manualMeal.meal_type} onValueChange={(v) => setManualMeal(prev => ({ ...prev, meal_type: v }))}>
                <SelectTrigger className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20 mb-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {quickAddTab === "ai" && (
              <div className="px-3 pb-3 space-y-1.5">
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onClick={async () => { await aiMeal.capturePhoto(); }} disabled={aiMeal.aiAnalyzing}
                    className="flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-muted/30 active:bg-muted/50 transition-colors disabled:opacity-40">
                    <Camera className="h-3 w-3 text-primary" /><span className="text-[13px] font-semibold">Photo</span>
                  </button>
                  <button type="button" onClick={() => { const ta = document.querySelector<HTMLTextAreaElement>("#ai-meal-description"); if (ta) ta.focus(); }}
                    className="flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-muted/30 active:bg-muted/50 transition-colors">
                    <Edit2 className="h-3 w-3 text-muted-foreground" /><span className="text-[13px] font-semibold">Describe</span>
                  </button>
                </div>
                {aiMeal.photoBase64 && (
                  <div className="relative rounded-md overflow-hidden">
                    <img src={`data:image/jpeg;base64,${aiMeal.photoBase64}`} alt="Meal" className="w-full h-28 object-cover" />
                    <button type="button" onClick={() => aiMeal.setPhotoBase64(null)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/50 flex items-center justify-center">
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                )}
                <Textarea
                  id="ai-meal-description"
                  placeholder={isListening ? "Listening..." : (aiMeal.photoBase64 ? "Details (optional)" : (hasSeenAiPlaceholder ? "What did you eat?" : "e.g. bread with nutella, banana"))}
                  value={aiMeal.aiMealDescription} onChange={(e) => aiMeal.setAiMealDescription(e.target.value)} disabled={aiMeal.aiAnalyzing}
                  className={`text-[13px] min-h-[40px] resize-none rounded-md border-border/30 bg-muted/20 py-1.5 px-2 ${isListening ? "border-red-500/30" : ""}`} rows={2}
                  onFocus={() => { setTimeout(() => { const el = document.activeElement; if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 300); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !aiMeal.aiAnalyzing) { e.preventDefault(); aiMeal.photoBase64 ? aiMeal.handlePhotoAnalyze() : aiMeal.handleAiAnalyzeMeal(); } }} />
                {isListening && interimText && <p className="text-[13px] text-muted-foreground/60 italic px-0.5">{interimText}</p>}
                <div className="flex gap-1">
                  {voiceSupported && (
                    <button type="button" onClick={() => { triggerHapticSelection(); isListening ? stopListening() : startListening(); }} disabled={aiMeal.aiAnalyzing}
                      className={`flex items-center justify-center gap-0.5 px-2 h-7 rounded-md text-[13px] font-semibold transition-all ${isListening ? "bg-red-500/15 text-red-500 animate-pulse" : "bg-muted/30 text-muted-foreground active:bg-muted/50"}`}>
                      {isListening ? <MicOff className="h-2.5 w-2.5" /> : <Mic className="h-2.5 w-2.5" />}
                      {isListening ? "Stop" : "Voice"}
                    </button>
                  )}
                  <Button type="button" size="sm" onClick={() => { if (isListening) stopListening(); aiMeal.photoBase64 ? aiMeal.handlePhotoAnalyze() : aiMeal.handleAiAnalyzeMeal(); }} disabled={aiMeal.aiAnalyzing || (!aiMeal.photoBase64 && !aiMeal.aiMealDescription.trim())} className="flex-1 h-7 rounded-md text-[13px]">
                    <Sparkles className="h-2.5 w-2.5 mr-0.5" />{aiMeal.aiAnalyzing ? "Analyzing…" : <>{aiMeal.photoBase64 ? "Analyze Photo" : "Analyze"}{gemBadge}</>}
                  </Button>
                </div>
                {aiMeal.aiAnalysisComplete && aiMeal.aiLineItems.length > 0 && (
                  <div className="space-y-1 animate-fade-in pt-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Items</p>
                    <div className="rounded-md divide-y divide-border/20 overflow-hidden bg-muted/20 max-h-40 overflow-y-auto">
                      {aiMeal.aiLineItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 px-2 py-1">
                          <div className="flex-1 min-w-0"><p className="text-[13px] font-medium truncate">{item.name}</p><p className="text-[13px] text-muted-foreground truncate">{item.quantity}</p></div>
                          <div className="flex items-center gap-1 text-[13px] text-muted-foreground tabular-nums flex-shrink-0">
                            <span className="font-semibold text-foreground">{item.calories}</span><span>{Math.round(item.protein_g)}P</span><span>{Math.round(item.carbs_g)}C</span><span>{Math.round(item.fats_g)}F</span>
                          </div>
                          <button type="button" onClick={() => aiMeal.setAiLineItems(prev => prev.filter((_, i) => i !== idx))} className="h-4 w-4 flex items-center justify-center text-muted-foreground active:text-destructive flex-shrink-0"><X className="h-2.5 w-2.5" /></button>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 pt-1">
                      <div className="text-center p-2 rounded-lg bg-primary/10 border border-primary/20">
                        <div className="text-[15px] font-bold tabular-nums text-primary">{aiMeal.aiLineItems.reduce((s, i) => s + i.calories, 0)}</div>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">kcal</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <div className="text-[15px] font-bold tabular-nums text-blue-500">{Math.round(aiMeal.aiLineItems.reduce((s, i) => s + i.protein_g, 0))}g</div>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Protein</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                        <div className="text-[15px] font-bold tabular-nums text-orange-500">{Math.round(aiMeal.aiLineItems.reduce((s, i) => s + i.carbs_g, 0))}g</div>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Carbs</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                        <div className="text-[15px] font-bold tabular-nums text-purple-500">{Math.round(aiMeal.aiLineItems.reduce((s, i) => s + i.fats_g, 0))}g</div>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Fats</div>
                      </div>
                    </div>
                    <Input value={manualMeal.meal_name} onChange={(e) => setManualMeal(prev => ({ ...prev, meal_name: e.target.value }))} placeholder="Meal name" className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
                    <button onClick={aiMeal.handleSaveAiMeal} disabled={aiMeal.aiLineItems.length === 0} className="w-full py-2 text-[13px] font-semibold text-primary active:bg-muted/50 transition-colors border-t border-border/40 disabled:opacity-40">Add Meal</button>
                  </div>
                )}
              </div>
            )}

            {quickAddTab === "manual" && (
              <div className="px-3 pb-3 space-y-1.5">
                <Input placeholder="Meal name *" value={manualMeal.meal_name} onChange={(e) => setManualMeal({ ...manualMeal, meal_name: e.target.value })} className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20" autoFocus />
                {aiMeal.barcodeBaseMacros && (
                  <div className="rounded-md bg-muted/20 p-2 space-y-1.5">
                    <div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Serving</p><span className="text-[13px] text-muted-foreground">{aiMeal.barcodeBaseMacros.serving_size}</span></div>
                    <div className="flex items-center gap-1.5"><span className="text-[13px] text-muted-foreground flex-1">Amount</span>
                      <div className="flex items-center gap-0.5">
                        <Input type="number" min="1" step="1" value={Math.round(aiMeal.servingMultiplier * aiMeal.barcodeBaseMacros.serving_weight_g)}
                          onChange={(e) => { const grams = parseFloat(e.target.value); if (!isNaN(grams) && grams > 0) { const m = grams / aiMeal.barcodeBaseMacros!.serving_weight_g; aiMeal.setServingMultiplier(Math.round(m * 10) / 10); setManualMeal(prev => ({ ...prev, calories: Math.round(aiMeal.barcodeBaseMacros!.calories * m).toString(), protein_g: (Math.round(aiMeal.barcodeBaseMacros!.protein_g * m * 10) / 10).toString(), carbs_g: (Math.round(aiMeal.barcodeBaseMacros!.carbs_g * m * 10) / 10).toString(), fats_g: (Math.round(aiMeal.barcodeBaseMacros!.fats_g * m * 10) / 10).toString(), portion_size: `${Math.round(grams)}g` })); } }}
                          className="w-14 text-[13px] text-right h-6 rounded" /><span className="text-[13px] text-muted-foreground">g</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5"><span className="text-[13px] text-muted-foreground flex-1">Servings</span>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => { const next = Math.max(0.5, Math.round((aiMeal.servingMultiplier - 0.5) * 10) / 10); aiMeal.setServingMultiplier(next); setManualMeal(prev => ({ ...prev, calories: Math.round(aiMeal.barcodeBaseMacros!.calories * next).toString(), protein_g: (Math.round(aiMeal.barcodeBaseMacros!.protein_g * next * 10) / 10).toString(), carbs_g: (Math.round(aiMeal.barcodeBaseMacros!.carbs_g * next * 10) / 10).toString(), fats_g: (Math.round(aiMeal.barcodeBaseMacros!.fats_g * next * 10) / 10).toString(), portion_size: `${Math.round(next * aiMeal.barcodeBaseMacros!.serving_weight_g)}g` })); }}
                          disabled={aiMeal.servingMultiplier <= 0.5} className="h-5 w-5 rounded-full bg-muted/40 flex items-center justify-center text-[13px] font-medium active:bg-muted/60 transition-colors disabled:opacity-40">−</button>
                        <span className="text-[13px] font-semibold w-6 text-center tabular-nums">{aiMeal.servingMultiplier}×</span>
                        <button type="button" onClick={() => { const next = Math.min(10, Math.round((aiMeal.servingMultiplier + 0.5) * 10) / 10); aiMeal.setServingMultiplier(next); setManualMeal(prev => ({ ...prev, calories: Math.round(aiMeal.barcodeBaseMacros!.calories * next).toString(), protein_g: (Math.round(aiMeal.barcodeBaseMacros!.protein_g * next * 10) / 10).toString(), carbs_g: (Math.round(aiMeal.barcodeBaseMacros!.carbs_g * next * 10) / 10).toString(), fats_g: (Math.round(aiMeal.barcodeBaseMacros!.fats_g * next * 10) / 10).toString(), portion_size: `${Math.round(next * aiMeal.barcodeBaseMacros!.serving_weight_g)}g` })); }}
                          className="h-5 w-5 rounded-full bg-muted/40 flex items-center justify-center text-[13px] font-medium active:bg-muted/60 transition-colors">+</button>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1 border-t border-border/20 text-[13px]">
                      <span className="font-semibold text-primary">{manualMeal.calories} kcal</span><span className="text-muted-foreground">{manualMeal.protein_g}P</span><span className="text-muted-foreground">{manualMeal.carbs_g}C</span><span className="text-muted-foreground">{manualMeal.fats_g}F</span>
                    </div>
                  </div>
                )}
                <Input type="number" inputMode="numeric" placeholder="Calories *" value={manualMeal.calories} onChange={(e) => macroCalc.handleCalorieChange(e.target.value, setManualMeal)} className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
                <div className="grid grid-cols-3 gap-1">
                  <Input type="number" inputMode="decimal" step="0.1" placeholder="Protein" value={manualMeal.protein_g} onChange={(e) => setManualMeal({ ...manualMeal, protein_g: e.target.value })} className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
                  <Input type="number" inputMode="decimal" step="0.1" placeholder="Carbs" value={manualMeal.carbs_g} onChange={(e) => setManualMeal({ ...manualMeal, carbs_g: e.target.value })} className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
                  <Input type="number" inputMode="decimal" step="0.1" placeholder="Fats" value={manualMeal.fats_g} onChange={(e) => setManualMeal({ ...manualMeal, fats_g: e.target.value })} className="text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Ingredients (optional)</p>
                <div className="flex gap-1">
                  <Input placeholder="Ingredient" value={aiMeal.newIngredient.name} onChange={(e) => aiMeal.setNewIngredient({ ...aiMeal.newIngredient, name: e.target.value })} className="flex-1 text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
                  <Input type="number" inputMode="numeric" placeholder="g" value={aiMeal.newIngredient.grams} onChange={(e) => aiMeal.setNewIngredient({ ...aiMeal.newIngredient, grams: e.target.value })} className="w-12 text-[13px] h-7 rounded-md border-border/30 bg-muted/20" />
                  <Button type="button" size="sm" variant="outline" onClick={async () => {
                    if (!aiMeal.newIngredient.name.trim() || !aiMeal.newIngredient.grams) { toast({ title: "Missing Information", description: "Please enter ingredient name and grams", variant: "destructive" }); return; }
                    const ingredientName = aiMeal.newIngredient.name.trim(); const grams = parseFloat(aiMeal.newIngredient.grams);
                    if (isNaN(grams) || grams <= 0) { toast({ title: "Invalid Amount", description: "Please enter a valid number of grams", variant: "destructive" }); return; }
                    aiMeal.setLookingUpIngredient(true); aiMeal.setIngredientLookupError(null);
                    try {
                      const nutritionData = await aiMeal.lookupIngredientNutrition(ingredientName);
                      if (nutritionData) {
                        const newIngredients = [...manualMeal.ingredients, { name: ingredientName, grams, calories_per_100g: nutritionData.calories_per_100g, protein_per_100g: nutritionData.protein_per_100g, carbs_per_100g: nutritionData.carbs_per_100g, fats_per_100g: nutritionData.fats_per_100g, source: nutritionData.source }];
                        const tc = newIngredients.reduce((s, i) => s + (i.calories_per_100g || 0) * i.grams / 100, 0);
                        const tp = newIngredients.reduce((s, i) => s + (i.protein_per_100g || 0) * i.grams / 100, 0);
                        const tcarb = newIngredients.reduce((s, i) => s + (i.carbs_per_100g || 0) * i.grams / 100, 0);
                        const tf = newIngredients.reduce((s, i) => s + (i.fats_per_100g || 0) * i.grams / 100, 0);
                        setManualMeal({ ...manualMeal, ingredients: newIngredients, calories: Math.round(tc).toString(), protein_g: tp > 0 ? (Math.round(tp * 10) / 10).toString() : "", carbs_g: tcarb > 0 ? (Math.round(tcarb * 10) / 10).toString() : "", fats_g: tf > 0 ? (Math.round(tf * 10) / 10).toString() : "" });
                        aiMeal.setNewIngredient({ name: "", grams: "" });
                      } else { aiMeal.setManualNutritionDialog({ open: true, ingredientName, grams, calories_per_100g: "", protein_per_100g: "", carbs_per_100g: "", fats_per_100g: "" }); }
                    } catch { aiMeal.setManualNutritionDialog({ open: true, ingredientName, grams, calories_per_100g: "", protein_per_100g: "", carbs_per_100g: "", fats_per_100g: "" }); }
                    finally { aiMeal.setLookingUpIngredient(false); }
                  }} disabled={aiMeal.lookingUpIngredient || !aiMeal.newIngredient.name.trim() || !aiMeal.newIngredient.grams} className="shrink-0 h-7 rounded-md border-border/30 px-1.5">
                    {aiMeal.lookingUpIngredient ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Plus className="h-2.5 w-2.5" />}
                  </Button>
                </div>
                {aiMeal.ingredientLookupError && <p className="text-[13px] text-destructive">{aiMeal.ingredientLookupError}</p>}
                {manualMeal.ingredients.length > 0 && (
                  <div className="rounded-md divide-y divide-border/20 overflow-hidden bg-muted/20">
                    {manualMeal.ingredients.map((ingredient, idx) => {
                      const cal = ingredient.calories_per_100g !== undefined ? Math.round(ingredient.calories_per_100g * ingredient.grams / 100) : null;
                      return (
                        <div key={idx} className="flex items-center gap-1.5 px-2 py-1 text-[13px]">
                          <span className="flex-1 truncate">{ingredient.name}</span><span className="text-muted-foreground shrink-0">{ingredient.grams}g</span>
                          {cal !== null && <span className="text-muted-foreground shrink-0">{cal}kcal</span>}
                          <button type="button" className="h-4 w-4 shrink-0 flex items-center justify-center text-muted-foreground active:text-destructive"
                            onClick={() => { const updated = [...manualMeal.ingredients]; updated.splice(idx, 1); setManualMeal({ ...manualMeal, ingredients: updated }); }}><X className="h-2.5 w-2.5" /></button>
                        </div>);
                    })}
                    {manualMeal.ingredients.some(ing => ing.calories_per_100g !== undefined) && (
                      <div className="flex justify-between px-2 py-0.5 text-[13px] text-muted-foreground bg-muted/30"><span>Total</span><span>{manualMeal.ingredients.reduce((s, i) => s + i.grams, 0)}g</span></div>
                    )}
                  </div>
                )}
                <button onClick={handleAddManualMeal} disabled={mealOps.savingAllMeals} className="w-full py-2 text-[13px] font-semibold text-primary active:bg-muted/50 transition-colors border-t border-border/40 disabled:opacity-40">{mealOps.savingAllMeals ? "Adding…" : "Add Meal"}</button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* AI Meal Plan Dialog */}
        <Dialog open={mealPlan.isAiDialogOpen} onOpenChange={(open) => mealPlan.setIsAiDialogOpen(open)}>
          <DialogContent className="sm:max-w-[340px] max-h-[85vh] overflow-y-auto rounded-xl p-0 border-0 bg-card/95 backdrop-blur-xl shadow-2xl gap-0">
            <div className="px-4 pt-4 pb-3">
              <DialogHeader><DialogTitle className="text-[15px] font-semibold text-center"><Sparkles className="h-3.5 w-3.5 inline mr-1 -mt-0.5 text-primary" />Meal ideas · {format(new Date(selectedDate), "MMM d")}</DialogTitle></DialogHeader>
            </div>
            <div className="px-4 pb-4 space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {["High protein", "Low carb", "Mediterranean", "Fight week prep"].map((chip) => (
                  <button key={chip} onClick={() => mealPlan.setAiPrompt(prev => prev ? `${prev.trimEnd()} ${chip.toLowerCase()}` : chip)}
                    className="px-2.5 py-1 rounded-full text-[13px] font-medium bg-muted/40 text-muted-foreground active:bg-muted/60 transition-colors">{chip}</button>
                ))}
              </div>
              <Textarea placeholder="Describe what you'd like to eat..." value={mealPlan.aiPrompt} onChange={(e) => mealPlan.setAiPrompt(e.target.value)} rows={2} className="resize-none text-[13px] rounded-lg border-border/30 bg-muted/20" />
              <button onClick={mealPlan.handleGenerateMealPlan} disabled={mealPlan.generatingPlan}
                className="w-full py-2.5 text-[14px] font-semibold text-primary active:bg-muted/50 transition-colors border-t border-border/40 mt-1 disabled:opacity-40">
                <Sparkles className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />{mealPlan.generatingPlan ? "Generating..." : <>Generate Meal Ideas{gemBadge}</>}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Manual Nutrition Input Dialog */}
        <Dialog open={aiMeal.manualNutritionDialog.open} onOpenChange={(open) => {
          if (!open) { aiMeal.setManualNutritionDialog({ open: false, ingredientName: "", grams: 0, calories_per_100g: "", protein_per_100g: "", carbs_per_100g: "", fats_per_100g: "" }); aiMeal.setIngredientLookupError(null); }
        }}>
          <DialogContent className="sm:max-w-[300px] rounded-xl p-0 border-0 bg-card/95 backdrop-blur-xl shadow-2xl gap-0">
            <div className="px-4 pt-4 pb-2">
              <DialogHeader><DialogTitle className="text-[15px] font-semibold text-center">Enter Nutrition</DialogTitle></DialogHeader>
              <p className="text-[13px] text-muted-foreground text-center mt-0.5">Per 100g for "{aiMeal.manualNutritionDialog.ingredientName}"</p>
            </div>
            <div className="px-4 space-y-2.5 pb-1">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/20 text-[13px]">
                <span className="font-medium flex-1">{aiMeal.manualNutritionDialog.ingredientName}</span><span className="text-muted-foreground">{aiMeal.manualNutritionDialog.grams}g</span>
              </div>
              <div>
                <Label htmlFor="manual-calories-dialog" className="text-[13px] text-muted-foreground">Calories per 100g *</Label>
                <Input id="manual-calories-dialog" type="number" placeholder="165" value={aiMeal.manualNutritionDialog.calories_per_100g}
                  onChange={(e) => { const calories = e.target.value; aiMeal.setManualNutritionDialog({ ...aiMeal.manualNutritionDialog, calories_per_100g: calories }); macroCalc.debouncedMacroCalculation(calories, (macros) => { aiMeal.setManualNutritionDialog(prev => ({ ...prev, protein_per_100g: macros.protein_g, carbs_per_100g: macros.carbs_g, fats_per_100g: macros.fats_g })); }); }}
                  className="h-8 text-[13px] rounded-lg border-border/30 bg-muted/20 mt-0.5" />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div><Label htmlFor="manual-protein-dialog" className="text-[13px] text-muted-foreground">Protein</Label><Input id="manual-protein-dialog" type="number" step="0.1" placeholder="31.0" value={aiMeal.manualNutritionDialog.protein_per_100g} onChange={(e) => aiMeal.setManualNutritionDialog({ ...aiMeal.manualNutritionDialog, protein_per_100g: e.target.value })} className="h-8 text-[13px] rounded-lg border-border/30 bg-muted/20 mt-0.5" /></div>
                <div><Label htmlFor="manual-carbs-dialog" className="text-[13px] text-muted-foreground">Carbs</Label><Input id="manual-carbs-dialog" type="number" step="0.1" placeholder="0.0" value={aiMeal.manualNutritionDialog.carbs_per_100g} onChange={(e) => aiMeal.setManualNutritionDialog({ ...aiMeal.manualNutritionDialog, carbs_per_100g: e.target.value })} className="h-8 text-[13px] rounded-lg border-border/30 bg-muted/20 mt-0.5" /></div>
                <div><Label htmlFor="manual-fats-dialog" className="text-[13px] text-muted-foreground">Fats</Label><Input id="manual-fats-dialog" type="number" step="0.1" placeholder="3.6" value={aiMeal.manualNutritionDialog.fats_per_100g} onChange={(e) => aiMeal.setManualNutritionDialog({ ...aiMeal.manualNutritionDialog, fats_per_100g: e.target.value })} className="h-8 text-[13px] rounded-lg border-border/30 bg-muted/20 mt-0.5" /></div>
              </div>
            </div>
            <div className="border-t border-border/40 mt-2">
              <button onClick={aiMeal.handleManualNutritionSubmit} className="w-full py-2.5 text-[14px] font-semibold text-primary active:bg-muted/50 transition-colors">Add Ingredient</button>
              <div className="border-t border-border/40" />
              <button onClick={() => { aiMeal.setManualNutritionDialog({ open: false, ingredientName: "", grams: 0, calories_per_100g: "", protein_per_100g: "", carbs_per_100g: "", fats_per_100g: "" }); aiMeal.setIngredientLookupError(null); }} className="w-full py-2.5 text-[14px] font-normal text-muted-foreground active:bg-muted/50 transition-colors">Cancel</button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Nutrition Targets Dialog */}
        <Dialog open={isEditTargetsDialogOpen} onOpenChange={setIsEditTargetsDialogOpen}>
          <DialogContent className="sm:max-w-[300px] rounded-xl p-0 border-0 bg-card/95 backdrop-blur-xl shadow-2xl gap-0">
            <div className="px-4 pt-4 pb-2">
              <DialogHeader><DialogTitle className="text-[15px] font-semibold text-center">Edit Targets</DialogTitle></DialogHeader>
              <p className="text-[13px] text-muted-foreground text-center mt-0.5">Override AI recommendations</p>
            </div>
            <div className="px-4 space-y-2.5 pb-1">
              <div>
                <Label htmlFor="edit-calories" className="text-[13px] text-muted-foreground">Daily Calories *</Label>
                <Input id="edit-calories" type="number" placeholder="2000" value={editingTargets.calories} min="1" required
                  onChange={(e) => { const calories = e.target.value; const cv = parseInt(calories) || 0; const macros = cv > 0 ? macroCalc.calculateMacrosFromCalories(cv) : null; setEditingTargets(prev => ({ ...prev, calories, ...(macros ? { protein: macros.protein_g, carbs: macros.carbs_g, fats: macros.fats_g } : {}) })); }}
                  className="h-8 text-[13px] rounded-lg border-border/30 bg-muted/20 mt-0.5" />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div><Label htmlFor="edit-protein" className="text-[13px] text-muted-foreground">Protein</Label>
                  <Input id="edit-protein" type="number" step="1" placeholder="150" value={editingTargets.protein} min="0"
                    onChange={(e) => { const val = parseFloat(e.target.value) || 0; const calGoal = parseFloat(editingTargets.calories) || 0; if (calGoal > 0) { const adjusted = macroCalc.adjustMacrosToMatchCalories('protein', val, { protein: parseFloat(editingTargets.protein) || 0, carbs: parseFloat(editingTargets.carbs) || 0, fats: parseFloat(editingTargets.fats) || 0 }, calGoal); setEditingTargets(prev => ({ ...prev, protein: adjusted.protein.toString(), carbs: adjusted.carbs.toString(), fats: adjusted.fats.toString() })); } else { setEditingTargets(prev => ({ ...prev, protein: e.target.value })); } }}
                    className="h-8 text-[13px] rounded-lg border-border/30 bg-muted/20 mt-0.5" /></div>
                <div><Label htmlFor="edit-carbs" className="text-[13px] text-muted-foreground">Carbs</Label>
                  <Input id="edit-carbs" type="number" step="1" placeholder="200" value={editingTargets.carbs} min="0"
                    onChange={(e) => { const val = parseFloat(e.target.value) || 0; const calGoal = parseFloat(editingTargets.calories) || 0; if (calGoal > 0) { const adjusted = macroCalc.adjustMacrosToMatchCalories('carbs', val, { protein: parseFloat(editingTargets.protein) || 0, carbs: parseFloat(editingTargets.carbs) || 0, fats: parseFloat(editingTargets.fats) || 0 }, calGoal); setEditingTargets(prev => ({ ...prev, protein: adjusted.protein.toString(), carbs: adjusted.carbs.toString(), fats: adjusted.fats.toString() })); } else { setEditingTargets(prev => ({ ...prev, carbs: e.target.value })); } }}
                    className="h-8 text-[13px] rounded-lg border-border/30 bg-muted/20 mt-0.5" /></div>
                <div><Label htmlFor="edit-fats" className="text-[13px] text-muted-foreground">Fats</Label>
                  <Input id="edit-fats" type="number" step="1" placeholder="65" value={editingTargets.fats} min="0"
                    onChange={(e) => { const val = parseFloat(e.target.value) || 0; const calGoal = parseFloat(editingTargets.calories) || 0; if (calGoal > 0) { const adjusted = macroCalc.adjustMacrosToMatchCalories('fats', val, { protein: parseFloat(editingTargets.protein) || 0, carbs: parseFloat(editingTargets.carbs) || 0, fats: parseFloat(editingTargets.fats) || 0 }, calGoal); setEditingTargets(prev => ({ ...prev, protein: adjusted.protein.toString(), carbs: adjusted.carbs.toString(), fats: adjusted.fats.toString() })); } else { setEditingTargets(prev => ({ ...prev, fats: e.target.value })); } }}
                    className="h-8 text-[13px] rounded-lg border-border/30 bg-muted/20 mt-0.5" /></div>
              </div>
              {(() => { const p = parseFloat(editingTargets.protein) || 0, c = parseFloat(editingTargets.carbs) || 0, f = parseFloat(editingTargets.fats) || 0, calGoal = parseFloat(editingTargets.calories) || 0; const macroTotal = p * 4 + c * 4 + f * 9; const diff = Math.abs(macroTotal - calGoal); const totalMacroG = p + c + f; const pPct = totalMacroG > 0 ? Math.round((p / totalMacroG) * 100) : 0; const cPct = totalMacroG > 0 ? Math.round((c / totalMacroG) * 100) : 0; const fPct = totalMacroG > 0 ? 100 - pPct - cPct : 0; const color = calGoal === 0 ? 'text-muted-foreground' : diff <= 20 ? 'text-green-600' : diff <= 50 ? 'text-yellow-600' : 'text-red-600'; return calGoal > 0 ? <p className={`text-[13px] font-medium ${color}`}>Macro total: {Math.round(macroTotal)} / {Math.round(calGoal)} kcal &bull; {pPct}% P / {cPct}% C / {fPct}% F</p> : null; })()}
            </div>
            <div className="border-t border-border/40 mt-2">
              <button onClick={handleSaveTargets} className="w-full py-2.5 text-[14px] font-semibold text-primary active:bg-muted/50 transition-colors">Save Targets</button>
              <div className="border-t border-border/40" />
              <button onClick={() => setIsEditTargetsDialogOpen(false)} className="w-full py-2.5 text-[14px] font-normal text-muted-foreground active:bg-muted/50 transition-colors">Cancel</button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm Dialog */}
        <DeleteConfirmDialog open={mealOps.deleteDialogOpen} onOpenChange={mealOps.setDeleteDialogOpen} onConfirm={mealOps.handleDeleteMeal}
          title="Delete Meal Entry" itemName={mealOps.mealToDelete ? `${mealOps.mealToDelete.meal_name} (${mealOps.mealToDelete.calories} cal)` : undefined} />
      </div>

      {/* Training Food Ideas Bottom Sheet */}
      <Sheet open={wisdom.trainingWisdomSheetOpen} onOpenChange={wisdom.setTrainingWisdomSheetOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="mb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/15 p-2 flex-shrink-0"><img src={wizardLogo} alt="Wizard" className="w-10 h-10 rounded-full object-cover" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-base">Training Fuel Guide</SheetTitle>
                  <button onClick={() => wisdom.generateTrainingFoodIdeas(true)} disabled={wisdom.trainingWisdomLoading}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-40 transition-colors px-2 py-1 rounded-lg hover:bg-primary/5">
                    {wisdom.trainingWisdomLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M14 8A6 6 0 1 1 8 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M8 2V5l2-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    Refresh
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Optimal pre & post training nutrition</p>
              </div>
            </div>
          </SheetHeader>
          <div className="flex gap-2 mb-4">
            <Input placeholder="e.g. easily digestible, high carb, no dairy…" value={wisdom.trainingPreference} onChange={(e) => wisdom.setTrainingPreference(e.target.value)} disabled={wisdom.trainingWisdomLoading} className="text-sm h-9"
              onKeyDown={(e) => { if (e.key === 'Enter' && wisdom.trainingPreference.trim()) wisdom.generateTrainingFoodIdeas(true); }} />
            <Button size="sm" onClick={() => wisdom.generateTrainingFoodIdeas(true)} disabled={wisdom.trainingWisdomLoading || !wisdom.trainingPreference.trim()} className="h-9 px-3 shrink-0">
              <Sparkles className="h-3.5 w-3.5 mr-1" />Go
            </Button>
          </div>
          {wisdom.trainingWisdomLoading ? (
            <div className="space-y-5 py-4">
              <div className="text-center mb-2"><p className="text-sm font-medium text-foreground">Crafting your training fuel plan…</p><p className="text-xs text-muted-foreground/60 mt-0.5">Personalizing based on your goals</p></div>
              <div className="relative h-1 rounded-full bg-border/20 overflow-hidden"><div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-secondary to-primary" style={{ animation: 'trainingProgressGrow 8s ease-out forwards' }} /></div>
              <style>{`@keyframes trainingProgressGrow { 0% { width: 5%; } 30% { width: 35%; } 60% { width: 60%; } 80% { width: 80%; } 100% { width: 95%; } } @keyframes trainingStepFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
              <div className="space-y-3">
                {[{ icon: "🎯", label: "Analyzing your macro targets", delay: "0s" }, { icon: "⚡", label: "Designing pre-training fuel", delay: "2s" }, { icon: "💪", label: "Crafting post-training recovery meals", delay: "4s" }, { icon: "✨", label: "Finalizing recommendations", delay: "6s" }].map((step, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-500" style={{ animation: `trainingStepFadeIn 0.5s ease-out ${step.delay} both` }}>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm flex-shrink-0">{step.icon}</div>
                    <span className="text-sm text-muted-foreground">{step.label}</span>
                    <Loader2 className="h-3.5 w-3.5 text-primary/40 animate-spin ml-auto flex-shrink-0" style={{ animationDelay: step.delay }} />
                  </div>
                ))}
              </div>
            </div>
          ) : wisdom.trainingWisdom ? (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3"><div className="w-6 h-6 rounded-full bg-orange-500/15 flex items-center justify-center"><Sparkles className="h-3.5 w-3.5 text-orange-500" /></div><h4 className="text-sm font-bold uppercase tracking-wider text-orange-500">Pre-Training</h4></div>
                <div className="space-y-2.5">{wisdom.trainingWisdom.preMeals.map((meal, i) => (
                  <div key={i} className="card-surface p-3.5 space-y-1.5"><div className="flex items-start justify-between gap-2"><h5 className="text-sm font-semibold">{meal.name}</h5><span className="text-[13px] font-medium text-orange-500/70 bg-orange-500/10 px-2 py-0.5 rounded-full flex-shrink-0">{meal.timing}</span></div><p className="text-xs text-muted-foreground leading-relaxed">{meal.description}</p><p className="text-[13px] font-medium text-muted-foreground/60 tabular-nums">{meal.macros}</p></div>
                ))}</div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3"><div className="w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center"><Dumbbell className="h-3.5 w-3.5 text-blue-500" /></div><h4 className="text-sm font-bold uppercase tracking-wider text-blue-500">Post-Training</h4></div>
                <div className="space-y-2.5">{wisdom.trainingWisdom.postMeals.map((meal, i) => (
                  <div key={i} className="card-surface p-3.5 space-y-1.5"><div className="flex items-start justify-between gap-2"><h5 className="text-sm font-semibold">{meal.name}</h5><span className="text-[13px] font-medium text-blue-500/70 bg-blue-500/10 px-2 py-0.5 rounded-full flex-shrink-0">{meal.timing}</span></div><p className="text-xs text-muted-foreground leading-relaxed">{meal.description}</p><p className="text-[13px] font-medium text-muted-foreground/60 tabular-nums">{meal.macros}</p></div>
                ))}</div>
              </div>
              {wisdom.trainingWisdom.tip && (
                <div className="rounded-xl bg-primary/5 border border-primary/10 p-3.5">
                  <div className="flex items-center gap-2 mb-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /><span className="text-xs font-semibold text-primary">Wizard's Tip</span></div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{wisdom.trainingWisdom.tip}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12"><Sparkles className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" /><p className="text-sm text-muted-foreground">No training ideas available</p><p className="text-xs text-muted-foreground/50 mt-1">Tap the card above to generate ideas</p></div>
          )}
        </SheetContent>
      </Sheet>

      <Suspense fallback={null}>
        <ShareCardDialog open={nutritionData.shareOpen} onOpenChange={nutritionData.setShareOpen} title="Share Nutrition" shareTitle="My Nutrition Stats" shareText="Check out my nutrition tracking on FightCamp Wizard!">
          {({ cardRef, aspect }) => (
            <NutritionCard ref={cardRef} date={selectedDate} calories={totalCalories} calorieTarget={dailyCalorieTarget}
              protein={totalProtein} carbs={totalCarbs} fats={totalFats}
              proteinGoal={aiMacroGoals?.proteinGrams ?? 0} carbsGoal={aiMacroGoals?.carbsGrams ?? 0} fatsGoal={aiMacroGoals?.fatsGrams ?? 0}
              mealCount={meals.length} streak={nutritionData.nutritionStreak} totalMealsLogged={nutritionData.totalMealsLogged} aspect={aspect} />
          )}
        </ShareCardDialog>
      </Suspense>
    </>
  );
}
