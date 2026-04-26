import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Gem } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { nutritionLogSchema } from "@/lib/validation";
import { useUser } from "@/contexts/UserContext";
import { logger } from "@/lib/logger";
import { useAITask } from "@/contexts/AITaskContext";
import { useGems } from "@/hooks/useGems";

import type { Meal, ManualMealForm } from "@/pages/nutrition/types";
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
} from "@/hooks/nutrition";
import { useSaveNutritionTargets } from "@/hooks/nutrition/useSaveNutritionTargets";
import { useNutritionPageEffects } from "@/hooks/nutrition/useNutritionPageEffects";

import { NutritionHero } from "./NutritionHero";
import { MealSections } from "./MealSections";
import { MealIdeasSection } from "./MealIdeasSection";
import { TrainingWisdomSheet } from "./TrainingWisdomSheet";
import { EmptyMealsBanner } from "./EmptyMealsBanner";
import { AiTaskBanner } from "./AiTaskBanner";
import { QuickAddDialog } from "./dialogs/QuickAddDialog";
import { AiMealPlanDialog } from "./dialogs/AiMealPlanDialog";
import { EditTargetsDialog } from "./dialogs/EditTargetsDialog";
import { ManualNutritionDialog } from "./dialogs/ManualNutritionDialog";
import { FavoritesSheet } from "./dialogs/FavoritesSheet";

const FoodSearchDialog = lazy(() => import("@/components/nutrition/FoodSearchDialog").then((m) => ({ default: m.FoodSearchDialog })));
const DietAnalysisCard = lazy(() => import("@/components/nutrition/DietAnalysisCard").then((m) => ({ default: m.DietAnalysisCard })));

