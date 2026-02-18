import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Sparkles, Calendar as CalendarIcon, TrendingUp, Loader2, AlertCircle, Settings, Edit2, X, Lock } from "lucide-react";
import { MealCard } from "@/components/nutrition/MealCard";
import { CalorieBudgetIndicator } from "@/components/nutrition/CalorieBudgetIndicator";
import { MacroRings } from "@/components/nutrition/MacroRings";
import { VoiceInput } from "@/components/nutrition/VoiceInput";
import { BarcodeScanner } from "@/components/nutrition/BarcodeScanner";
import { format, subDays, addDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { nutritionLogSchema } from "@/lib/validation";
import { calculateCalorieTarget as calculateCalorieTargetUtil } from "@/lib/calorieCalculation";
import { useUser } from "@/contexts/UserContext";
import { AIPersistence } from "@/lib/aiPersistence";
import ErrorBoundary from "@/components/ErrorBoundary";
import { optimisticUpdateManager, createNutritionTargetUpdate, createMealLogUpdate } from "@/lib/optimisticUpdates";
import { useDebouncedCallback } from "@/hooks/useDebounce";
import { nutritionCache, cacheHelpers } from "@/lib/nutritionCache";

interface Ingredient {
  name: string;
  grams: number;
  calories_per_100g?: number;
  protein_per_100g?: number;
  carbs_per_100g?: number;
  fats_per_100g?: number;
  source?: string; // e.g., "USDA", "Nutrition Database", "AI Analysis"
}

interface Meal {
  id: string;
  meal_name: string;
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  meal_type?: string;
  portion_size?: string;
  recipe_notes?: string;
  is_ai_generated?: boolean;
  ingredients?: Ingredient[];
  date: string;
}

export default function Nutrition() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [mealPlanIdeas, setMealPlanIdeas] = useState<Meal[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [loggingMeal, setLoggingMeal] = useState<string | null>(null);
  const [savingAllMeals, setSavingAllMeals] = useState(false);
  const loading = generatingPlan || loggingMeal !== null || savingAllMeals;
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
  const [isManualMacrosDialogOpen, setIsManualMacrosDialogOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState(2000);
  const [safetyStatus, setSafetyStatus] = useState<"green" | "yellow" | "red">("green");
  const [safetyMessage, setSafetyMessage] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mealToDelete, setMealToDelete] = useState<Meal | null>(null);

  // Enhanced authentication state management
  const { isSessionValid, checkSessionValidity, refreshSession, userId } = useUser();
  const [aiMacroGoals, setAiMacroGoals] = useState<{
    proteinGrams: number;
    carbsGrams: number;
    fatsGrams: number;
    recommendedCalories: number;
  } | null>(null);
  const [fetchingMacroGoals, setFetchingMacroGoals] = useState(false);
  const [isEditTargetsDialogOpen, setIsEditTargetsDialogOpen] = useState(false);
  const [editingTargets, setEditingTargets] = useState({
    calories: "",
    protein: "",
    carbs: "",
    fats: "",
  });
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // AI meal plan rate limiting
  const DAILY_LIMIT = 5;
  const DEV_PASSWORD = "ben10boy";
  const [mealPlanUsageCount, setMealPlanUsageCount] = useState(() => {
    const key = `meal_plan_usage_${format(new Date(), "yyyy-MM-dd")}`;
    return parseInt(localStorage.getItem(key) || "0", 10);
  });
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [showDevInput, setShowDevInput] = useState(false);
  const [devPasswordInput, setDevPasswordInput] = useState("");

  // Manual meal form
  const [manualMeal, setManualMeal] = useState({
    meal_name: "",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fats_g: "",
    meal_type: "breakfast",
    portion_size: "",
    recipe_notes: "",
    ingredients: [] as Ingredient[],
  });
  const [aiMealDescription, setAiMealDescription] = useState("");
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiIngredientDescription, setAiIngredientDescription] = useState("");
  const [aiAnalyzingIngredient, setAiAnalyzingIngredient] = useState(false);

  const [newIngredient, setNewIngredient] = useState({ name: "", grams: "" });
  const [lookingUpIngredient, setLookingUpIngredient] = useState(false);
  const [ingredientLookupError, setIngredientLookupError] = useState<string | null>(null);
  const [manualNutritionDialog, setManualNutritionDialog] = useState({
    open: false,
    ingredientName: "",
    grams: 0,
    calories_per_100g: "",
    protein_per_100g: "",
    carbs_per_100g: "",
    fats_per_100g: "",
  });

  useEffect(() => {
    loadProfile();
    loadMeals();
    loadPersistedMealPlans();
  }, [selectedDate]);

  const loadPersistedMealPlans = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser || mealPlanIdeas.length > 0) return;

      const persistedData = AIPersistence.load(currentUser.id, 'meal_plans');
      if (persistedData) {
        setMealPlanIdeas(persistedData.meals || []);
        if (persistedData.dailyCalorieTarget) setDailyCalorieTarget(persistedData.dailyCalorieTarget);
        if (persistedData.safetyStatus) setSafetyStatus(persistedData.safetyStatus);
        if (persistedData.safetyMessage) setSafetyMessage(persistedData.safetyMessage);
      }
    } catch (error) {
      console.error("Error loading persisted meal plans:", error);
    }
  };


  useEffect(() => {
    if (profile) {
      fetchMacroGoals();
    }
  }, [profile]);

  // Auto-open add meal dialog if URL param is present
  useEffect(() => {
    if (searchParams.get("openAddMeal") === "true") {
      setIsAiDialogOpen(true);
      // Remove the param from URL
      searchParams.delete("openAddMeal");
      setSearchParams(searchParams, { replace: true });
    }
    if (searchParams.get("openManualMeal") === "true") {
      setIsManualDialogOpen(true);
      // Remove the param from URL
      searchParams.delete("openManualMeal");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Real-time subscription to profiles table for automatic updates when Weight Tracker saves new recommendations
  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('profile-nutrition-updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${profile.id}`
      }, (payload) => {
        const newData = payload.new as any;
        // Update profile with new data including manual_nutrition_override flag
        setProfile((prev: any) => prev ? { ...prev, ...newData } : newData);
        if (newData.ai_recommended_calories) {
          setAiMacroGoals({
            proteinGrams: newData.ai_recommended_protein_g || 0,
            carbsGrams: newData.ai_recommended_carbs_g || 0,
            fatsGrams: newData.ai_recommended_fats_g || 0,
            recommendedCalories: newData.ai_recommended_calories || 0,
          });
          setDailyCalorieTarget(newData.ai_recommended_calories);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check cache first
    const cachedProfile = nutritionCache.getProfile(user.id);
    if (cachedProfile) {
      setProfile(cachedProfile);
      calculateCalorieTarget(cachedProfile);
      return;
    }

    // Fetch from database if not cached
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (data) {
      setProfile(data);
      calculateCalorieTarget(data);
      // Cache the profile data
      nutritionCache.setProfile(user.id, data);
    }
  };

  const calculateCalorieTarget = (profileData: any) => {
    // Use shared utility function for calorie calculation
    const target = calculateCalorieTargetUtil(profileData);
    setDailyCalorieTarget(target);

    // Calculate safety status and message (Nutrition page specific)
    const currentWeight = profileData?.current_weight_kg || 70;
    const goalWeight = profileData?.goal_weight_kg || 65;
    const daysToGoal = Math.ceil(
      (new Date(profileData?.target_date || new Date()).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysToGoal <= 0) {
      setSafetyStatus("green");
      setSafetyMessage("✓ Safe and sustainable weight loss pace");
      return;
    }

    const weeklyWeightLoss = ((currentWeight - goalWeight) / (daysToGoal / 7));
    const weeklyLossPercent = (weeklyWeightLoss / currentWeight) * 100;

    // Safety checks removed as per user request
    setSafetyStatus("green");
    setSafetyMessage("");
  };

  const getCurrentWeight = async (profileData: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return profileData?.current_weight_kg || 0;

    const { data: weightLogs } = await supabase
      .from("weight_logs")
      .select("weight_kg")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(1);

    if (weightLogs && weightLogs.length > 0) {
      return weightLogs[0].weight_kg;
    }
    return profileData?.current_weight_kg || 0;
  };

  const fetchMacroGoals = async () => {
    if (!profile) return;

    const fightWeekTarget = profile.fight_week_target_kg;
    if (!fightWeekTarget) {
      // No fight week target set, clear macro goals
      setAiMacroGoals(null);
      return;
    }

    setFetchingMacroGoals(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAiMacroGoals(null);
        setFetchingMacroGoals(false);
        return;
      }

      // Check cache first
      const cachedMacroGoals = nutritionCache.getMacroGoals(user.id);
      if (cachedMacroGoals) {
        setAiMacroGoals(cachedMacroGoals.macroGoals);
        if (cachedMacroGoals.dailyCalorieTarget) {
          setDailyCalorieTarget(cachedMacroGoals.dailyCalorieTarget);
        }
        if (cachedMacroGoals.profileUpdate && profile) {
          setProfile({ ...profile, manual_nutrition_override: cachedMacroGoals.profileUpdate.manual_nutrition_override });
        }
        setFetchingMacroGoals(false);
        return;
      }

      // Fetch recommendations/overrides from profiles table
      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("ai_recommended_calories, ai_recommended_protein_g, ai_recommended_carbs_g, ai_recommended_fats_g, manual_nutrition_override")
        .eq("id", user.id)
        .single();

      if (error) {
        // Silently fail - don't show error toast, just don't show goals
        setAiMacroGoals(null);
      } else if (profileData?.ai_recommended_calories) {
        // Use values whether they're manual override or AI recommendations
        const macroGoals = {
          proteinGrams: profileData.ai_recommended_protein_g || 0,
          carbsGrams: profileData.ai_recommended_carbs_g || 0,
          fatsGrams: profileData.ai_recommended_fats_g || 0,
          recommendedCalories: profileData.ai_recommended_calories || 0,
        };

        setAiMacroGoals(macroGoals);
        // Also update dailyCalorieTarget
        setDailyCalorieTarget(profileData.ai_recommended_calories);
        // Update profile to include manual_nutrition_override flag
        if (profile) {
          setProfile({ ...profile, manual_nutrition_override: profileData.manual_nutrition_override });
        }

        // Cache the macro goals data
        nutritionCache.setMacroGoals(user.id, {
          macroGoals,
          dailyCalorieTarget: profileData.ai_recommended_calories,
          profileUpdate: { manual_nutrition_override: profileData.manual_nutrition_override }
        });
      } else {
        // Fallback to calculated target if no recommendations or overrides
        setAiMacroGoals(null);
      }
    } catch (error) {
      // Silently fail
      setAiMacroGoals(null);
    } finally {
      setFetchingMacroGoals(false);
    }
  };

  const loadMeals = async (skipCache = false) => {
    if (!userId) return;

    // Check cache first (unless explicitly skipped after mutations)
    if (!skipCache) {
      const cachedMeals = nutritionCache.getMeals(userId, selectedDate);
      if (cachedMeals) {
        setMeals(cachedMeals);
        return;
      }
    }

    const { data, error } = await supabase
      .from("nutrition_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("date", selectedDate)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading meals:", error);
      return;
    }

    // Cast ingredients from Json to Ingredient[]
    const typedMeals = (data || []).map(meal => ({
      ...meal,
      ingredients: (meal.ingredients as unknown) as Ingredient[] | undefined,
    }));

    setMeals(typedMeals as Meal[]);
    // Cache the meals data
    nutritionCache.setMeals(userId, selectedDate, typedMeals as Meal[]);
  };

  const handleGenerateMealPlan = async () => {
    if (!aiPrompt.trim()) {
      toast({
        title: "Please enter a prompt",
        description: "Describe what kind of meals you'd like",
        variant: "destructive",
      });
      return;
    }

    // Rate limit check
    if (mealPlanUsageCount >= DAILY_LIMIT && !devUnlocked) {
      toast({
        title: "Daily limit reached",
        description: "You've used all 5 meal plan generations for today. Try again after 11:59 PM.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingPlan(true);
    try {
      // Simple authentication check
      if (!isSessionValid) {
        const sessionValid = await checkSessionValidity();
        if (!sessionValid) {
          toast({
            title: "Authentication Required",
            description: "Your session has expired. Please refresh the page and log in again.",
            variant: "destructive",
          });
          setGeneratingPlan(false);
          return;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Authentication required. Please log in again.");
      }

      const userData = profile ? {
        currentWeight: profile.current_weight_kg,
        goalWeight: profile.goal_weight_kg,
        tdee: profile.tdee,
        daysToWeighIn: Math.ceil(
          (new Date(profile.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        ),
      } : null;

      const response = await supabase.functions.invoke("meal-planner", {
        body: {
          prompt: aiPrompt,
          userData,
          action: "generate"
        },
      });

      if (response.error) {
        throw response.error;
      }

      const { mealPlan, dailyCalorieTarget: target, safetyStatus: status, safetyMessage: message } = response.data;

      // Store as meal plan ideas instead of logging them
      const ideasToStore: Meal[] = [];

      console.log("Meal plan response structure:", { mealPlan, target, status, message });

      // Handle the actual response structure: mealPlan contains meals array
      if (mealPlan && mealPlan.meals && Array.isArray(mealPlan.meals)) {
        console.log("Processing meals array:", mealPlan.meals.length, "meals found");

        mealPlan.meals.forEach((meal: any, idx: number) => {
          const mealType = meal.type || "meal";
          const timestamp = Date.now() + idx; // Ensure unique IDs
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
        // Fallback: check if it's the old structure with individual meal objects
        console.log("Checking for fallback structure...");

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

        // Handle snacks array if present
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

      console.log("Final meal ideas to store:", ideasToStore.length);

      if (ideasToStore.length === 0) {
        console.warn("No meals were parsed from the response");
        toast({
          title: "⚠️ No meals found",
          description: "The AI response didn't contain parseable meal data. Please try a different prompt.",
          variant: "destructive",
        });
        return;
      }

      setMealPlanIdeas(prev => [...prev, ...ideasToStore]);
      setDailyCalorieTarget(target || dailyCalorieTarget);
      setSafetyStatus(status || safetyStatus);
      setSafetyMessage(message || safetyMessage);

      // Increment rate limit counter
      const newCount = mealPlanUsageCount + 1;
      setMealPlanUsageCount(newCount);
      const usageKey = `meal_plan_usage_${format(new Date(), "yyyy-MM-dd")}`;
      localStorage.setItem(usageKey, newCount.toString());

      // Save accumulated ideas to localStorage for persistence
      const accumulatedIdeas = [...mealPlanIdeas, ...ideasToStore];
      if (user) {
        AIPersistence.save(user.id, 'meal_plans', {
          meals: accumulatedIdeas,
          dailyCalorieTarget: target || dailyCalorieTarget,
          safetyStatus: status || safetyStatus,
          safetyMessage: message || safetyMessage,
          prompt: aiPrompt
        }, 24); // 24 hours expiration
      }

      toast({
        title: "Meal plan generated!",
        description: `${ideasToStore.length} new ideas added (${accumulatedIdeas.length} total)`,
      });

      setIsAiDialogOpen(false);
      setAiPrompt("");
    } catch (error: any) {
      console.error("Error generating meal plan:", error);

      let errorMsg = "Failed to generate meal plan";
      let shouldRetry = false;

      // Handle specific error types with user-friendly messages
      if (error?.message?.includes("authorization") || error?.code === 401) {
        try {
          const refreshSuccess = await refreshSession();
          if (refreshSuccess) {
            errorMsg = "Session refreshed. Please try again.";
            shouldRetry = true;
          } else {
            errorMsg = "Session expired. Please refresh the page and log in again.";
          }
        } catch {
          errorMsg = "Authentication failed. Please refresh the page and log in again.";
        }
      } else if (error?.message) {
        if (error.message.includes('timeout') || error.message.includes('408')) {
          errorMsg = "The AI service is taking longer than usual. Please try again in a moment.";
          shouldRetry = true;
        } else if (error.message.includes('429') || error.message.includes('quota')) {
          errorMsg = "AI service is temporarily busy. Please try again in a few minutes.";
          shouldRetry = true;
        } else if (error.message.includes('404')) {
          errorMsg = "AI service temporarily unavailable. Please try again later.";
          shouldRetry = true;
        } else {
          errorMsg = error.message;
        }
      }

      toast({
        title: "Error generating meal plan",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleLogMealIdea = async (mealIdea: Meal) => {
    setLoggingMeal(mealIdea.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Recalculate calories from macros to ensure consistency
      const consistentCalories = (mealIdea.protein_g || 0) * 4 + (mealIdea.carbs_g || 0) * 4 + (mealIdea.fats_g || 0) * 9;

      const { error } = await supabase.from("nutrition_logs").insert({
        user_id: user.id,
        date: selectedDate,
        meal_name: mealIdea.meal_name,
        calories: consistentCalories || mealIdea.calories,
        protein_g: mealIdea.protein_g,
        carbs_g: mealIdea.carbs_g,
        fats_g: mealIdea.fats_g,
        meal_type: mealIdea.meal_type,
        portion_size: mealIdea.portion_size,
        recipe_notes: mealIdea.recipe_notes,
        ingredients: mealIdea.ingredients,
        is_ai_generated: true,
      } as any);

      if (error) throw error;

      toast({
        title: "Meal logged!",
        description: `${mealIdea.meal_name} added to your day`,
      });

      await loadMeals(true);
    } catch (error) {
      console.error("Error logging meal:", error);
      toast({
        title: "Error",
        description: "Failed to log meal",
        variant: "destructive",
      });
    } finally {
      setLoggingMeal(null);
    }
  };

  const saveMealIdeasToDatabase = async (mealIdeas: Meal[]) => {
    if (mealIdeas.length === 0) return;

    setSavingAllMeals(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Prepare meals for database insertion (recalculate calories from macros for consistency)
      const mealsToInsert = mealIdeas.map(meal => {
        const recalcCal = (meal.protein_g || 0) * 4 + (meal.carbs_g || 0) * 4 + (meal.fats_g || 0) * 9;
        return {
          user_id: user.id,
          date: selectedDate,
          meal_name: meal.meal_name,
          calories: recalcCal || meal.calories,
          protein_g: meal.protein_g,
          carbs_g: meal.carbs_g,
          fats_g: meal.fats_g,
          meal_type: meal.meal_type,
          portion_size: meal.portion_size,
          recipe_notes: meal.recipe_notes,
          ingredients: meal.ingredients as any, // Cast to Json type for Supabase
          is_ai_generated: true,
        };
      });

      const { error } = await supabase.from("nutrition_logs").insert(mealsToInsert);

      if (error) throw error;

      toast({
        title: "All meals saved!",
        description: `${mealIdeas.length} meals added to your day`,
      });

      // Clear meal ideas after saving all + clear localStorage
      setMealPlanIdeas([]);
      AIPersistence.remove(user.id, 'meal_plans');

      // Reload meals to show the new entries
      await loadMeals(true);
    } catch (error: any) {
      console.error("Error saving meal ideas:", error);
      toast({
        title: "Error saving meals",
        description: error.message || "Failed to save meals",
        variant: "destructive",
      });
    } finally {
      setSavingAllMeals(false);
    }
  };

  const clearMealIdeas = async () => {
    setMealPlanIdeas([]);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) AIPersistence.remove(user.id, 'meal_plans');
    } catch (e) {
      console.warn("Failed to clear persisted meal plans:", e);
    }
  };

  // Function to automatically calculate macros based on calories
  const calculateMacrosFromCalories = (calories: number) => {
    // Fighter macro distribution: 40% protein, 30% carbs, 30% fats
    const proteinGrams = Math.round(calories * 0.40 / 4);
    const carbsGrams = Math.round(calories * 0.30 / 4);
    // Fats absorb rounding error so macros always sum to calorie target
    const fatsGrams = Math.round((calories - proteinGrams * 4 - carbsGrams * 4) / 9);

    return {
      protein_g: proteinGrams.toString(),
      carbs_g: carbsGrams.toString(),
      fats_g: fatsGrams.toString()
    };
  };

  // Auto-adjust other macros when one is manually changed, to maintain calorie match
  const adjustMacrosToMatchCalories = (
    changedMacro: 'protein' | 'carbs' | 'fats',
    newValue: number,
    currentMacros: { protein: number; carbs: number; fats: number },
    calorieGoal: number
  ) => {
    const MACRO_FLOOR = 10; // minimum grams per macro
    const calPerGram = { protein: 4, carbs: 4, fats: 9 };

    const changedCalories = newValue * calPerGram[changedMacro];
    const remainingCalories = calorieGoal - changedCalories;

    // Determine the other two macros
    const others = (['protein', 'carbs', 'fats'] as const).filter(m => m !== changedMacro);
    const [a, b] = others;

    const currentA = currentMacros[a];
    const currentB = currentMacros[b];
    const currentOtherTotal = currentA + currentB;

    let newA: number, newB: number;

    if (currentOtherTotal > 0) {
      // Distribute proportionally based on current ratio
      const ratioA = currentA / currentOtherTotal;
      newA = Math.round((remainingCalories * ratioA) / calPerGram[a]);
      newB = Math.round((remainingCalories - newA * calPerGram[a]) / calPerGram[b]);
    } else {
      // Equal split if both are zero
      newA = Math.round((remainingCalories / 2) / calPerGram[a]);
      newB = Math.round((remainingCalories - newA * calPerGram[a]) / calPerGram[b]);
    }

    // Enforce minimum floor
    if (newA < MACRO_FLOOR) {
      newA = MACRO_FLOOR;
      newB = Math.round((remainingCalories - newA * calPerGram[a]) / calPerGram[b]);
    }
    if (newB < MACRO_FLOOR) {
      newB = MACRO_FLOOR;
      newA = Math.round((remainingCalories - newB * calPerGram[b]) / calPerGram[a]);
    }
    // Final clamp
    newA = Math.max(newA, MACRO_FLOOR);
    newB = Math.max(newB, MACRO_FLOOR);

    return {
      [changedMacro]: newValue,
      [a]: newA,
      [b]: newB,
    } as { protein: number; carbs: number; fats: number };
  };

  // Debounced macro calculation to prevent excessive recalculations during typing
  const debouncedMacroCalculation = useDebouncedCallback((calories: string, updateFunction: (meal: any) => void) => {
    const calorieValue = parseInt(calories) || 0;
    const macros = calculateMacrosFromCalories(calorieValue);

    updateFunction((prev: any) => ({
      ...prev,
      ...macros
    }));
  }, 300); // 300ms debounce delay

  const handleCalorieChange = (calories: string, updateFunction: (meal: any) => void) => {
    // Update calories immediately for responsive UI
    updateFunction((prev: any) => ({
      ...prev,
      calories,
    }));

    // Debounce the macro calculation
    debouncedMacroCalculation(calories, updateFunction);
  };

  const handleAddManualMeal = async () => {
    // Validate input
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
      toast({
        title: "Validation Error",
        description: validationResult.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create optimistic meal data
      const optimisticMeal = {
        id: `temp-${Date.now()}`, // Temporary ID for optimistic update
        user_id: user.id,
        date: selectedDate,
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
        created_at: new Date().toISOString(),
      };

      // Add meal to UI immediately
      setMeals(prevMeals => [...prevMeals, optimisticMeal]);

      // Close dialog and reset form immediately
      setIsManualDialogOpen(false);
      setManualMeal({
        meal_name: "",
        calories: "",
        protein_g: "",
        carbs_g: "",
        fats_g: "",
        meal_type: "breakfast",
        portion_size: "",
        recipe_notes: "",
        ingredients: [],
      });
      setAiMealDescription("");
      setNewIngredient({ name: "", grams: "" });

      // Show immediate success feedback
      toast({ title: "Meal added successfully" });

      // Create the database insert operation
      const insertOperation = async () => {
        const { error } = await supabase.from("nutrition_logs").insert({
          user_id: user.id,
          date: selectedDate,
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
        } as any);

        if (error) throw error;
      };

      // Execute optimistic update
      const update = createMealLogUpdate(
        optimisticMeal.id,
        optimisticMeal,
        insertOperation
      );

      update.onSuccess = () => {
        // Reload meals to get the real data with proper ID (skip cache)
        loadMeals(true);
      };

      update.onError = (error: any) => {
        // Remove the optimistic meal on error
        setMeals(prevMeals => prevMeals.filter(meal => meal.id !== optimisticMeal.id));
        console.error("Error adding meal:", error);
        toast({
          title: "Error",
          description: "Failed to add meal. Please try again.",
          variant: "destructive",
        });
      };

      // Execute the background update
      await optimisticUpdateManager.executeOptimisticUpdate(update);

    } catch (error) {
      console.error("Error in optimistic meal update setup:", error);
      toast({
        title: "Error",
        description: "Failed to add meal",
        variant: "destructive",
      });
    }
  };

  const handleAiAnalyzeMeal = async () => {
    if (!aiMealDescription.trim()) {
      toast({
        title: "Missing description",
        description: "Please describe your meal",
        variant: "destructive",
      });
      return;
    }

    setAiAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-meal", {
        body: { mealDescription: aiMealDescription },
      });

      if (error) throw error;

      const { nutritionData } = data;

      setManualMeal({
        meal_name: nutritionData.meal_name,
        calories: nutritionData.calories.toString(),
        protein_g: nutritionData.protein_g.toString(),
        carbs_g: nutritionData.carbs_g.toString(),
        fats_g: nutritionData.fats_g.toString(),
        meal_type: manualMeal.meal_type,
        portion_size: nutritionData.portion_size,
        recipe_notes: manualMeal.recipe_notes,
        ingredients: nutritionData.ingredients || [],
      });

      toast({
        title: "Analysis complete!",
        description: "Nutritional information has been filled in",
      });
    } catch (error: any) {
      console.error("Error analyzing meal:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze meal",
        variant: "destructive",
      });
    } finally {
      setAiAnalyzing(false);
    }
  };

  // Helper function to extract ingredient name from user input
  const extractIngredientName = (userInput: string): string => {
    let cleaned = userInput.trim();

    // Remove weight/quantity patterns (e.g., "250g", "1 cup", "2 tbsp")
    cleaned = cleaned.replace(/(\d+(?:\.\d+)?)\s*(g|kg|oz|lb|cup|cups|tbsp|tsp|tablespoon|teaspoon|ml|l|gram|grams|kilogram|kilograms|ounce|ounces|pound|pounds)/gi, "");

    // Remove quantity words at the start
    cleaned = cleaned.replace(/^(one|two|three|four|five|six|seven|eight|nine|ten|\d+|a|an)\s+/i, "");

    // Remove common prefixes
    cleaned = cleaned.replace(/^(about|approximately|around|roughly)\s+/i, "");

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    // Capitalize first letter of each word for better presentation
    cleaned = cleaned.split(" ").map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(" ");

    return cleaned || userInput; // Fallback to original if cleaning removes everything
  };

  const handleAiAnalyzeIngredient = async () => {
    if (!aiIngredientDescription.trim()) {
      toast({
        title: "Input Required",
        description: "Please describe the ingredient",
        variant: "destructive",
      });
      return;
    }

    setAiAnalyzingIngredient(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-meal", {
        body: { mealDescription: aiIngredientDescription },
      });

      if (error) throw error;

      const { nutritionData } = data;

      // Extract ingredient information
      let ingredientName = "";
      let ingredientGrams = 0;
      let ingredientSource = "";
      let caloriesPer100g = 0;
      let proteinPer100g = 0;
      let carbsPer100g = 0;
      let fatsPer100g = 0;

      // Try to get ingredient from ingredients array
      if (nutritionData.ingredients && nutritionData.ingredients.length > 0) {
        const ingredient = nutritionData.ingredients[0];
        // Use extracted name from user input for better matching
        ingredientName = extractIngredientName(aiIngredientDescription);
        // If extracted name is too generic, use AI's name
        if (ingredientName.length < 3 || ingredientName.toLowerCase() === aiIngredientDescription.toLowerCase().trim()) {
          ingredientName = ingredient.name || nutritionData.meal_name;
        }
        ingredientGrams = ingredient.grams || 0;
        ingredientSource = ingredient.source || nutritionData.data_source || "AI Analysis";
      } else {
        // Fallback: parse from meal name and portion size
        ingredientName = extractIngredientName(aiIngredientDescription);
        // If extracted name is too generic, use AI's meal name
        if (ingredientName.length < 3) {
          ingredientName = nutritionData.meal_name;
        }
        ingredientSource = nutritionData.data_source || "AI Analysis";

        // Try to extract grams from portion_size (e.g., "250g", "1 cup (200g)")
        const portionSize = nutritionData.portion_size || "";
        const gramsMatch = portionSize.match(/(\d+(?:\.\d+)?)\s*g/i);
        if (gramsMatch) {
          ingredientGrams = parseFloat(gramsMatch[1]);
        } else {
          // If no grams found, try to estimate from common measurements
          // This is a fallback - ideally the AI should provide grams
          toast({
            title: "Weight Required",
            description: "Could not determine ingredient weight. Please specify weight (e.g., '250g chicken breast')",
            variant: "destructive",
          });
          return;
        }
      }

      if (ingredientGrams <= 0) {
        toast({
          title: "Invalid Weight",
          description: "Could not determine ingredient weight. Please specify weight (e.g., '250g chicken breast')",
          variant: "destructive",
        });
        return;
      }

      // Calculate nutrition per 100g from meal totals
      const mealCalories = nutritionData.calories || 0;
      const mealProtein = nutritionData.protein_g || 0;
      const mealCarbs = nutritionData.carbs_g || 0;
      const mealFats = nutritionData.fats_g || 0;

      caloriesPer100g = (mealCalories / ingredientGrams) * 100;
      proteinPer100g = (mealProtein / ingredientGrams) * 100;
      carbsPer100g = (mealCarbs / ingredientGrams) * 100;
      fatsPer100g = (mealFats / ingredientGrams) * 100;

      // Add ingredient to the list
      const newIngredients = [
        ...manualMeal.ingredients,
        {
          name: ingredientName,
          grams: ingredientGrams,
          calories_per_100g: Math.round(caloriesPer100g),
          protein_per_100g: Math.round(proteinPer100g * 10) / 10,
          carbs_per_100g: Math.round(carbsPer100g * 10) / 10,
          fats_per_100g: Math.round(fatsPer100g * 10) / 10,
          source: ingredientSource,
        }
      ];

      // Calculate new meal totals
      const totalCalories = newIngredients.reduce((sum, ing) =>
        sum + (ing.calories_per_100g || 0) * ing.grams / 100, 0
      );
      const totalProtein = newIngredients.reduce((sum, ing) =>
        sum + (ing.protein_per_100g || 0) * ing.grams / 100, 0
      );
      const totalCarbs = newIngredients.reduce((sum, ing) =>
        sum + (ing.carbs_per_100g || 0) * ing.grams / 100, 0
      );
      const totalFats = newIngredients.reduce((sum, ing) =>
        sum + (ing.fats_per_100g || 0) * ing.grams / 100, 0
      );

      // Update meal with new ingredient and calculated totals
      setManualMeal({
        ...manualMeal,
        ingredients: newIngredients,
        calories: Math.round(totalCalories).toString(),
        protein_g: Math.round(totalProtein * 10) / 10 !== 0 ? (Math.round(totalProtein * 10) / 10).toString() : "",
        carbs_g: Math.round(totalCarbs * 10) / 10 !== 0 ? (Math.round(totalCarbs * 10) / 10).toString() : "",
        fats_g: Math.round(totalFats * 10) / 10 !== 0 ? (Math.round(totalFats * 10) / 10).toString() : "",
      });

      // Clear input
      setAiIngredientDescription("");

      toast({
        title: "Ingredient Added",
        description: `${ingredientName} (${ingredientGrams}g) added. Meal totals updated.`,
      });
    } catch (error: any) {
      console.error("Error analyzing ingredient:", error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze ingredient. Please try again or add manually.",
        variant: "destructive",
      });
    } finally {
      setAiAnalyzingIngredient(false);
    }
  };

  const handleVoiceInput = async (transcribedText: string) => {
    setAiMealDescription(transcribedText);

    // Automatically analyze the meal
    setAiAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-meal", {
        body: { mealDescription: transcribedText },
      });

      if (error) throw error;

      const { nutritionData } = data;

      // Auto-add the meal directly
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error: insertError } = await supabase.from("nutrition_logs").insert({
        user_id: user.id,
        date: selectedDate,
        meal_name: nutritionData.meal_name,
        calories: nutritionData.calories,
        protein_g: nutritionData.protein_g,
        carbs_g: nutritionData.carbs_g,
        fats_g: nutritionData.fats_g,
        meal_type: "snack", // Default to snack for voice inputs
        portion_size: nutritionData.portion_size,
        recipe_notes: null,
        ingredients: nutritionData.ingredients || null,
        is_ai_generated: true,
      } as any);

      if (insertError) throw insertError;

      toast({
        title: "Meal added!",
        description: `${nutritionData.meal_name} (${nutritionData.calories} cal) logged successfully`,
      });

      await loadMeals(true);
    } catch (error: any) {
      console.error("Error processing voice input:", error);
      toast({
        title: "Failed to add meal",
        description: error.message || "Failed to process voice input",
        variant: "destructive",
      });
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleBarcodeScanned = async (foodData: {
    meal_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
  }) => {
    setManualMeal({
      meal_name: foodData.meal_name,
      calories: foodData.calories.toString(),
      protein_g: foodData.protein_g.toString(),
      carbs_g: foodData.carbs_g.toString(),
      fats_g: foodData.fats_g.toString(),
      meal_type: "snack",
      portion_size: "100g",
      recipe_notes: "",
      ingredients: [],
    });
    setIsManualDialogOpen(true);
  };

  // Lookup ingredient nutrition data using AI
  const lookupIngredientNutrition = async (ingredientName: string): Promise<{
    calories_per_100g: number;
    protein_per_100g: number;
    carbs_per_100g: number;
    fats_per_100g: number;
    source?: string;
  } | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("lookup-ingredient", {
        body: { ingredientName },
      });

      if (error) {
        console.error("Ingredient lookup error:", error);
        // If it's a 404, the ingredient wasn't found - return null to trigger manual entry
        if (error.message?.includes("404") || error.message?.includes("not found")) {
          return null;
        }
        // For other errors, also return null to trigger manual entry
        return null;
      }

      if (data?.error) {
        // Edge function returned an error (e.g., not found)
        console.log("Ingredient not found:", data.error);
        return null;
      }

      if (data?.nutritionData) {
        return data.nutritionData;
      }

      return null;
    } catch (error) {
      console.error("Error looking up ingredient:", error);
      return null;
    }
  };

  // Auto-calculate meal totals from ingredients
  const calculateMealTotalsFromIngredients = () => {
    if (manualMeal.ingredients.length === 0) {
      // If no ingredients, clear calculated values (but keep manual entries)
      return;
    }

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFats = 0;
    let hasAnyNutritionData = false;

    manualMeal.ingredients.forEach((ingredient) => {
      if (ingredient.calories_per_100g !== undefined) {
        totalCalories += (ingredient.calories_per_100g * ingredient.grams) / 100;
        hasAnyNutritionData = true;
      }
      if (ingredient.protein_per_100g !== undefined) {
        totalProtein += (ingredient.protein_per_100g * ingredient.grams) / 100;
      }
      if (ingredient.carbs_per_100g !== undefined) {
        totalCarbs += (ingredient.carbs_per_100g * ingredient.grams) / 100;
      }
      if (ingredient.fats_per_100g !== undefined) {
        totalFats += (ingredient.fats_per_100g * ingredient.grams) / 100;
      }
    });

    if (!hasAnyNutritionData) return;

    // Always update with calculated totals from ingredients
    // User can manually override by typing in the fields
    setManualMeal((prev) => ({
      ...prev,
      calories: Math.round(totalCalories).toString(),
      protein_g: Math.round(totalProtein * 10) / 10 !== 0 ? (Math.round(totalProtein * 10) / 10).toString() : "",
      carbs_g: Math.round(totalCarbs * 10) / 10 !== 0 ? (Math.round(totalCarbs * 10) / 10).toString() : "",
      fats_g: Math.round(totalFats * 10) / 10 !== 0 ? (Math.round(totalFats * 10) / 10).toString() : "",
    }));
  };

  // Auto-calculate when ingredients change
  useEffect(() => {
    if (manualMeal.ingredients.length > 0) {
      // Only calculate if we have ingredients with nutrition data
      const hasNutritionData = manualMeal.ingredients.some(ing => ing.calories_per_100g !== undefined);
      if (hasNutritionData) {
        calculateMealTotalsFromIngredients();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMeal.ingredients]);

  // Handle manual nutrition entry
  const handleManualNutritionSubmit = () => {
    if (!manualNutritionDialog.calories_per_100g) {
      toast({
        title: "Calories Required",
        description: "Please enter calories per 100g",
        variant: "destructive",
      });
      return;
    }

    const ingredientName = manualNutritionDialog.ingredientName;
    const nutritionData = {
      calories_per_100g: parseFloat(manualNutritionDialog.calories_per_100g),
      protein_per_100g: manualNutritionDialog.protein_per_100g ? parseFloat(manualNutritionDialog.protein_per_100g) : 0,
      carbs_per_100g: manualNutritionDialog.carbs_per_100g ? parseFloat(manualNutritionDialog.carbs_per_100g) : 0,
      fats_per_100g: manualNutritionDialog.fats_per_100g ? parseFloat(manualNutritionDialog.fats_per_100g) : 0,
    };

    // Add ingredient with manual nutrition data
    const newIngredients = [
      ...manualMeal.ingredients,
      {
        name: ingredientName,
        grams: manualNutritionDialog.grams,
        ...nutritionData,
      }
    ];

    // Calculate totals immediately
    const totalCalories = newIngredients.reduce((sum, ing) =>
      sum + (ing.calories_per_100g || 0) * ing.grams / 100, 0
    );
    const totalProtein = newIngredients.reduce((sum, ing) =>
      sum + (ing.protein_per_100g || 0) * ing.grams / 100, 0
    );
    const totalCarbs = newIngredients.reduce((sum, ing) =>
      sum + (ing.carbs_per_100g || 0) * ing.grams / 100, 0
    );
    const totalFats = newIngredients.reduce((sum, ing) =>
      sum + (ing.fats_per_100g || 0) * ing.grams / 100, 0
    );

    // Update meal with ingredients and calculated totals
    setManualMeal({
      ...manualMeal,
      ingredients: newIngredients,
      calories: Math.round(totalCalories).toString(),
      protein_g: Math.round(totalProtein * 10) / 10 !== 0 ? (Math.round(totalProtein * 10) / 10).toString() : "",
      carbs_g: Math.round(totalCarbs * 10) / 10 !== 0 ? (Math.round(totalCarbs * 10) / 10).toString() : "",
      fats_g: Math.round(totalFats * 10) / 10 !== 0 ? (Math.round(totalFats * 10) / 10).toString() : "",
    });

    // Reset dialog
    setManualNutritionDialog({
      open: false,
      ingredientName: "",
      grams: 0,
      calories_per_100g: "",
      protein_per_100g: "",
      carbs_per_100g: "",
      fats_per_100g: "",
    });

    setIngredientLookupError(null);

    toast({
      title: "Ingredient Added",
      description: `${ingredientName} added with manual nutrition data`,
    });
  };

  const initiateDeleteMeal = (meal: Meal) => {
    setMealToDelete(meal);
    setDeleteDialogOpen(true);
  };

  const handleDeleteMeal = async () => {
    if (!mealToDelete) return;

    try {
      const { error } = await supabase
        .from("nutrition_logs")
        .delete()
        .eq("id", mealToDelete.id);

      if (error) throw error;

      toast({ title: "Meal deleted" });
      await loadMeals(true);
      setDeleteDialogOpen(false);
      setMealToDelete(null);
    } catch (error) {
      console.error("Error deleting meal:", error);
      toast({
        title: "Error",
        description: "Failed to delete meal",
        variant: "destructive",
      });
    }
  };

  const totalCalories = meals.reduce((sum, meal) => sum + meal.calories, 0);
  const totalProtein = meals.reduce((sum, meal) => sum + (meal.protein_g || 0), 0);
  const totalCarbs = meals.reduce((sum, meal) => sum + (meal.carbs_g || 0), 0);
  const totalFats = meals.reduce((sum, meal) => sum + (meal.fats_g || 0), 0);

  return (
    <div className="space-y-6 p-4 sm:p-5 md:p-6 max-w-7xl mx-auto overflow-x-hidden">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Nutrition</h1>
        <div className="flex gap-2">
            <BarcodeScanner onFoodScanned={handleBarcodeScanned} disabled={generatingPlan || savingAllMeals} className="flex-1 h-10" />
            <VoiceInput onTranscription={handleVoiceInput} disabled={generatingPlan || savingAllMeals || aiAnalyzing} className="flex-1 h-10" />
            <Dialog open={isManualDialogOpen} onOpenChange={(open) => {
              setIsManualDialogOpen(open);
              if (!open) {
                setIngredientLookupError(null);
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex-1 h-10" title="Add Meal">
                  <Plus className="h-4 w-4" />
                  <span className="sr-only">Add Meal</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto w-[95vw] sm:w-full">
                <DialogHeader>
                  <DialogTitle>Add Meal</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-1">

                  {/* AI Quick Fill — full meal */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Describe your meal for AI fill…"
                      value={aiMealDescription}
                      onChange={(e) => setAiMealDescription(e.target.value)}
                      disabled={aiAnalyzing}
                      className="flex-1 text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAiAnalyzeMeal}
                      disabled={aiAnalyzing || !aiMealDescription.trim()}
                      className="shrink-0"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      {aiAnalyzing ? "Analyzing…" : "Fill"}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 border-t border-border/40" />
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">or enter manually</span>
                    <div className="flex-1 border-t border-border/40" />
                  </div>

                  {/* Name + Type */}
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Meal name *"
                      value={manualMeal.meal_name}
                      onChange={(e) => setManualMeal({ ...manualMeal, meal_name: e.target.value })}
                      className="text-sm"
                    />
                    <Select
                      value={manualMeal.meal_type}
                      onValueChange={(v) => setManualMeal({ ...manualMeal, meal_type: v })}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="breakfast">Breakfast</SelectItem>
                        <SelectItem value="lunch">Lunch</SelectItem>
                        <SelectItem value="dinner">Dinner</SelectItem>
                        <SelectItem value="snack">Snack</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Calories */}
                  <div>
                    <Input
                      type="number"
                      placeholder="Calories *"
                      value={manualMeal.calories}
                      onChange={(e) => handleCalorieChange(e.target.value, setManualMeal)}
                      className="text-sm"
                    />
                    {manualMeal.ingredients.some(ing => ing.calories_per_100g !== undefined) && (
                      <p className="text-[10px] text-muted-foreground mt-1">Auto-calculated from ingredients</p>
                    )}
                  </div>

                  {/* P / C / F */}
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Protein g"
                      value={manualMeal.protein_g}
                      onChange={(e) => setManualMeal({ ...manualMeal, protein_g: e.target.value })}
                      className="text-sm"
                    />
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Carbs g"
                      value={manualMeal.carbs_g}
                      onChange={(e) => setManualMeal({ ...manualMeal, carbs_g: e.target.value })}
                      className="text-sm"
                    />
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Fats g"
                      value={manualMeal.fats_g}
                      onChange={(e) => setManualMeal({ ...manualMeal, fats_g: e.target.value })}
                      className="text-sm"
                    />
                  </div>

                  {/* Ingredients */}
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pt-1">
                    Ingredients (optional)
                  </p>

                  {/* AI ingredient fill */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. 250g chicken breast"
                      value={aiIngredientDescription}
                      onChange={(e) => setAiIngredientDescription(e.target.value)}
                      disabled={aiAnalyzingIngredient}
                      className="flex-1 text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAiAnalyzeIngredient}
                      disabled={aiAnalyzingIngredient || !aiIngredientDescription.trim()}
                      className="shrink-0"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      {aiAnalyzingIngredient ? "…" : "AI Add"}
                    </Button>
                  </div>

                  {/* Manual ingredient add */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ingredient name"
                      value={newIngredient.name}
                      onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
                      className="flex-1 text-sm"
                    />
                    <Input
                      type="number"
                      placeholder="g"
                      value={newIngredient.grams}
                      onChange={(e) => setNewIngredient({ ...newIngredient, grams: e.target.value })}
                      className="w-16 text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (!newIngredient.name.trim() || !newIngredient.grams) {
                          toast({ title: "Missing Information", description: "Please enter ingredient name and grams", variant: "destructive" });
                          return;
                        }
                        const ingredientName = newIngredient.name.trim();
                        const grams = parseFloat(newIngredient.grams);
                        if (isNaN(grams) || grams <= 0) {
                          toast({ title: "Invalid Amount", description: "Please enter a valid number of grams", variant: "destructive" });
                          return;
                        }
                        setLookingUpIngredient(true);
                        setIngredientLookupError(null);
                        try {
                          const nutritionData = await lookupIngredientNutrition(ingredientName);
                          if (nutritionData) {
                            const newIngredients = [
                              ...manualMeal.ingredients,
                              {
                                name: ingredientName,
                                grams,
                                calories_per_100g: nutritionData.calories_per_100g,
                                protein_per_100g: nutritionData.protein_per_100g,
                                carbs_per_100g: nutritionData.carbs_per_100g,
                                fats_per_100g: nutritionData.fats_per_100g,
                                source: nutritionData.source,
                              }
                            ];
                            const tc = newIngredients.reduce((s, i) => s + (i.calories_per_100g || 0) * i.grams / 100, 0);
                            const tp = newIngredients.reduce((s, i) => s + (i.protein_per_100g || 0) * i.grams / 100, 0);
                            const tcarb = newIngredients.reduce((s, i) => s + (i.carbs_per_100g || 0) * i.grams / 100, 0);
                            const tf = newIngredients.reduce((s, i) => s + (i.fats_per_100g || 0) * i.grams / 100, 0);
                            setManualMeal({
                              ...manualMeal,
                              ingredients: newIngredients,
                              calories: Math.round(tc).toString(),
                              protein_g: tp > 0 ? (Math.round(tp * 10) / 10).toString() : "",
                              carbs_g: tcarb > 0 ? (Math.round(tcarb * 10) / 10).toString() : "",
                              fats_g: tf > 0 ? (Math.round(tf * 10) / 10).toString() : "",
                            });
                            setNewIngredient({ name: "", grams: "" });
                            toast({ title: "Ingredient added", description: `Found nutrition data for ${ingredientName}` });
                          } else {
                            setManualNutritionDialog({ open: true, ingredientName, grams, calories_per_100g: "", protein_per_100g: "", carbs_per_100g: "", fats_per_100g: "" });
                          }
                        } catch {
                          setManualNutritionDialog({ open: true, ingredientName, grams, calories_per_100g: "", protein_per_100g: "", carbs_per_100g: "", fats_per_100g: "" });
                        } finally {
                          setLookingUpIngredient(false);
                        }
                      }}
                      disabled={lookingUpIngredient || !newIngredient.name.trim() || !newIngredient.grams}
                      className="shrink-0"
                    >
                      {lookingUpIngredient
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Plus className="h-3.5 w-3.5" />}
                    </Button>
                  </div>

                  {ingredientLookupError && (
                    <p className="text-xs text-destructive">{ingredientLookupError}</p>
                  )}

                  {/* Ingredients list */}
                  {manualMeal.ingredients.length > 0 && (
                    <div className="rounded-md border border-border/40 divide-y divide-border/30 overflow-hidden">
                      {manualMeal.ingredients.map((ingredient, idx) => {
                        const cal = ingredient.calories_per_100g !== undefined
                          ? Math.round(ingredient.calories_per_100g * ingredient.grams / 100)
                          : null;
                        return (
                          <div key={idx} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <span className="flex-1 truncate">{ingredient.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{ingredient.grams}g</span>
                            {cal !== null && (
                              <span className="text-xs text-muted-foreground shrink-0">{cal} kcal</span>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                const updated = [...manualMeal.ingredients];
                                updated.splice(idx, 1);
                                setManualMeal({ ...manualMeal, ingredients: updated });
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                      {manualMeal.ingredients.some(ing => ing.calories_per_100g !== undefined) && (
                        <div className="flex justify-between px-3 py-1.5 text-xs text-muted-foreground bg-muted/30">
                          <span>Total</span>
                          <span>{manualMeal.ingredients.reduce((s, i) => s + i.grams, 0)}g</span>
                        </div>
                      )}
                    </div>
                  )}

                  <Button onClick={handleAddManualMeal} disabled={savingAllMeals} className="w-full mt-1">
                    {savingAllMeals ? "Adding…" : "Add Meal"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex-1 h-10" title="AI Meal Plan">
                <Sparkles className="h-4 w-4" />
                <span className="sr-only">AI Meal Plan</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl w-[95vw] sm:w-full">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle>Generate Meal Plan Ideas for {format(new Date(selectedDate), "MMM d, yyyy")}</DialogTitle>
                  <button onClick={() => setShowDevInput(!showDevInput)} className="opacity-30 hover:opacity-60 transition-opacity p-1">
                    <Lock className="h-3 w-3" />
                  </button>
                </div>
                <DialogDescription>
                  Describe what kind of meals you'd like. These will be created as suggestions that you can log to your day.
                </DialogDescription>
              </DialogHeader>
              {showDevInput && (
                <div className="flex gap-2 items-center">
                  <Input
                    type="password"
                    placeholder="Dev password"
                    value={devPasswordInput}
                    onChange={(e) => setDevPasswordInput(e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                    if (devPasswordInput === DEV_PASSWORD) {
                      setDevUnlocked(true);
                      setShowDevInput(false);
                      toast({ title: "Dev mode unlocked" });
                    } else {
                      toast({ title: "Wrong password", variant: "destructive" });
                    }
                  }}>
                    Unlock
                  </Button>
                </div>
              )}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="aiPrompt">What would you like to eat?</Label>
                  <Textarea
                    id="aiPrompt"
                    placeholder="E.g., 'I want high-protein meals with chicken and vegetables, no dairy' or 'Mediterranean diet with fish'"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={4}
                  />
                </div>
                {!devUnlocked && (
                  <p className="text-xs text-muted-foreground text-center">
                    {DAILY_LIMIT - mealPlanUsageCount > 0
                      ? `${DAILY_LIMIT - mealPlanUsageCount} generation${DAILY_LIMIT - mealPlanUsageCount === 1 ? '' : 's'} remaining today`
                      : "Daily limit reached. Try again after 11:59 PM."}
                  </p>
                )}
                <Button onClick={handleGenerateMealPlan} disabled={generatingPlan || (!devUnlocked && mealPlanUsageCount >= DAILY_LIMIT)} className="w-full">
                  <Sparkles className="mr-2 h-4 w-4" />
                  {generatingPlan ? "Generating..." : "Generate Meal Ideas"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Manual Macros Dialog */}
        <Dialog open={isManualMacrosDialogOpen} onOpenChange={setIsManualMacrosDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
            <DialogHeader>
              <DialogTitle>Manually Input Macros</DialogTitle>
              <DialogDescription>
                Enter calories, macros, and ingredients for your meal
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="manual-calories" className="flex items-center gap-2">
                    Calories *
                    {manualMeal.ingredients.some(ing => ing.calories_per_100g !== undefined) && (
                      <Badge variant="outline" className="text-xs">
                        Auto-calculated
                      </Badge>
                    )}
                  </Label>
                  <Input
                    id="manual-calories"
                    type="number"
                    placeholder="400"
                    value={manualMeal.calories}
                    onChange={(e) => handleCalorieChange(e.target.value, setManualMeal)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Macros will be automatically calculated (30% protein, 40% carbs, 30% fats)
                  </p>
                </div>
                <div>
                  <Label htmlFor="manual-protein" className="flex items-center gap-2">
                    Protein (g)
                    {manualMeal.ingredients.some(ing => ing.protein_per_100g !== undefined) && (
                      <Badge variant="outline" className="text-xs">
                        Auto-calculated
                      </Badge>
                    )}
                  </Label>
                  <Input
                    id="manual-protein"
                    type="number"
                    step="0.1"
                    placeholder="30"
                    value={manualMeal.protein_g}
                    onChange={(e) => setManualMeal({ ...manualMeal, protein_g: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="manual-carbs" className="flex items-center gap-2">
                    Carbs (g)
                    {manualMeal.ingredients.some(ing => ing.carbs_per_100g !== undefined) && (
                      <Badge variant="outline" className="text-xs">
                        Auto-calculated
                      </Badge>
                    )}
                  </Label>
                  <Input
                    id="manual-carbs"
                    type="number"
                    step="0.1"
                    placeholder="40"
                    value={manualMeal.carbs_g}
                    onChange={(e) => setManualMeal({ ...manualMeal, carbs_g: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="manual-fats" className="flex items-center gap-2">
                    Fats (g)
                    {manualMeal.ingredients.some(ing => ing.fats_per_100g !== undefined) && (
                      <Badge variant="outline" className="text-xs">
                        Auto-calculated
                      </Badge>
                    )}
                  </Label>
                  <Input
                    id="manual-fats"
                    type="number"
                    step="0.1"
                    placeholder="15"
                    value={manualMeal.fats_g}
                    onChange={(e) => setManualMeal({ ...manualMeal, fats_g: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Ingredients (in grams)</Label>
                  <div className="space-y-2 mt-2">
                    {manualMeal.ingredients.map((ingredient, idx) => {
                      const hasNutritionData = ingredient.calories_per_100g !== undefined;
                      const ingredientCalories = hasNutritionData ? Math.round((ingredient.calories_per_100g * ingredient.grams) / 100) : null;
                      const ingredientProtein = hasNutritionData ? Math.round(((ingredient.protein_per_100g || 0) * ingredient.grams) / 100 * 10) / 10 : null;
                      const ingredientCarbs = hasNutritionData ? Math.round(((ingredient.carbs_per_100g || 0) * ingredient.grams) / 100 * 10) / 10 : null;
                      const ingredientFats = hasNutritionData ? Math.round(((ingredient.fats_per_100g || 0) * ingredient.grams) / 100 * 10) / 10 : null;

                      return (
                        <div key={idx} className="p-3 bg-muted rounded-md space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{ingredient.name}</span>
                                <span className="text-sm text-muted-foreground">{ingredient.grams}g</span>
                                {!hasNutritionData && (
                                  <Badge variant="outline" className="text-xs">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    No nutrition data
                                  </Badge>
                                )}
                                {hasNutritionData && ingredient.source && (
                                  <Badge variant="outline" className="text-xs text-muted-foreground">
                                    <span className="text-[10px]">Source: {ingredient.source}</span>
                                  </Badge>
                                )}
                              </div>
                              {hasNutritionData && (
                                <div className="text-xs text-muted-foreground mt-1 space-x-3">
                                  <span>Cal: {ingredientCalories}kcal</span>
                                  <span>P: {ingredientProtein?.toFixed(1)}g</span>
                                  <span>C: {ingredientCarbs?.toFixed(1)}g</span>
                                  <span>F: {ingredientFats?.toFixed(1)}g</span>
                                </div>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newIngredients = [...manualMeal.ingredients];
                                newIngredients.splice(idx, 1);
                                setManualMeal({ ...manualMeal, ingredients: newIngredients });
                              }}
                              className="flex-shrink-0"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        placeholder="Ingredient name"
                        value={newIngredient.name}
                        onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="Grams"
                        value={newIngredient.grams}
                        onChange={(e) => setNewIngredient({ ...newIngredient, grams: e.target.value })}
                        className="w-full sm:w-32"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          if (!newIngredient.name.trim() || !newIngredient.grams) {
                            toast({
                              title: "Missing Information",
                              description: "Please enter ingredient name and grams",
                              variant: "destructive",
                            });
                            return;
                          }

                          const ingredientName = newIngredient.name.trim();
                          const grams = parseFloat(newIngredient.grams);

                          if (isNaN(grams) || grams <= 0) {
                            toast({
                              title: "Invalid Amount",
                              description: "Please enter a valid number of grams",
                              variant: "destructive",
                            });
                            return;
                          }

                          setLookingUpIngredient(true);
                          setIngredientLookupError(null);

                          try {
                            // Lookup nutrition data for the ingredient
                            const nutritionData = await lookupIngredientNutrition(ingredientName);

                            if (nutritionData) {
                              // Add ingredient with nutrition data
                              const newIngredients = [
                                ...manualMeal.ingredients,
                                {
                                  name: ingredientName,
                                  grams: grams,
                                  calories_per_100g: nutritionData.calories_per_100g,
                                  protein_per_100g: nutritionData.protein_per_100g,
                                  carbs_per_100g: nutritionData.carbs_per_100g,
                                  fats_per_100g: nutritionData.fats_per_100g,
                                  source: nutritionData.source,
                                }
                              ];

                              // Calculate totals immediately
                              const totalCalories = newIngredients.reduce((sum, ing) =>
                                sum + (ing.calories_per_100g || 0) * ing.grams / 100, 0
                              );
                              const totalProtein = newIngredients.reduce((sum, ing) =>
                                sum + (ing.protein_per_100g || 0) * ing.grams / 100, 0
                              );
                              const totalCarbs = newIngredients.reduce((sum, ing) =>
                                sum + (ing.carbs_per_100g || 0) * ing.grams / 100, 0
                              );
                              const totalFats = newIngredients.reduce((sum, ing) =>
                                sum + (ing.fats_per_100g || 0) * ing.grams / 100, 0
                              );

                              // Update meal with ingredients and calculated totals in one call
                              setManualMeal({
                                ...manualMeal,
                                ingredients: newIngredients,
                                calories: Math.round(totalCalories).toString(),
                                protein_g: Math.round(totalProtein * 10) / 10 !== 0 ? (Math.round(totalProtein * 10) / 10).toString() : "",
                                carbs_g: Math.round(totalCarbs * 10) / 10 !== 0 ? (Math.round(totalCarbs * 10) / 10).toString() : "",
                                fats_g: Math.round(totalFats * 10) / 10 !== 0 ? (Math.round(totalFats * 10) / 10).toString() : "",
                              });

                              setNewIngredient({ name: "", grams: "" });
                              toast({
                                title: "Ingredient Added",
                                description: `Found nutrition data for ${ingredientName}. Meal totals updated.`,
                              });
                            } else {
                              // Not found - open manual nutrition dialog
                              setManualNutritionDialog({
                                open: true,
                                ingredientName: ingredientName,
                                grams: grams,
                                calories_per_100g: "",
                                protein_per_100g: "",
                                carbs_per_100g: "",
                                fats_per_100g: "",
                              });
                            }
                          } catch (error) {
                            console.error("Error looking up ingredient:", error);
                            setIngredientLookupError("Failed to lookup ingredient. Please enter nutrition data manually.");
                            setManualNutritionDialog({
                              open: true,
                              ingredientName: ingredientName,
                              grams: grams,
                              calories_per_100g: "",
                              protein_per_100g: "",
                              carbs_per_100g: "",
                              fats_per_100g: "",
                            });
                          } finally {
                            setLookingUpIngredient(false);
                          }
                        }}
                        disabled={lookingUpIngredient || !newIngredient.name.trim() || !newIngredient.grams}
                        className="flex-shrink-0"
                      >
                        {lookingUpIngredient ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Looking up...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>
                    {ingredientLookupError && (
                      <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
                        {ingredientLookupError}
                      </div>
                    )}
                    {manualMeal.ingredients.length > 0 && (
                      <div className="space-y-1 pt-2 border-t">
                        <div className="flex justify-between items-center font-semibold">
                          <span>Total weight:</span>
                          <span>
                            {manualMeal.ingredients.reduce((sum, ing) => sum + ing.grams, 0)}g
                          </span>
                        </div>
                        {manualMeal.ingredients.some(ing => ing.calories_per_100g !== undefined) && (
                          <div className="text-xs text-muted-foreground">
                            Nutrition totals are calculated automatically above
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsManualMacrosDialogOpen(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Manual Nutrition Input Dialog */}
        <Dialog open={manualNutritionDialog.open} onOpenChange={(open) => {
          if (!open) {
            setManualNutritionDialog({
              open: false,
              ingredientName: "",
              grams: 0,
              calories_per_100g: "",
              protein_per_100g: "",
              carbs_per_100g: "",
              fats_per_100g: "",
            });
            setIngredientLookupError(null);
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enter Nutrition Data</DialogTitle>
              <DialogDescription>
                Could not find nutrition data for "{manualNutritionDialog.ingredientName}" online. Please enter the nutrition values per 100g.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm font-medium">{manualNutritionDialog.ingredientName}</div>
                <div className="text-xs text-muted-foreground">{manualNutritionDialog.grams}g</div>
              </div>
              <div>
                <Label htmlFor="manual-calories">Calories per 100g *</Label>
                <Input
                  id="manual-calories"
                  type="number"
                  placeholder="165"
                  value={manualNutritionDialog.calories_per_100g}
                  onChange={(e) => {
                    const calories = e.target.value;

                    // Update calories immediately
                    setManualNutritionDialog({
                      ...manualNutritionDialog,
                      calories_per_100g: calories,
                    });

                    // Debounce macro calculation
                    debouncedMacroCalculation(calories, (macros) => {
                      setManualNutritionDialog(prev => ({
                        ...prev,
                        protein_per_100g: macros.protein_g,
                        carbs_per_100g: macros.carbs_g,
                        fats_per_100g: macros.fats_g
                      }));
                    });
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Macros will be automatically calculated based on calories
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="manual-protein">Protein (g)</Label>
                  <Input
                    id="manual-protein"
                    type="number"
                    step="0.1"
                    placeholder="31.0"
                    value={manualNutritionDialog.protein_per_100g}
                    onChange={(e) => setManualNutritionDialog({
                      ...manualNutritionDialog,
                      protein_per_100g: e.target.value
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="manual-carbs">Carbs (g)</Label>
                  <Input
                    id="manual-carbs"
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    value={manualNutritionDialog.carbs_per_100g}
                    onChange={(e) => setManualNutritionDialog({
                      ...manualNutritionDialog,
                      carbs_per_100g: e.target.value
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="manual-fats">Fats (g)</Label>
                  <Input
                    id="manual-fats"
                    type="number"
                    step="0.1"
                    placeholder="3.6"
                    value={manualNutritionDialog.fats_per_100g}
                    onChange={(e) => setManualNutritionDialog({
                      ...manualNutritionDialog,
                      fats_per_100g: e.target.value
                    })}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setManualNutritionDialog({
                      open: false,
                      ingredientName: "",
                      grams: 0,
                      calories_per_100g: "",
                      protein_per_100g: "",
                      carbs_per_100g: "",
                      fats_per_100g: "",
                    });
                    setIngredientLookupError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleManualNutritionSubmit}
                >
                  Add Ingredient
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Nutrition Targets Dialog */}
        <Dialog open={isEditTargetsDialogOpen} onOpenChange={setIsEditTargetsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Daily Nutrition Targets</DialogTitle>
              <DialogDescription>
                Set your daily calorie and macro targets. These will override AI recommendations.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-calories">Daily Calories *</Label>
                <Input
                  id="edit-calories"
                  type="number"
                  placeholder="2000"
                  value={editingTargets.calories}
                  onChange={(e) => {
                    const calories = e.target.value;
                    const calorieValue = parseInt(calories) || 0;
                    const macros = calorieValue > 0 ? calculateMacrosFromCalories(calorieValue) : null;

                    setEditingTargets(prev => ({
                      ...prev,
                      calories,
                      ...(macros ? {
                        protein: macros.protein_g,
                        carbs: macros.carbs_g,
                        fats: macros.fats_g,
                      } : {}),
                    }));
                  }}
                  min="1"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Macro targets will be automatically calculated (Recommended: 1200-4000 kcal/day)</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="edit-protein">Protein (g)</Label>
                  <Input
                    id="edit-protein"
                    type="number"
                    step="1"
                    placeholder="150"
                    value={editingTargets.protein}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const calGoal = parseFloat(editingTargets.calories) || 0;
                      if (calGoal > 0) {
                        const adjusted = adjustMacrosToMatchCalories('protein', val, {
                          protein: parseFloat(editingTargets.protein) || 0,
                          carbs: parseFloat(editingTargets.carbs) || 0,
                          fats: parseFloat(editingTargets.fats) || 0,
                        }, calGoal);
                        setEditingTargets(prev => ({
                          ...prev,
                          protein: adjusted.protein.toString(),
                          carbs: adjusted.carbs.toString(),
                          fats: adjusted.fats.toString(),
                        }));
                      } else {
                        setEditingTargets(prev => ({ ...prev, protein: e.target.value }));
                      }
                    }}
                    min="0"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-carbs">Carbs (g)</Label>
                  <Input
                    id="edit-carbs"
                    type="number"
                    step="1"
                    placeholder="200"
                    value={editingTargets.carbs}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const calGoal = parseFloat(editingTargets.calories) || 0;
                      if (calGoal > 0) {
                        const adjusted = adjustMacrosToMatchCalories('carbs', val, {
                          protein: parseFloat(editingTargets.protein) || 0,
                          carbs: parseFloat(editingTargets.carbs) || 0,
                          fats: parseFloat(editingTargets.fats) || 0,
                        }, calGoal);
                        setEditingTargets(prev => ({
                          ...prev,
                          protein: adjusted.protein.toString(),
                          carbs: adjusted.carbs.toString(),
                          fats: adjusted.fats.toString(),
                        }));
                      } else {
                        setEditingTargets(prev => ({ ...prev, carbs: e.target.value }));
                      }
                    }}
                    min="0"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-fats">Fats (g)</Label>
                  <Input
                    id="edit-fats"
                    type="number"
                    step="1"
                    placeholder="65"
                    value={editingTargets.fats}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const calGoal = parseFloat(editingTargets.calories) || 0;
                      if (calGoal > 0) {
                        const adjusted = adjustMacrosToMatchCalories('fats', val, {
                          protein: parseFloat(editingTargets.protein) || 0,
                          carbs: parseFloat(editingTargets.carbs) || 0,
                          fats: parseFloat(editingTargets.fats) || 0,
                        }, calGoal);
                        setEditingTargets(prev => ({
                          ...prev,
                          protein: adjusted.protein.toString(),
                          carbs: adjusted.carbs.toString(),
                          fats: adjusted.fats.toString(),
                        }));
                      } else {
                        setEditingTargets(prev => ({ ...prev, fats: e.target.value }));
                      }
                    }}
                    min="0"
                  />
                </div>
              </div>
              {/* Live macro-calorie summary */}
              {(() => {
                const p = parseFloat(editingTargets.protein) || 0;
                const c = parseFloat(editingTargets.carbs) || 0;
                const f = parseFloat(editingTargets.fats) || 0;
                const calGoal = parseFloat(editingTargets.calories) || 0;
                const macroTotal = p * 4 + c * 4 + f * 9;
                const diff = Math.abs(macroTotal - calGoal);
                const totalMacroG = p + c + f;
                const pPct = totalMacroG > 0 ? Math.round((p / totalMacroG) * 100) : 0;
                const cPct = totalMacroG > 0 ? Math.round((c / totalMacroG) * 100) : 0;
                const fPct = totalMacroG > 0 ? 100 - pPct - cPct : 0;
                const color = calGoal === 0 ? 'text-muted-foreground' : diff <= 20 ? 'text-green-600' : diff <= 50 ? 'text-yellow-600' : 'text-red-600';
                return calGoal > 0 ? (
                  <p className={`text-xs font-medium ${color}`}>
                    Macro total: {Math.round(macroTotal)} / {Math.round(calGoal)} kcal &bull; {pPct}% P / {cPct}% C / {fPct}% F
                  </p>
                ) : null;
              })()}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsEditTargetsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={async () => {
                    // Validation
                    const calories = parseFloat(editingTargets.calories);
                    if (isNaN(calories) || calories <= 0) {
                      toast({
                        title: "Invalid calories",
                        description: "Please enter a valid calorie target (greater than 0)",
                        variant: "destructive",
                      });
                      return;
                    }

                    if (calories < 800 || calories > 5000) {
                      toast({
                        title: "Calorie range warning",
                        description: "Calorie target is outside recommended range (800-5000 kcal/day)",
                        variant: "destructive",
                      });
                      return;
                    }

                    // Soft macro-calorie mismatch warning (does not block save)
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
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) throw new Error("Not authenticated");

                      // Store original profile data for rollback
                      const originalProfile = { ...profile };

                      // Create optimistic update data
                      const optimisticProfile = {
                        ...profile,
                        manual_nutrition_override: true,
                        ai_recommended_calories: Math.round(calories),
                        ai_recommended_protein_g: editingTargets.protein ? parseFloat(editingTargets.protein) : profile?.ai_recommended_protein_g,
                        ai_recommended_carbs_g: editingTargets.carbs ? parseFloat(editingTargets.carbs) : profile?.ai_recommended_carbs_g,
                        ai_recommended_fats_g: editingTargets.fats ? parseFloat(editingTargets.fats) : profile?.ai_recommended_fats_g,
                      };

                      // Apply optimistic update immediately
                      setProfile(optimisticProfile);
                      setIsEditTargetsDialogOpen(false);

                      // Show immediate success feedback
                      toast({
                        title: "Targets updated!",
                        description: "Your daily nutrition targets have been set.",
                      });

                      // Create the database update operation
                      const updateOperation = async () => {
                        // Build update data object with explicit typing
                        const updateData: {
                          manual_nutrition_override: boolean;
                          ai_recommended_calories: number;
                          ai_recommended_protein_g?: number;
                          ai_recommended_carbs_g?: number;
                          ai_recommended_fats_g?: number;
                        } = {
                          manual_nutrition_override: true,
                          ai_recommended_calories: Math.round(calories),
                        };

                        // Only update macros if provided
                        if (editingTargets.protein) {
                          const protein = parseFloat(editingTargets.protein);
                          if (!isNaN(protein) && protein >= 0) {
                            updateData.ai_recommended_protein_g = protein;
                          }
                        }
                        if (editingTargets.carbs) {
                          const carbs = parseFloat(editingTargets.carbs);
                          if (!isNaN(carbs) && carbs >= 0) {
                            updateData.ai_recommended_carbs_g = carbs;
                          }
                        }
                        if (editingTargets.fats) {
                          const fats = parseFloat(editingTargets.fats);
                          if (!isNaN(fats) && fats >= 0) {
                            updateData.ai_recommended_fats_g = fats;
                          }
                        }

                        const { error } = await supabase
                          .from("profiles")
                          .update(updateData)
                          .eq("id", user.id);

                        if (error) {
                          console.error("Supabase update error:", error);
                          // Provide more helpful error message for schema issues
                          if (error.code === "PGRST204") {
                            throw new Error(
                              "Database schema is missing required columns. Please run the migration: " +
                              "20251122230028_add_ai_nutrition_targets.sql and " +
                              "20251124213104_add_manual_nutrition_override.sql in your Supabase SQL Editor."
                            );
                          }
                          throw error;
                        }
                      };

                      // Execute optimistic update
                      const update = createNutritionTargetUpdate(
                        user.id,
                        optimisticProfile,
                        originalProfile,
                        updateOperation
                      );

                      update.onError = (error: any, rollbackData: any) => {
                        // Rollback on error
                        setProfile(rollbackData);
                        console.error("Error updating targets:", error);
                        toast({
                          title: "Error",
                          description: error.message || "Failed to update nutrition targets. Changes have been reverted.",
                          variant: "destructive",
                        });
                      };

                      // Execute the background update
                      const success = await optimisticUpdateManager.executeOptimisticUpdate(update);

                      if (success) {
                        // Invalidate related caches on successful update
                        nutritionCache.remove(user.id, 'profile');
                        nutritionCache.remove(user.id, 'macroGoals');
                      }

                    } catch (error: any) {
                      console.error("Error in optimistic update setup:", error);
                      toast({
                        title: "Error",
                        description: error.message || "Failed to update nutrition targets",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Save Targets
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedDate(format(subDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}
          className="flex-shrink-0"
        >
          ←
        </Button>
        <div className="flex items-center gap-2 flex-shrink-0">
          <CalendarIcon className="h-4 w-4" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-auto min-w-[140px]"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}
          className="flex-shrink-0"
        >
          →
        </Button>
        <Button
          variant="ghost"
          onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
          className="flex-shrink-0"
        >
          Today
        </Button>
      </div>

      {/* Nutrition Targets Settings Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Daily Nutrition Targets
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const currentCalories = dailyCalorieTarget;
                const currentProtein = aiMacroGoals?.proteinGrams || 0;
                const currentCarbs = aiMacroGoals?.carbsGrams || 0;
                const currentFats = aiMacroGoals?.fatsGrams || 0;

                setEditingTargets({
                  calories: currentCalories.toString(),
                  protein: currentProtein.toString(),
                  carbs: currentCarbs.toString(),
                  fats: currentFats.toString(),
                });
                setIsEditTargetsDialogOpen(true);
              }}
              className="flex items-center gap-1"
            >
              <Edit2 className="h-3 w-3" />
              Edit Targets
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Calories - prominent top row */}
            <div className="text-center p-3 rounded-lg bg-primary/5">
              <p className="text-xs text-muted-foreground mb-1">Calories</p>
              <p className="text-2xl font-bold">{dailyCalorieTarget}</p>
              <p className="text-xs text-muted-foreground">kcal/day</p>
            </div>
            {/* Macros - 3 columns */}
            {aiMacroGoals ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Protein</p>
                  <p className="text-lg font-semibold">{Math.round(aiMacroGoals.proteinGrams)}g</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Carbs</p>
                  <p className="text-lg font-semibold">{Math.round(aiMacroGoals.carbsGrams)}g</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Fats</p>
                  <p className="text-lg font-semibold">{Math.round(aiMacroGoals.fatsGrams)}g</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No macro targets set</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <CalorieBudgetIndicator
        dailyTarget={dailyCalorieTarget}
        consumed={totalCalories}
        safetyStatus={safetyStatus}
        safetyMessage={safetyMessage}
      />

      <MacroRings
        protein={totalProtein}
        carbs={totalCarbs}
        fats={totalFats}
        proteinGoal={aiMacroGoals?.proteinGrams}
        carbsGoal={aiMacroGoals?.carbsGrams}
        fatsGoal={aiMacroGoals?.fatsGrams}
      />

      {/* Grouped Meals Display */}
      <Tabs defaultValue="logged" className="w-full">
        <TabsList>
          <TabsTrigger value="logged">Today's Logged Meals</TabsTrigger>
          <TabsTrigger value="ideas">Meal Plan Ideas</TabsTrigger>
        </TabsList>

        <TabsContent value="logged" className="space-y-6 mt-6">
          {meals.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">No meals logged for this day</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button onClick={() => setIsAiDialogOpen(true)} className="whitespace-nowrap">
                    <Sparkles className="mr-2 h-4 w-4" />
                    AI Meal Ideas
                  </Button>
                  <Button variant="outline" onClick={() => setIsManualDialogOpen(true)} className="whitespace-nowrap">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Meal
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {["breakfast", "lunch", "dinner", "snack"].map((type) => {
                const groupMeals = meals.filter((m) => (m.meal_type || "other").toLowerCase() === type);
                if (groupMeals.length === 0) return null;

                const groupCalories = groupMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
                const groupProtein = groupMeals.reduce((sum, m) => sum + (m.protein_g || 0), 0);
                const groupCarbs = groupMeals.reduce((sum, m) => sum + (m.carbs_g || 0), 0);
                const groupFats = groupMeals.reduce((sum, m) => sum + (m.fats_g || 0), 0);

                return (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between py-2 px-1">
                      <h3 className="capitalize text-xs font-semibold uppercase tracking-widest text-muted-foreground">{type}</h3>
                      <div className="text-xs text-muted-foreground flex gap-2">
                        <span className="font-medium text-primary">{Math.round(groupCalories)} kcal</span>
                        <span className="text-blue-500">{Math.round(groupProtein)}p</span>
                        <span className="text-orange-500">{Math.round(groupCarbs)}c</span>
                        <span className="text-purple-500">{Math.round(groupFats)}f</span>
                      </div>
                    </div>
                    <div>
                      {groupMeals.map((meal) => (
                        <MealCard
                          key={meal.id}
                          meal={meal}
                          onDelete={() => initiateDeleteMeal(meal)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Fallback for any meals with unknown types */}
              {meals.filter(m => !["breakfast", "lunch", "dinner", "snack"].includes((m.meal_type || "").toLowerCase())).length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center py-2 px-1">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Other</h3>
                  </div>
                  <div>
                    {meals.filter(m => !["breakfast", "lunch", "dinner", "snack"].includes((m.meal_type || "").toLowerCase())).map((meal) => (
                      <MealCard
                        key={meal.id}
                        meal={meal}
                        onDelete={() => initiateDeleteMeal(meal)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="ideas" className="space-y-4 mt-6">
          <ErrorBoundary>
            {mealPlanIdeas.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">No meal plan ideas generated yet</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Click "AI Meal Plan" to generate personalized meal suggestions
                  </p>
                  <Button onClick={() => setIsAiDialogOpen(true)}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Meal Ideas
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Generated Meal Ideas</h3>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => saveMealIdeasToDatabase(mealPlanIdeas)}
                      disabled={savingAllMeals || loggingMeal !== null}
                      variant="default"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Save All Meals
                    </Button>
                    <Button
                      onClick={clearMealIdeas}
                      variant="outline"
                      size="sm"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Clear Ideas
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mealPlanIdeas.map((meal) => (
                    <Card key={meal.id}>
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-xl font-semibold">{meal.meal_name}</h3>
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <Badge variant="outline">{meal.calories} cal</Badge>
                              <Badge variant="outline">{meal.protein_g}g protein</Badge>
                              <Badge variant="outline">{meal.carbs_g}g carbs</Badge>
                              <Badge variant="outline">{meal.fats_g}g fats</Badge>
                              <Badge>{meal.meal_type}</Badge>
                            </div>
                          </div>
                        </div>
                        {meal.portion_size && (
                          <p className="text-sm text-muted-foreground mb-2">
                            <strong>Portion:</strong> {meal.portion_size}
                          </p>
                        )}
                        {meal.ingredients && Array.isArray(meal.ingredients) && meal.ingredients.length > 0 && (
                          <div className="mb-2">
                            <p className="text-sm font-medium mb-1">Ingredients:</p>
                            <ul className="text-sm text-muted-foreground list-disc list-inside">
                              {meal.ingredients.map((ing: Ingredient, idx: number) => (
                                <li key={idx}>{ing.name} - {ing.grams}g</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {meal.recipe_notes && (
                          <div className="mb-4">
                            <p className="text-sm font-medium mb-1">Recipe:</p>
                            <p className="text-sm text-muted-foreground">{meal.recipe_notes}</p>
                          </div>
                        )}
                        <Button onClick={() => handleLogMealIdea(meal)} disabled={loggingMeal === meal.id || savingAllMeals} className="w-full">
                          <Plus className="mr-2 h-4 w-4" />
                          Log This Meal
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </ErrorBoundary>
        </TabsContent>
      </Tabs>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteMeal}
        title="Delete Meal Entry"
        itemName={mealToDelete ? `${mealToDelete.meal_name} (${mealToDelete.calories} cal)` : undefined}
      />
    </div>
  );
}