export default function NutritionPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userId } = useUser();

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
  const { gems, isPremium: gemsIsPremium } = useGems();

  const gemBadge = !gemsIsPremium ? (
    <span className="inline-flex items-center gap-0.5 ml-1.5 text-muted-foreground">
      <Gem className="h-3 w-3" />
      <span className="text-[13px] font-medium tabular-nums">{gems}</span>
    </span>
  ) : null;

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const loading = mealPlan.generatingPlan || mealOps.loggingMeal !== null || mealOps.savingAllMeals;

  const handleDeleteMeal = useCallback((meal: Meal) => { mealOps.initiateDeleteMeal(meal); }, [mealOps.initiateDeleteMeal]);

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
      if (type in groups) groups[type].push(m);
      else groups["snack"].push(m);
    }
    return groups;
  }, [meals]);

  const { tasks, dismissTask } = useAITask();

  useNutritionPageEffects({
    userId,
    isQuickAddSheetOpen,
    quickAddTab,
    searchParams,
    setSearchParams,
    setIsQuickAddSheetOpen,
    setQuickAddTab,
    manualMeal,
    setManualMeal,
    tasks,
    dismissTask,
    setDietAnalysis: nutritionData.setDietAnalysis,
  });

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

  const openFoodSearch = useCallback((mealType: string) => {
    setFoodSearchMealType(mealType);
    setIsFoodSearchOpen(true);
  }, []);

  const openQuickAdd = useCallback((mealType: "breakfast" | "lunch" | "dinner" | "snack") => {
    setManualMeal((prev) => ({ ...prev, meal_type: mealType }));
    setQuickAddTab("ai");
    setIsQuickAddSheetOpen(true);
  }, []);

  const openManualAdd = useCallback((mealType: "breakfast" | "lunch" | "dinner" | "snack") => {
    setManualMeal((prev) => ({
      ...prev, meal_type: mealType, meal_name: "", calories: "",
      protein_g: "", carbs_g: "", fats_g: "", portion_size: "", recipe_notes: "", ingredients: [],
    }));
    aiMeal.setAiMealDescription("");
    aiMeal.setAiLineItems([]);
    aiMeal.setAiAnalysisComplete(false);
    setQuickAddTab("manual");
    setIsQuickAddSheetOpen(true);
  }, [aiMeal.setAiMealDescription, aiMeal.setAiLineItems, aiMeal.setAiAnalysisComplete]);

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
    if (!open) {
      aiMeal.setIngredientLookupError(null);
      aiMeal.setBarcodeBaseMacros(null);
      aiMeal.setServingMultiplier(1);
      aiMeal.setAiLineItems([]);
      aiMeal.setAiAnalysisComplete(false);
    }
  }, [aiMeal.setIngredientLookupError, aiMeal.setBarcodeBaseMacros, aiMeal.setServingMultiplier, aiMeal.setAiLineItems, aiMeal.setAiAnalysisComplete]);

  const saveTargets = useSaveNutritionTargets({
    setDailyCalorieTarget,
    setAiMacroGoals,
    setIsEditTargetsDialogOpen,
  });
  const handleSaveTargets = () => saveTargets(editingTargets);

  const aiTask = tasks.find((t) => t.status === "running" && ["meal-analysis", "ingredient-lookup", "meal-plan", "diet-analysis"].includes(t.type));

  const toggleFavoritesCollapsed = useCallback(() => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has("favorites")) next.delete("favorites");
      else next.add("favorites");
      return next;
    });
  }, []);

  return (
    <>
      <AiTaskBanner
        aiTask={aiTask}
        photoAnalyzing={aiMeal.photoAnalyzing}
        photoBase64={aiMeal.photoBase64}
        onCancel={cancelAI}
        onDismiss={dismissTask}
      />
      <div className="animate-page-in space-y-2.5 px-5 py-3 sm:p-5 md:p-6 max-w-7xl mx-auto overflow-x-hidden">
        <NutritionHero
          wisdom={wisdom}
          totalCalories={totalCalories}
          totalProtein={totalProtein}
          totalCarbs={totalCarbs}
          totalFats={totalFats}
          dailyCalorieTarget={dailyCalorieTarget}
          effectiveMacroGoals={effectiveMacroGoals}
          onEditTargets={handleEditTargets}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          mealsLoading={nutritionData.mealsLoading}
          mealsVisibleCount={meals.length}
        />

        <EmptyMealsBanner
          visible={meals.length === 0 && selectedDate === todayStr && !loading && !nutritionData.mealsLoading}
          previousDayMealCount={quickActions.previousDayMealCount}
          copyingPreviousDay={quickActions.copyingPreviousDay}
          lastMeal={quickActions.lastMeal}
          onQuickAdd={() => {
            // Pin the meal_type before opening so the AI-saved meal lands in
            // the section matching current time-of-day instead of whatever
            // stale type is in form state.
            const h = new Date().getHours();
            const defaultType: "breakfast" | "lunch" | "dinner" | "snack" =
              h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack";
            setManualMeal((prev) => ({ ...prev, meal_type: defaultType }));
            setQuickAddTab("ai");
            setIsQuickAddSheetOpen(true);
          }}
          onCopyPreviousDay={quickActions.copyPreviousDay}
          onRepeatLast={() => quickActions.repeatLastMeal()}
        />

        {showMealSuccess && (
          <div className="flex items-center justify-center gap-1.5 text-success animate-[fadeSlideUp_0.3s_ease-out_both]">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Meal added</span>
          </div>
        )}

        <MealSections
          mealsLoading={nutritionData.mealsLoading}
          groupedMeals={groupedMeals}
          collapsedSections={collapsedSections}
          setCollapsedSections={setCollapsedSections}
          expandedMealActions={expandedMealActions}
          setExpandedMealActions={setExpandedMealActions}
          quickActions={quickActions}
          aiMealHandlers={{ handleBarcodeScanned: aiMeal.handleBarcodeScanned }}
          generatingPlan={mealPlan.generatingPlan}
          savingAllMeals={mealOps.savingAllMeals}
          onDeleteMeal={handleDeleteMeal}
          onOpenFoodSearch={openFoodSearch}
          onOpenQuickAdd={openQuickAdd}
          onOpenManualAdd={openManualAdd}
        />

        <FavoritesSheet
          favorites={quickActions.favorites}
          collapsed={collapsedSections.has("favorites")}
          onToggle={toggleFavoritesCollapsed}
          onLogFavorite={quickActions.logFavorite}
        />

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
            <button
              onClick={() => dietAnalysisHook.handleAnalyseDiet()}
              disabled={nutritionData.dietAnalysisLoading}
              className="card-surface w-full p-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform rounded-2xl"
            >
              <span className="text-sm font-medium text-foreground">Analyse Diet{gemBadge}</span>
            </button>
          )}
        </div>

        <MealIdeasSection
          mealPlanIdeas={mealPlanIdeas}
          setIsAiDialogOpen={mealPlan.setIsAiDialogOpen}
          generatingPlan={mealPlan.generatingPlan}
          savingAllMeals={mealOps.savingAllMeals}
          loggingMealId={mealOps.loggingMeal}
          expandedMealIdeas={expandedMealIdeas}
          setExpandedMealIdeas={setExpandedMealIdeas}
          onSaveAll={mealOps.saveMealIdeasToDatabase}
          onClear={mealOps.clearMealIdeas}
          onLogIdea={mealOps.handleLogMealIdea}
        />

        <Suspense fallback={null}>
          <FoodSearchDialog
            open={isFoodSearchOpen}
            onOpenChange={setIsFoodSearchOpen}
            onFoodSelected={handleFoodSearchSelected}
            mealType={foodSearchMealType}
          />
        </Suspense>

        <QuickAddDialog
          open={isQuickAddSheetOpen}
          onOpenChange={handleSheetOpenChange}
          quickAddTab={quickAddTab}
          setQuickAddTab={setQuickAddTab}
          manualMeal={manualMeal}
          setManualMeal={setManualMeal}
          aiMeal={aiMeal}
          macroCalc={macroCalc}
          savingAllMeals={mealOps.savingAllMeals}
          onAddManualMeal={handleAddManualMeal}
          aiTask={aiTask ?? null}
          onCancelAi={cancelAI}
          onDismissTask={dismissTask}
          onToast={toast}
          gemBadge={gemBadge}
        />

        <AiMealPlanDialog
          open={mealPlan.isAiDialogOpen}
          onOpenChange={(open) => mealPlan.setIsAiDialogOpen(open)}
          selectedDate={selectedDate}
          aiPrompt={mealPlan.aiPrompt}
          setAiPrompt={mealPlan.setAiPrompt}
          generatingPlan={mealPlan.generatingPlan}
          onGenerate={mealPlan.handleGenerateMealPlan}
          gemBadge={gemBadge}
        />

        <ManualNutritionDialog
          state={aiMeal.manualNutritionDialog}
          setState={aiMeal.setManualNutritionDialog}
          macroCalc={macroCalc}
          onSubmit={aiMeal.handleManualNutritionSubmit}
          onClose={() => aiMeal.setIngredientLookupError(null)}
        />

        <EditTargetsDialog
          open={isEditTargetsDialogOpen}
          onOpenChange={setIsEditTargetsDialogOpen}
          editingTargets={editingTargets}
          setEditingTargets={setEditingTargets}
          macroCalc={macroCalc}
          onSave={handleSaveTargets}
        />

        <DeleteConfirmDialog
          open={mealOps.deleteDialogOpen}
          onOpenChange={mealOps.setDeleteDialogOpen}
          onConfirm={mealOps.handleDeleteMeal}
          title="Delete Meal Entry"
          itemName={mealOps.mealToDelete ? `${mealOps.mealToDelete.meal_name} (${mealOps.mealToDelete.calories} cal)` : undefined}
        />
      </div>

      <TrainingWisdomSheet
        open={wisdom.trainingWisdomSheetOpen}
        onOpenChange={wisdom.setTrainingWisdomSheetOpen}
        loading={wisdom.trainingWisdomLoading}
        wisdom={wisdom.trainingWisdom}
        preference={wisdom.trainingPreference}
        setPreference={wisdom.setTrainingPreference}
        onGenerate={wisdom.generateTrainingFoodIdeas}
      />

    </>
  );
}
